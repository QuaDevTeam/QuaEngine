import type { EditorProject, EditorSearchMatch, EditorSearchRequest, EditorSearchResult } from '@quajs/editor-core'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { rgPath } from '@vscode/ripgrep'
import { TEXT_EXTENSIONS } from './files.js'

function splitGlobs(value: string): string[] {
  const globs: string[] = []
  let start = 0
  let depth = 0
  let escaped = false
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '{' || character === '[') {
      depth++
    }
    else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1)
    }
    else if (character === ',' && depth === 0) {
      globs.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  globs.push(value.slice(start).trim())
  return globs.filter(Boolean)
}

/** One cancellable native search, independent of the inspection/language worker queue. */
export class ProjectSearch {
  private active?: { process: ChildProcess, cancel: () => void }

  cancel(): void {
    this.active?.cancel()
  }

  async search(project: EditorProject | undefined, request: EditorSearchRequest): Promise<EditorSearchResult> {
    this.cancel()
    if (!project || request?.root !== project.root)
      throw new Error('项目已切换，请重新搜索。')
    if (typeof request.query !== 'string' || request.query.length > 2048 || typeof request.include !== 'string' || typeof request.exclude !== 'string' || request.include.length > 2048 || request.exclude.length > 2048)
      throw new Error('搜索条件无效或过长。')
    if (!request.query)
      return { matches: [], truncated: false, cancelled: false }
    const args = ['--json', '--no-config', '--no-ignore', '--max-filesize', '2M', '--max-columns', '2000', '--threads', '2', '--color', 'never', '--type-add', `qua:*.{${[...TEXT_EXTENSIONS].map(extension => extension.slice(1)).join(',')}}`, '--type', 'qua']
    if (!request.regex)
      args.push('--fixed-strings')
    if (!request.caseSensitive)
      args.push('--ignore-case')
    if (request.wholeWord)
      args.push('--word-regexp')
    for (const directory of ['node_modules', 'dist', 'target', 'coverage', 'build'])
      args.push('--glob', `!**/${directory}/**`)
    for (const glob of splitGlobs(request.include)) args.push('--glob', glob)
    for (const glob of splitGlobs(request.exclude)) args.push('--glob', `!${glob.replace(/^!/, '')}`)
    args.push('--', request.query, '.')
    // Only return indexed editable paths, with no symlink traversal (rg's default).
    const allowed = new Set(project.files)
    return new Promise((resolve, reject) => {
      const child = spawn(rgPath, args, { cwd: project.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const matches: EditorSearchMatch[] = []
      let pending = ''
      let errors = ''
      let cancelled = false
      let truncated = false
      let bytes = 0
      const active = { process: child, cancel: () => {
        cancelled = true
        child.kill()
      } }
      this.active = active
      const timer = setTimeout(() => {
        truncated = true
        child.kill()
      }, 10000)
      const finish = (): void => {
        clearTimeout(timer)
        if (this.active === active)
          this.active = undefined
      }
      child.on('error', (error) => {
        finish()
        reject(error)
      })
      child.stderr.on('data', (data) => {
        errors = (errors + String(data)).slice(-4000)
      })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (data: string) => {
        bytes += Buffer.byteLength(data)
        if (cancelled || truncated)
          return
        if (bytes > 8 * 1024 * 1024) {
          truncated = true
          child.kill()
          return
        }
        pending += data
        while (pending.includes('\n')) {
          const newline = pending.indexOf('\n')
          const line = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          const event = JSON.parse(line) as { type: string, data: { path: { text?: string }, lines: { text?: string }, line_number: number, submatches: { start: number, end: number }[] } }
          if (event.type !== 'match')
            continue
          const path = event.data.path.text?.replace(/^\.\//, '').replaceAll('\\', '/')
          const text = event.data.lines.text?.replace(/[\r\n]+$/, '')
          if (!path || !allowed.has(path) || text === undefined)
            continue
          const buffer = Buffer.from(text)
          let previousByte = 0
          let previousColumn = 0
          for (const match of event.data.submatches) {
            if (matches.length >= 1000) {
              truncated = true
              child.kill()
              break
            }
            const start = previousColumn + buffer.subarray(previousByte, match.start).toString('utf8').length
            const end = start + buffer.subarray(match.start, match.end).toString('utf8').length
            previousByte = match.end
            previousColumn = end
            // rg JSON does not enforce --max-columns. Bound each transported snippet,
            // including repeated matches on a single multi-megabyte source line.
            const from = Math.max(0, start - 60)
            const to = Math.min(text.length, Math.min(end, start + 240) + 180)
            matches.push({ path, line: event.data.line_number, column: start + 1, text: text.slice(from, to), start: start - from, end: Math.min(end, to) - from })
          }
        }
      })
      child.on('close', (code) => {
        finish()
        if (!cancelled && !truncated && code !== 0 && code !== 1)
          reject(new Error(errors.trim() || '搜索进程意外退出。'))
        else resolve({ matches, cancelled, truncated })
      })
    })
  }
}
