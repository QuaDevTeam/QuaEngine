import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startupErrorMessage } from '../desktop/startup-error.mjs'

describe('desktop production build', () => {
  it('rejects a malformed lazy server chunk even when the entry is valid', async () => {
    const build = await mkdtemp(join(tmpdir(), 'writer-build-check-'))
    const checker = fileURLToPath(new URL('../scripts/verify-build.mjs', import.meta.url))
    const check = () => spawnSync(process.execPath, [checker, build], { encoding: 'utf8' })
    try {
      await mkdir(join(build, 'server', 'chunks'), { recursive: true })
      await writeFile(join(build, 'package.json'), JSON.stringify({ type: 'module' }))
      await writeFile(join(build, 'handler.js'), 'export const handler = () => {}')
      const chunk = join(build, 'server', 'chunks', 'lazy.js')
      await writeFile(chunk, 'export class SSRState {\n * @readonly\n csp\n}')
      const invalid = check()
      expect(invalid.status).not.toBe(0)
      expect(invalid.stderr).toContain('lazy.js')
      expect(invalid.stderr).toContain('SyntaxError')
      await writeFile(chunk, 'export class SSRState {\n /** @readonly */\n csp\n}')
      expect(check().status).toBe(0)
      await rm(join(build, 'handler.js'))
      expect(check().status).not.toBe(0)
    }
    finally {
      await rm(build, { recursive: true, force: true })
    }
  })

  it('identifies startup failures without forwarding raw private data', () => {
    const secret = 'private manuscript sk-test-secret-value'
    expect(startupErrorMessage(new SyntaxError(secret))).toContain('SyntaxError')
    expect(startupErrorMessage(Object.assign(new Error(secret), { code: 'ERR_MODULE_NOT_FOUND' }))).toContain('ERR_MODULE_NOT_FOUND')
    expect(startupErrorMessage(Object.assign(new Error(secret), { code: 'EACCES' }))).toContain('访问权限')
    for (const error of [new SyntaxError(secret), new Error(secret), new Error(`Novel Writer ${secret}`), null])
      expect(startupErrorMessage(error)).not.toContain(secret)
    const locked = 'Novel Writer 已在另一个编辑器窗口中运行，请先关闭该窗口。'
    expect(startupErrorMessage(new Error(locked))).toBe(locked)
  })
})
