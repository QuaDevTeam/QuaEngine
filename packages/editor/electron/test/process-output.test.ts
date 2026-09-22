import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ProcessLogDecoder } from '../src/runtime/output.js'
import { runTool } from '../src/runtime/process.js'

describe('plain process logs', () => {
  const source = '\u001B[2K\r\u001B[32m中文 ✅\u001B[0m\r\n\u001B[?25lprogress\rfinished\n\u001B]0;title\u0007\u001B]8;;https://example.test\u001B\\link\u001B]8;;\u001B\\\n\u001BPignored device response\u001B\\\u001B(B\u009B31mred\u009B0m\n{"literal":"[2K","escaped":"\\u001b[31m"}\n'
  const expected = '\n中文 ✅\nprogress\nfinished\nlink\nred\n{"literal":"[2K","escaped":"\\u001b[31m"}\n'
  it('removes actual controls at every chunk boundary, preserving text and JSON', () => {
    for (let split = 0; split <= source.length; split++) {
      const decoder = new ProcessLogDecoder()
      expect(decoder.append(source.slice(0, split)) + decoder.append(source.slice(split))).toBe(expected)
    }
    const decoder = new ProcessLogDecoder()
    expect(Array.from(source, character => decoder.append(character)).join('')).toBe(expected)
  })

  it('does not mix streams, retain control payloads, or swallow diagnostics after a broken CSI', () => {
    const stdout = new ProcessLogDecoder()
    const stderr = new ProcessLogDecoder()
    expect(stdout.append('\u001B[')).toBe('')
    expect(stderr.append('ERROR keep this\n')).toBe('ERROR keep this\n')
    expect(stdout.append('2Kready\n')).toBe('ready\n')
    expect(stdout.append('\u001B[32\nERROR next line\n')).toBe('\nERROR next line\n')
    expect(stdout.append('\u001B]')).toBe('')
    expect(stdout.append('x'.repeat(100000))).toBe('')
    expect(stdout.append('\u0007done')).toBe('done')
  })

  it('cleans real tool reports and error tails with independent stdout/stderr decoders', async () => {
    let output = ''
    const fixture = fileURLToPath(new URL('./fixtures/process-output.mjs', import.meta.url))
    const pending = runTool(process.execPath, [fixture, '--fail'], process.cwd(), {
      signal: new AbortController().signal,
      env: process.env,
      report: (text) => { output += text },
    })
    await expect(pending).rejects.toThrow('ERROR actionable diagnostic')
    expect(output).toContain('WARN stderr survives\n\ntransforming (12) 中文模块\nbuilt in 375ms\nproject link\n')
    expect(output).toContain('literal [2K and \\u001B[31m stay text\n')
    expect(output).not.toContain('\u001B')
    expect(output).not.toMatch(/\r|hidden window title|https:\/\/example.test/u)
  })
})
