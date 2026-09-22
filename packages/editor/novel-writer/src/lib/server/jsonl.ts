import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock } from './file-storage'

export async function appendJsonl<T>(filePath: string, record: T): Promise<void> {
  await withFileLock(filePath, async () => {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
  })
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  return withFileLock(filePath, async () => {
    try {
      const content = await readFile(filePath, 'utf8')
      return content
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as T)
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  })
}
