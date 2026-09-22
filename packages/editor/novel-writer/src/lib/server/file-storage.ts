import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'

const pending = new Map<string, Promise<void>>()

/** The desktop service is the sole writer; serialize operations on each file. */
export function withFileLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const result = (pending.get(path) ?? Promise.resolve()).then(operation)
  const settled = result.then(() => {}, () => {})
  pending.set(path, settled)
  void settled.then(() => { if (pending.get(path) === settled) pending.delete(path) })
  return result
}

/** Readers see either the previous complete snapshot or the next complete one. */
export function writeAtomic(path: string, content: string): Promise<void> {
  return withFileLock(path, async () => {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
    }
    finally {
      await rm(temporary, { force: true })
    }
  })
}
