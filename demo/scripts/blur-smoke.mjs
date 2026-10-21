/** Real Godot projection and Chromium CSS use identical synthetic pixels. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(demo, '..')
const output = resolve(demo, '.generated/blur-smoke')
await mkdir(resolve(output, 'addons'), { recursive: true })
await cp(resolve(root, 'packages/platform/godot-host/addon'), resolve(output, 'addons/quaengine'), { recursive: true })
await cp(resolve(root, 'packages/platform/godot-host/test/blur-smoke.gd'), resolve(output, 'smoke.gd'))
await writeFile(resolve(output, 'project.godot'), `config_version=5
[application]
config/name="QuaEngine blur regression"
run/main_scene="res://main.tscn"
[display]
window/size/viewport_width=640
window/size/viewport_height=360
[rendering]
renderer/rendering_method="gl_compatibility"
`)
await writeFile(resolve(output, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://smoke.gd" id="1"]\n[node name="Blur" type="Control"]\nscript=ExtResource("1")\n')
let log = ''
await new Promise((resolveRun, reject) => {
  const child = spawn(process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot'), ['--path', output])
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error('Godot blur smoke timed out'))
  }, 30000)
  child.stdout.on('data', bytes => log += bytes)
  child.stderr.on('data', bytes => log += bytes)
  child.once('error', (error) => {
    clearTimeout(timeout)
    reject(error)
  })
  child.once('exit', (code) => {
    clearTimeout(timeout)
    code === 0 && !/ERROR:/.test(log) ? resolveRun() : reject(new Error(log))
  })
}).finally(() => writeFile(resolve(output, 'godot.log'), log))
const input = `data:image/png;base64,${(await readFile(resolve(output, 'input.png'))).toString('base64')}`
const browser = await chromium.launch({ channel: 'chrome' })
const cases = []
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  for (const radius of [4, 12, 32, 64]) {
    for (const scale of [0.5, 1]) {
      const id = `${radius}-${scale.toFixed(1)}`
      await page.setContent(`<style>body{margin:0;background:black}img{position:absolute;inset:0;width:640px;height:360px}div{position:absolute;inset:0;backdrop-filter:blur(${radius * scale}px)}</style><img src="${input}"><div></div>`)
      await page.evaluate(async () => {
        await document.querySelector('img').decode()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      const reference = await page.screenshot({ path: resolve(output, `web-${id}.png`) })
      const godot = await sharp(resolve(output, `godot-${id}.png`)).removeAlpha().raw().toBuffer()
      const web = await sharp(reference).removeAlpha().raw().toBuffer()
      const errors = Array.from(godot, (value, index) => Math.abs(value - web[index])).sort((a, b) => a - b)
      const result = { radius, scale, mean: errors.reduce((sum, value) => sum + value, 0) / errors.length, p95: errors[Math.floor(errors.length * 0.95)], max: errors.at(-1) }
      cases.push(result)
      assert(result.mean < 1 && result.p95 <= 3 && result.max <= 6, `Blur differs from CSS: ${JSON.stringify(result)}`)
    }
  }
}
finally {
  await browser.close()
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify({ method: 'Actual Godot scene_node projection versus Chromium backdrop-filter; includes stage scaling and teardown.', cases }, null, 2)}\n`)
}
process.stdout.write(`${JSON.stringify({ output, cases }, null, 2)}\n`)
