import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { writeAtomic } from './file-storage'
import { appendJsonl, readJsonl } from './jsonl'

let directory: string
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

it('keeps large snapshots readable throughout concurrent replacement and leaves no temporary files', async () => {
  directory = await mkdtemp(join(tmpdir(), 'writer-atomic-'))
  const path = join(directory, 'project.json')
  const content = '稿件'.repeat(100000)
  await writeAtomic(path, JSON.stringify({ version: 0, content }))
  let finished = false
  const writes = Promise.all(Array.from({ length: 30 }, (_, version) => writeAtomic(path, JSON.stringify({ version, content }))))
    .finally(() => { finished = true })
  do {
    const snapshot = JSON.parse(await readFile(path, 'utf8'))
    expect(snapshot.content).toBe(content)
  } while (!finished)
  await writes
  expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(29)
  expect(await readdir(directory)).toEqual(['project.json'])
})

it('serializes large JSONL appends and reads without exposing partial records', async () => {
  directory = await mkdtemp(join(tmpdir(), 'writer-jsonl-'))
  const path = join(directory, 'events.jsonl')
  const content = '正文'.repeat(50000)
  const operations: Promise<unknown>[] = []
  for (let index = 0; index < 25; index++) {
    operations.push(appendJsonl(path, { index, content }))
    operations.push(readJsonl<{ index: number, content: string }>(path).then(records => {
      expect(records.map(record => record.index)).toEqual(Array.from({ length: index + 1 }, (_, id) => id))
      expect(records.every(record => record.content === content)).toBe(true)
    }))
  }
  await Promise.all(operations)
})
