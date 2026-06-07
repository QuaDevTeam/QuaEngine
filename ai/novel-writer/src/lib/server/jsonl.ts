import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function appendJsonl<T>(filePath: string, record: T): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
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
}
