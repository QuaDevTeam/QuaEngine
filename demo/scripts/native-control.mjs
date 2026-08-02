#!/usr/bin/env node
/**
 * CDP client for the QuaEngine native dev window.
 *
 * The native dev window (`pnpm dev:native`) exposes a Chrome DevTools Protocol
 * endpoint (default `127.0.0.1:4789`, override with QUA_NATIVE_RENDERER_CONTROL).
 * This script is a thin command-line driver over that endpoint; any other CDP
 * client (chrome-remote-interface, Playwright CDPSession) can connect the same
 * way. All coordinates are CSS pixels of the window viewport (960x540), per
 * CDP convention.
 *
 * Usage:
 *   node scripts/native-control.mjs ping
 *   node scripts/native-control.mjs tree
 *   node scripts/native-control.mjs commands [--interactive] [--grep <text>]
 *   node scripts/native-control.mjs capture <out.png>
 *   node scripts/native-control.mjs click <x> <y>
 *   node scripts/native-control.mjs move <x> <y>
 *   node scripts/native-control.mjs clickCommand <command-id>
 *   node scripts/native-control.mjs wait <command-id> [timeoutMs]
 */
import { writeFile } from 'node:fs/promises'

const CONTROL = process.env.QUA_NATIVE_RENDERER_CONTROL ?? '127.0.0.1:4789'
const WS_URL = `ws://${CONTROL}/devtools/page/qua-native`
const REQUEST_TIMEOUT_MS = 30_000

class NativeCdpClient {
  async connect() {
    this.nextId = 1
    this.pending = new Map()
    this.ws = new WebSocket(WS_URL)
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) {
          reject(new Error(`${message.error.message} (code ${message.error.code})`))
        }
        else {
          resolve(message.result)
        }
      }
    })
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', () => reject(new Error(`Cannot connect to ${WS_URL} — is pnpm dev:native running?`)), { once: true })
    })
    return this
  }

  call(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params, sessionId: 'qua-native-session' }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`${method} timed out`))
        }
      }, REQUEST_TIMEOUT_MS).unref()
    })
  }

  close() {
    this.ws.close()
  }
}

async function clickCommandCenter(client, id) {
  const { nodeId } = await client.call('DOM.querySelector', { nodeId: 1, selector: `#${id}` })
  if (!nodeId) {
    throw new Error(`command "${id}" not found in the current frame`)
  }
  const { quads } = await client.call('DOM.getContentQuads', { nodeId })
  const [x1, y1, x2, , , y3] = quads[0]
  const x = (x1 + x2) / 2
  const y = (y1 + y3) / 2
  await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  return { x, y }
}

const [command, ...args] = process.argv.slice(2)

async function main() {
  const client = await new NativeCdpClient().connect()
  try {
    switch (command) {
      case 'ping': {
        console.log(JSON.stringify(await client.call('Browser.getVersion'), null, 2))
        break
      }
      case 'tree': {
        const { root } = await client.call('DOM.getDocument', { depth: -1 })
        console.log(JSON.stringify(root, null, 2))
        break
      }
      case 'commands': {
        const interactive = args.includes('--interactive')
        const grepIndex = args.indexOf('--grep')
        const grep = grepIndex >= 0 ? args[grepIndex + 1] : undefined
        const { commands } = await client.call('Qua.listCommands')
        const filtered = commands.filter(command =>
          (!interactive || command.interactive)
          && (!grep || command.id.includes(grep) || (command.text ?? '').includes(grep)))
        for (const command of filtered) {
          const text = command.text ? ` "${command.text.slice(0, 40)}"` : ''
          console.log(`${command.interactive ? '*' : ' '} ${command.id} [${command.kind}] (${command.bounds.x},${command.bounds.y} ${command.bounds.width}x${command.bounds.height})${text}`)
        }
        console.log(`${filtered.length}/${commands.length} commands`)
        break
      }
      case 'capture': {
        const out = args[0]
        if (!out) throw new Error('capture requires an output .png path')
        const { data } = await client.call('Page.captureScreenshot', { format: 'png' })
        await writeFile(out, Buffer.from(data, 'base64'))
        console.log(`captured ${out}`)
        break
      }
      case 'click': {
        const [x, y] = args.map(Number)
        await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
        console.log(`clicked (${x}, ${y})`)
        break
      }
      case 'move': {
        const [x, y] = args.map(Number)
        await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
        console.log(`moved (${x}, ${y})`)
        break
      }
      case 'clickCommand': {
        const id = args[0]
        if (!id) throw new Error('clickCommand requires a command id')
        const { x, y } = await clickCommandCenter(client, id)
        console.log(`clicked ${id} at (${x}, ${y})`)
        break
      }
      case 'wait': {
        const id = args[0]
        if (!id) throw new Error('wait requires a command id')
        const timeoutMs = args[1] ? Number(args[1]) : undefined
        await client.call('Qua.waitForCommand', { id, timeoutMs })
        console.log(`"${id}" is visible`)
        break
      }
      default:
        console.error(`Unknown command "${command ?? ''}". See the usage header of this script.`)
        process.exitCode = 2
    }
  }
  finally {
    client.close()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
