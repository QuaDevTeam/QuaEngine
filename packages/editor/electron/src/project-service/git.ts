import type { EditorGitChange, EditorGitDiff, EditorGitState } from '@quajs/editor-core'
import type { ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { lstat, readFile, readlink, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const MAX_TEXT = 2 * 1024 * 1024
const empty = (root: string): EditorGitState => ({ root, state: 'not-repository', ahead: 0, behind: 0, changes: [] })

/** Local Git only. Commands run without a shell and serialize index/worktree writes. */
export class ProjectGit {
  private pending: Promise<unknown> = Promise.resolve()
  private readonly children = new Set<ChildProcess>()
  private closed = false
  private queued = 0
  get busy(): boolean { return this.queued > 0 }

  constructor(private readonly currentRoot: () => string | undefined, private readonly changed: (state: EditorGitState) => void) {}

  status(root: string): Promise<EditorGitState> {
    return this.queue(root, () => this.publish(root))
  }

  diff(root: string, path: string, staged: boolean): Promise<EditorGitDiff> {
    return this.queue(root, async () => {
      const state = await this.repository(root)
      const entry = this.entry(state, path)
      if (entry.submodule || entry.outsideRename)
        throw new Error('此变更涉及子模块或项目目录外的重命名，请在 Git 客户端中查看。')
      const repoPath = this.repoPath(state, path)
      const previous = staged && entry.previousPath ? this.repoPath(state, entry.previousPath) : repoPath
      const before = staged
        ? entry.index === 'A' || !state.oid ? Buffer.alloc(0) : await this.blob(state.repositoryRoot!, `HEAD:${previous}`)
        : entry.index === '?' ? Buffer.alloc(0) : await this.blob(state.repositoryRoot!, `:${repoPath}`)
      const after = staged
        ? entry.index === 'D' ? Buffer.alloc(0) : await this.blob(state.repositoryRoot!, `:${repoPath}`)
        : entry.worktree === 'D' ? Buffer.alloc(0) : await this.workingFile(root, path)
      const binary = before.includes(0) || after.includes(0)
      return { path, staged, binary, before: binary ? '' : before.toString('utf8'), after: binary ? '' : after.toString('utf8') }
    })
  }

  stage(root: string, path: string, staged: boolean): Promise<EditorGitState> {
    return this.queue(root, async () => {
      const state = await this.repository(root)
      const entry = this.entry(state, path)
      if (entry.outsideRename || entry.submodule)
        throw new Error('子模块及跨项目目录的重命名请在 Git 客户端中处理。')
      const paths = [path, ...(entry.previousPath ? [entry.previousPath] : [])].map(path => this.repoPath(state, path))
      this.assertRoot(root)
      if (staged) {
        await this.run(state.repositoryRoot!, ['add', '--', ...paths])
      }
      else if (state.oid) {
        await this.run(state.repositoryRoot!, ['restore', '--staged', '--source=HEAD', '--', ...paths])
      }
      else {
        // An unborn index has no HEAD to restore. Keep an existing worktree copy.
        if (entry.worktree === 'D')
          throw new Error('磁盘文件已删除，请先恢复暂存区内容，再取消暂存。')
        await lstat(resolve(root, path))
        await this.run(state.repositoryRoot!, ['rm', '--cached', '--force', '--ignore-unmatch', '--', ...paths])
      }
      return this.publish(root)
    })
  }

  commit(root: string, message: string): Promise<EditorGitState> {
    return this.queue(root, async () => {
      if (typeof message !== 'string' || !message.trim() || message.length > 10000 || message.includes('\0'))
        throw new Error('请输入有效的提交说明。')
      const state = await this.repository(root)
      if (state.changes.some(entry => entry.conflict))
        throw new Error('请先解决合并冲突。')
      const paths = (await this.run(state.repositoryRoot!, ['diff', '--cached', '--name-only', '--no-renames', '-z'])).toString('utf8').split('\0').filter(Boolean)
      if (!paths.length)
        throw new Error('没有已暂存的变更。')
      if (paths.some(path => this.localPath(state, path) === undefined))
        throw new Error('仓库中还暂存了当前项目以外的文件。请先在 Git 客户端中处理，避免一并提交。')
      this.assertRoot(root)
      await this.run(state.repositoryRoot!, ['commit', '-m', message.trim()], 60000)
      return this.publish(root)
    })
  }

  branches(root: string): Promise<string[]> {
    return this.queue(root, async () => {
      const state = await this.repository(root)
      return this.branchNames(state.repositoryRoot!)
    })
  }

  switchBranch(root: string, branch: string, create: boolean): Promise<EditorGitState> {
    return this.queue(root, async () => {
      if (typeof branch !== 'string' || !branch || branch.length > 200 || branch.startsWith('-') || branch.includes('\0'))
        throw new Error('无效的分支名称。')
      const state = await this.repository(root)
      const repository = state.repositoryRoot!
      await this.run(repository, ['check-ref-format', '--branch', branch])
      if (!create && !(await this.branchNames(repository)).includes(branch))
        throw new Error('请选择现有的本地分支。')
      this.assertRoot(root)
      await this.run(repository, ['switch', ...(create ? ['-c'] : ['--no-guess']), branch])
      return this.publish(root)
    })
  }

  close(): void {
    this.closed = true
    for (const child of this.children) child.kill('SIGTERM')
  }

  private async publish(root: string): Promise<EditorGitState> {
    const state = await this.readState(root)
    this.assertRoot(root)
    this.changed(state)
    return state
  }

  private async repository(root: string): Promise<EditorGitState> {
    const state = await this.readState(root)
    if (state.state !== 'ready')
      throw new Error(state.message || '当前项目不在 Git 仓库中。')
    return state
  }

  private async readState(root: string): Promise<EditorGitState> {
    const state = empty(root)
    try {
      state.repositoryRoot = await realpath((await this.run(root, ['rev-parse', '--show-toplevel'])).toString('utf8').trim())
      const prefix = relative(state.repositoryRoot, root).split(sep).join('/')
      if (prefix.startsWith('..') || isAbsolute(prefix))
        throw new Error('仓库目录与当前项目不匹配。')
      // Detect cross-directory renames before filtering to the opened project.
      const output = await this.run(state.repositoryRoot, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
      state.state = 'ready'
      const records = output.toString('utf8').split('\0')
      for (let index = 0; index < records.length; index++) {
        const record = records[index]
        if (record.startsWith('# branch.head ')) {
          state.branch = record.slice(14)
        }
        else if (record.startsWith('# branch.oid ')) {
          state.oid = record.slice(13) === '(initial)' ? undefined : record.slice(13)
        }
        else if (record.startsWith('# branch.upstream ')) {
          state.upstream = record.slice(18)
        }
        else if (record.startsWith('# branch.ab ')) {
          const [, ahead, behind] = /\+(\d+) -(\d+)/u.exec(record) || []
          state.ahead = Number(ahead) || 0
          state.behind = Number(behind) || 0
        }
        else if (/^[12u?] /u.test(record)) {
          const fields = record.split(' ')
          const type = fields[0]
          const path = type === '?' ? record.slice(2) : fields.slice(type === '1' ? 8 : type === '2' ? 9 : 10).join(' ')
          const oldPath = type === '2' ? records[++index] : undefined
          const destination = this.localPath(state, path)
          const previousPath = oldPath ? this.localPath(state, oldPath) : undefined
          const local = destination ?? previousPath
          if (local === undefined)
            continue
          state.changes.push({ path: local, previousPath, index: type === '?' ? '?' : fields[1][0], worktree: type === '?' ? '?' : fields[1][1], conflict: type === 'u', submodule: type !== '?' && fields[2] !== 'N...', outsideRename: Boolean(oldPath && (!previousPath || !destination)) })
        }
      }
      return state
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('not a git repository'))
        return { ...empty(root), message: '当前项目不在 Git 仓库中。' }
      return { ...empty(root), state: message.includes('ENOENT') ? 'unavailable' : 'error', message: message.includes('ENOENT') ? '未找到 Git，请安装 Git 后刷新。' : message }
    }
  }

  private entry(state: EditorGitState, path: string): EditorGitChange {
    const entry = state.changes.find(entry => entry.path === path)
    if (!entry)
      throw new Error('此文件已不在变更列表中，请刷新。')
    return entry
  }

  private localPath(state: EditorGitState, path: string): string | undefined {
    const local = relative(state.root, resolve(state.repositoryRoot!, path)).split(sep).join('/')
    return local && local !== '..' && !local.startsWith('../') && !isAbsolute(local) ? local : undefined
  }

  private repoPath(state: EditorGitState, path: string): string {
    return relative(state.repositoryRoot!, resolve(state.root, path)).split(sep).join('/')
  }

  private async branchNames(repository: string): Promise<string[]> {
    return (await this.run(repository, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).toString('utf8').split('\n').filter(Boolean)
  }

  private async blob(repository: string, specifier: string): Promise<Buffer> {
    const size = Number((await this.run(repository, ['cat-file', '-s', specifier])).toString('utf8'))
    if (!Number.isFinite(size) || size > MAX_TEXT)
      throw new Error('文件超过 2 MB 文本差异预览上限。')
    return this.run(repository, ['cat-file', 'blob', specifier])
  }

  private async workingFile(root: string, path: string): Promise<Buffer> {
    const target = resolve(root, path)
    const metadata = await lstat(target)
    if (metadata.isSymbolicLink())
      return Buffer.from(await readlink(target))
    const canonical = await realpath(target)
    const local = relative(root, canonical)
    if (local.startsWith(`..${sep}`) || local === '..' || isAbsolute(local))
      throw new Error('只能读取当前项目内的文件。')
    if (!metadata.isFile() || metadata.size > MAX_TEXT)
      throw new Error('文件超过 2 MB 文本差异预览上限。')
    return readFile(canonical)
  }

  private assertRoot(root: string): void {
    if (this.closed || root !== this.currentRoot())
      throw new Error('项目已切换或编辑器已关闭。')
  }

  private queue<T>(root: string, action: () => Promise<T>): Promise<T> {
    this.queued++
    const result = this.pending.catch(() => {}).then(() => {
      this.assertRoot(root)
      return action()
    }).finally(() => { this.queued-- })
    this.pending = result
    return result
  }

  private run(cwd: string, args: string[], timeout = 15000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = execFile('git', ['--no-optional-locks', '--literal-pathspecs', '-c', 'color.ui=false', ...args], {
        cwd,
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'buffer',
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      }, (error, stdout, stderr) => {
        this.children.delete(child)
        if (error)
          reject(new Error(stderr.toString('utf8').trim() || error.message))
        else resolve(stdout)
      })
      this.children.add(child)
    })
  }
}
