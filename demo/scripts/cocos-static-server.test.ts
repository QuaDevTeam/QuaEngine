import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { createCocosArtifactServer } from './cocos-static-server.mjs'

it('artifact server serves seekable video ranges, suffixes, HEAD and out-of-range responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qua-video-http-'))
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i)
  await writeFile(join(root, 'movie.mp4'), bytes)
  const server = createCocosArtifactServer(root)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/movie.mp4`
  try {
    for (const [range, start, end] of [['bytes=8-15', 8, 15], ['bytes=24-', 24, 31], ['bytes=-4', 28, 31]] as const) {
      const response = await fetch(url, { headers: { Range: range } })
      assert.equal(response.status, 206)
      assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/32`)
      assert.equal(response.headers.get('Content-Type'), 'video/mp4')
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(start, end + 1))
    }
    const head = await fetch(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('Content-Length'), '32')
    assert.equal(head.headers.get('Accept-Ranges'), 'bytes')
    assert.equal((await head.arrayBuffer()).byteLength, 0)
    const invalid = await fetch(url, { headers: { Range: 'bytes=32-' } })
    assert.equal(invalid.status, 416)
    assert.equal(invalid.headers.get('Content-Range'), 'bytes */32')
  }
  finally {
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true })
  }
})
