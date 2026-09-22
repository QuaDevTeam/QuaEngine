import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run after building: node packages/build/language-server/test/lsp-smoke.mjs
async function main() {
  const root = await mkdtemp(join(tmpdir(), 'qua-lsp-protocol-'))
  const uri = pathToFileURL(join(root, 'scene.qs')).href
  const helper = join(root, 'helper.ts')
  await writeFile(helper, 'export function mood(value: string, options?: object) {}')
  await writeFile(join(root, 'qua.plugins.json'), JSON.stringify({ plugins: [{
    name: 'mood',
    decorators: { Mood: { function: 'mood', module: './helper' } },
    language: { decorators: { Mood: { description: 'Mood help', args: [{ name: 'value' }, { name: 'options' }] } } },
  }] }))
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/server.js', import.meta.url)), '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  let buffer = Buffer.alloc(0)
  let sequence = 0
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const boundary = buffer.indexOf('\r\n\r\n')
      if (boundary < 0)
        return
      const size = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, boundary).toString())[1])
      if (buffer.length < boundary + 4 + size)
        return
      const message = JSON.parse(buffer.subarray(boundary + 4, boundary + 4 + size).toString())
      buffer = buffer.subarray(boundary + 4 + size)
      const request = pending.get(message.id)
      if (request) {
        pending.delete(message.id)
        clearTimeout(request.timer)
        if (message.error)
          request.reject(new Error(JSON.stringify(message.error)))
        else request.resolve(message.result)
      }
    }
  })
  function send(method, params, id) {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id })
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  function request(method, params) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out: ${method}`))
      }, 15000)
      pending.set(id, { resolve, reject, timer })
      send(method, params, id)
    })
  }
  try {
    const init = await request('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {} })
    assert.deepEqual(init.capabilities.signatureHelpProvider.triggerCharacters, ['(', ','])
    send('initialized', {})
    send('textDocument/didOpen', { textDocument: { uri, languageId: 'quascript', version: 1, text: '@Mo' } })
    const completions = await request('textDocument/completion', { textDocument: { uri }, position: { line: 0, character: 3 } })
    const item = completions.find(item => item.label === 'Mood')
    assert.equal(item.documentation.value.includes('Mood help'), true)
    assert.deepEqual(item.textEdit, { newText: 'Mood', range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } } })
    send('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: '@Mood("calm", ' }] })
    const help = await request('textDocument/signatureHelp', { textDocument: { uri }, position: { line: 0, character: 14 } })
    assert.equal(help.activeParameter, 1)
    assert.equal(help.signatures[0].label, '@Mood(value, options)')
    const definition = await request('textDocument/definition', { textDocument: { uri }, position: { line: 0, character: 3 } })
    assert.equal(definition[0].uri, pathToFileURL(helper).href)
    const hover = await request('textDocument/hover', { textDocument: { uri }, position: { line: 0, character: 3 } })
    assert.equal(hover.contents.value.includes('Mood help'), true)
    await request('shutdown', null)
    send('exit')
    process.stdout.write('PASS: actual stdio LSP capabilities, completion textEdit/documentation, signature help, hover and definition.\n')
  }
  finally {
    for (const entry of pending.values()) clearTimeout(entry.timer)
    child.kill()
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
