import type { FSWatcher } from 'node:fs'
import { watch } from 'node:fs'
import { join, relative } from 'node:path'
import { eslintWatchFile } from './eslint.js'
import { ignoredPath } from './files.js'

/** Bounded directory subscriptions: no recursive dependency/generated/symlink watching. */
export class ProjectWatcher {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly changes = new Set<string>()
  private timer?: ReturnType<typeof setTimeout>
  private closed = false
  constructor(private readonly root: string, private readonly changed: (paths: string[]) => void) {}

  update(directories: string[]): string[] {
    const failures: string[] = []
    const wanted = new Set(directories)
    for (const [path, watcher] of this.watchers) {
      if (!wanted.has(path)) {
        watcher.close()
        this.watchers.delete(path)
      }
    }
    for (const path of wanted) {
      if (this.closed || this.watchers.has(path))
        continue
      try {
        const watcher = watch(path, { persistent: false }, (_event, filename) => {
          const local = relative(this.root, filename ? join(path, filename.toString()) : path).replaceAll('\\', '/')
          if (!ignoredPath(local) || (eslintWatchFile(local) && !ignoredPath(local.split('/').slice(0, -1).join('/'))))
            this.record(local)
        })
        watcher.on('error', () => {
          watcher.close()
          this.watchers.delete(path)
          this.record('')
        })
        this.watchers.set(path, watcher)
      }
      catch {
        failures.push(relative(this.root, path) || '.')
      }
    }
    return failures
  }

  close(): void {
    this.closed = true
    clearTimeout(this.timer)
    this.changes.clear()
    for (const watcher of this.watchers.values())
      watcher.close()
    this.watchers.clear()
  }

  private record(path: string): void {
    if (this.closed)
      return
    if (this.changes.size >= 256) {
      this.changes.clear()
      this.changes.add('')
    }
    if (!this.changes.has(''))
      this.changes.add(path)
    // Fixed debounce window prevents constant writes from starving refresh forever.
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      const paths = [...this.changes]
      this.changes.clear()
      this.changed(paths)
    }, 350)
  }
}
