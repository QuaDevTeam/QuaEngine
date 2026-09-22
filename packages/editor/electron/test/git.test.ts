import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectGit } from '../src/project-service/git.js'

const execute = promisify(execFile)
const roots: string[] = []
const services: ProjectGit[] = []
afterEach(async () => {
  services.splice(0).forEach(service => service.close())
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function temporary() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-git-')))
  roots.push(root)
  return root
}
async function git(root: string, ...args: string[]) {
  return (await execute('git', args, { cwd: root })).stdout
}
async function initialize(root: string) {
  await git(root, 'init', '-b', 'main')
  await git(root, 'config', 'user.name', 'Editor Test')
  await git(root, 'config', 'user.email', 'editor@example.invalid')
  await git(root, 'config', 'commit.gpgsign', 'false')
  await git(root, 'config', 'core.hooksPath', join(root, '.git', 'empty-hooks'))
}
function service(root: string) {
  const instance = new ProjectGit(() => root, () => {})
  services.push(instance)
  return instance
}

describe('local editor Git workflow', () => {
  it('handles unborn branches, literal Unicode paths, staged vs disk diffs and commits only the index', async () => {
    const root = await temporary()
    const api = service(root)
    expect((await api.status(root)).state).toBe('not-repository')
    await initialize(root)
    const path = '[场景] 一\n二.qs'
    await writeFile(join(root, path), 'Rin: first\n')
    expect(await api.status(root)).toMatchObject({ state: 'ready', branch: 'main', oid: undefined, changes: [{ path, index: '?', worktree: '?' }] })
    await api.stage(root, path, true)
    await writeFile(join(root, path), 'Rin: second\n')
    expect(await api.diff(root, path, true)).toMatchObject({ before: '', after: 'Rin: first\n' })
    expect(await api.diff(root, path, false)).toMatchObject({ before: 'Rin: first\n', after: 'Rin: second\n' })
    await api.stage(root, path, false)
    expect((await api.status(root)).changes[0].index).toBe('?')
    await api.stage(root, path, true)
    await writeFile(join(root, path), 'Rin: third\n')
    await api.commit(root, 'feat(story): add scene')
    expect(await git(root, 'show', `HEAD:${path}`)).toBe('Rin: second\n')
    expect(await readFile(join(root, path), 'utf8')).toBe('Rin: third\n')
    await api.stage(root, path, true)
    await api.stage(root, path, false)
    expect((await api.status(root)).changes[0]).toMatchObject({ index: '.', worktree: 'M' })
    await expect(api.stage(root, '../outside', true)).rejects.toThrow('变更列表')
    await expect(api.status('/old-root')).rejects.toThrow('项目已切换')
  })

  it('scopes nested project changes and refuses commits containing staged files outside that project', async () => {
    const root = await temporary()
    await initialize(root)
    const project = join(root, 'demo')
    await mkdir(project)
    await writeFile(join(root, 'outside.txt'), 'outside\n')
    await writeFile(join(project, 'scene.qs'), 'inside\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'chore(test): initialize')
    const api = service(project)
    await writeFile(join(root, 'outside.txt'), 'outside changed\n')
    await writeFile(join(project, 'scene.qs'), 'inside changed\n')
    await git(root, 'add', 'outside.txt')
    expect((await api.status(project)).changes.map(entry => entry.path)).toEqual(['scene.qs'])
    await api.stage(project, 'scene.qs', true)
    await expect(api.commit(project, 'feat(story): change scene')).rejects.toThrow('项目以外')
    await git(root, 'restore', '--staged', 'outside.txt')
    await api.commit(project, 'feat(story): change scene')
    expect(await git(root, 'show', 'HEAD:outside.txt')).toBe('outside\n')
    expect((await api.switchBranch(project, 'feature/story', true)).branch).toBe('feature/story')
    expect(await readFile(join(root, 'outside.txt'), 'utf8')).toBe('outside changed\n')
    await writeFile(join(root, 'outside.txt'), 'outside\n')
    expect(await api.branches(project)).toEqual(['feature/story', 'main'])
    expect((await api.switchBranch(project, 'main', false)).branch).toBe('main')
    await git(root, 'mv', 'outside.txt', 'demo/inside.txt')
    expect((await api.status(project)).changes[0].outsideRename).toBe(true)
    await expect(api.commit(project, 'refactor(test): move outside file')).rejects.toThrow('项目以外')
  })

  it('lets Git carry safe changes and refuses overwritten tracked or untracked files without losing data', async () => {
    const root = await temporary()
    await initialize(root)
    await writeFile(join(root, 'scene.qs'), 'base\n')
    await writeFile(join(root, 'keep.qs'), 'unchanged\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'chore(test): base')
    await git(root, 'switch', '-c', 'other')
    await writeFile(join(root, 'scene.qs'), 'other\n')
    await writeFile(join(root, 'new.qs'), 'tracked on other\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'chore(test): other')
    await git(root, 'switch', 'main')
    const api = service(root)
    await writeFile(join(root, 'new.qs'), 'local untracked\n')
    await expect(api.switchBranch(root, 'other', false)).rejects.toThrow('would be overwritten')
    expect((await api.status(root)).branch).toBe('main')
    expect(await readFile(join(root, 'new.qs'), 'utf8')).toBe('local untracked\n')
    await rm(join(root, 'new.qs'))
    await writeFile(join(root, 'scene.qs'), 'local tracked\n')
    await expect(api.switchBranch(root, 'other', false)).rejects.toThrow('would be overwritten')
    expect(await readFile(join(root, 'scene.qs'), 'utf8')).toBe('local tracked\n')
    await writeFile(join(root, 'scene.qs'), 'base\n')
    await writeFile(join(root, 'keep.qs'), 'safe local change\n')
    await api.stage(root, 'keep.qs', true)
    expect((await api.switchBranch(root, 'other', false)).branch).toBe('other')
    expect(await readFile(join(root, 'keep.qs'), 'utf8')).toBe('safe local change\n')
    expect(await git(root, 'show', ':keep.qs')).toBe('safe local change\n')
  })

  it('reads renames and binary files, does not follow symlinks, and supports linked worktrees and detached HEAD', async () => {
    const root = await temporary()
    await initialize(root)
    await writeFile(join(root, 'scene.qs'), 'Rin: hello\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'chore(test): initialize')
    const api = service(root)
    await git(root, 'mv', 'scene.qs', 'renamed scene.qs')
    expect((await api.status(root)).changes[0]).toMatchObject({ index: 'R', previousPath: 'scene.qs' })
    expect(await api.diff(root, 'renamed scene.qs', true)).toMatchObject({ before: 'Rin: hello\n', after: 'Rin: hello\n' })
    await api.stage(root, 'renamed scene.qs', false)
    const outside = await temporary()
    await writeFile(join(outside, 'secret'), 'not exposed')
    await symlink(join(outside, 'secret'), join(root, 'link'))
    expect((await api.diff(root, 'link', false)).after).toBe(join(outside, 'secret'))
    await writeFile(join(root, 'image.png'), Buffer.from([0, 1, 2]))
    expect((await api.diff(root, 'image.png', false)).binary).toBe(true)
    const linked = join(outside, 'linked')
    await git(root, 'worktree', 'add', '-b', 'linked', linked)
    const linkedApi = service(linked)
    expect((await linkedApi.status(linked)).branch).toBe('linked')
    await git(linked, 'switch', '--detach')
    expect(await linkedApi.status(linked)).toMatchObject({ branch: '(detached)' })
  })

  it('surfaces merge conflicts and rejects committing an unresolved index', async () => {
    const root = await temporary()
    await initialize(root)
    await writeFile(join(root, 'scene.qs'), 'original\n')
    await git(root, 'add', '.')
    await git(root, 'commit', '-m', 'chore(test): initialize')
    await git(root, 'switch', '-c', 'other')
    await writeFile(join(root, 'scene.qs'), 'other\n')
    await git(root, 'commit', '-am', 'chore(test): other')
    await git(root, 'switch', 'main')
    await writeFile(join(root, 'scene.qs'), 'main\n')
    await git(root, 'commit', '-am', 'chore(test): main')
    await expect(git(root, 'merge', 'other')).rejects.toThrow()
    const api = service(root)
    expect((await api.status(root)).changes[0]).toMatchObject({ conflict: true, index: 'U', worktree: 'U' })
    await expect(api.commit(root, 'fix(test): resolve')).rejects.toThrow('合并冲突')
  })
})
