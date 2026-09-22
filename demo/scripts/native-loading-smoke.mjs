/** Cold native startup: capture the loader before the first complete menu. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.generated/qa/native-loading')
await mkdir(output, { recursive: true })
process.env.QUA_NATIVE_RENDERER_CONTROL = '127.0.0.1:4792'
const { NativeCdpClient } = await import('./native-control.mjs')
const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/native-dev.mjs'], {
  cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, QUA_NATIVE_EDITOR_FAST_REBUILD: '1', QUA_NATIVE_EDITOR_MANAGED_RELOAD: '1' },
})
let log = ''
child.stdout.on('data', chunk => { log += chunk })
child.stderr.on('data', chunk => { log += chunk })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let client
try {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    client = new NativeCdpClient()
    try { await client.connect(); break }
    catch { client.close(); client = undefined }
    assert(child.exitCode === null, `Native exited during startup:\n${log}`)
    await pause(50)
  }
  assert(client, 'Native control did not start')
  const frames = []
  let menuFrames = 0
  while (frames.length < 100 && menuFrames < 3) {
    const { commands } = await client.call('Qua.listCommands')
    if (!commands.length) { await pause(10); continue }
    const loader = commands.some(command => command.id === 'ui:asset-loading:asset-loading-status')
    const menu = commands.some(command => command.id === 'ui:demo-app-shell:native-main-menu-start')
    assert(loader || menu, `Startup exposed an empty/intermediate scene: ${commands.map(c => c.id)}`)
    assert(!(loader && menu), 'Loading scene must not draw the unfinished destination')
    const { data } = await client.call('Page.captureScreenshot', { format: 'png' })
    const name = `${String(frames.length).padStart(2, '0')}-${loader ? 'loading' : 'menu'}.png`
    await writeFile(resolve(output, name), Buffer.from(data, 'base64'))
    frames.push({ name, loader, menu, ids: commands.map(command => command.id) })
    if (menu) menuFrames++
  }
  assert(frames.some(frame => frame.loader), 'Cold startup must present its resource preparation scene')
  assert.equal(menuFrames, 3, 'Loading must finish without user input')
  assert(!log.includes('exited with an error'), log)
  await writeFile(resolve(output, 'frames.json'), JSON.stringify(frames, null, 2))
  console.log(JSON.stringify({ loadingFrames: frames.filter(frame => frame.loader).length, menuFrames, output }))
}
finally {
  client?.close()
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  await writeFile(resolve(output, 'native.log'), log)
}
