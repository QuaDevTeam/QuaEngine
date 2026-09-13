/** Actual Metal/QPK regression for alpha interpolation and opt-in 4x MSAA. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { QPKBundler } from '../../packages/build/quack/dist/index.js'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'
import { png } from './background-assets.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/edges')
const masksOnly = process.argv.includes('--masks-only')
mkdirSync(output, { recursive: true })
const sources = new Map()
for (const matte of [0, 255]) {
  for (const size of [8, 127]) {
    sources.set(`edge-${matte}-${size}.png`, png(size, size, (x, y) => {
      const alpha = size === 8 ? (x >= 2 && x <= 5 ? (x === 2 ? 128 : 255) : 0)
        : ((x + y) % 3 === 0 ? 255 : 0)
      return alpha ? [200, 80, 40, alpha] : [matte, matte, matte, 0]
    }))
  }
}
sources.set('white.png', png(8, 8, () => [255, 255, 255, 255]))
sources.set('mask.png', png(8, 8, () => [128, 128, 128, 128]))
const assets = [...sources].map(([name, bytes]) => {
  const path = resolve(output, name); writeFileSync(path, bytes)
  return { name, path, relativePath: name, type: 'characters', subType: 'image', size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'), mtime: 0, locales: ['default'] }
})
const qpk = resolve(output, 'edges.qpk')
await new QPKBundler().createBundle(assets, {
  name: 'edges-audit', version: '1.0.0', bundler: 'quack', created: new Date(0).toISOString(), createdAt: 0,
  format: 'qpk', bundleVersion: 1, compression: { algorithm: 'none', level: 0 }, encryption: { enabled: false, algorithm: 'none' },
  locales: ['default'], defaultLocale: 'default', assets: [], totalFiles: assets.length,
  totalSize: assets.reduce((n, asset) => n + asset.size, 0),
}, qpk, { compress: false, encrypt: false })
const app = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml',
  '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const report = { date: new Date().toISOString(), appSha256: createHash('sha256').update(readFileSync(app)).digest('hex'),
  method: 'Real Metal capture of Quack QPK fixtures; compare hidden-matte invariance and geometric coverage at 1x/4x. No whole-renderer parity claim.', cases: [] }
const browser = await chromium.launch({ ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
try {
  const page = await browser.newPage()
  const pixels = async path => page.evaluate(async data => {
    const img = new Image(); img.src = data; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(0, 0, img.width, img.height).data]
  }, `data:image/png;base64,${readFileSync(path).toString('base64')}`)
  const capture = async (id, samples, character, background) => {
    const frame = { layout: { preset: 'landscape' }, container: { width: 960, height: 540, devicePixelRatio: 1 },
      view: createNativeRendererViewProjection({ plugins: {}, background, characters: character ? [{ id: 'edge', name: 'Edge', visible: true,
        position: { x: 960, y: 540, width: 360, height: 360, anchor: 'center' }, ...character }] : [] }) }
    const fixture = resolve(output, `${id}.json`), image = resolve(output, `${id}.png`)
    writeFileSync(fixture, JSON.stringify(frame))
    const result = spawnSync(app, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'info', QUA_NATIVE_MSAA: String(samples), QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixture, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: '960x540', QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: image,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    const log = `${result.stdout || ''}\n${result.stderr || ''}`
    writeFileSync(resolve(output, `${id}.log`), log)
    assert.equal(result.status, 0, `${id}: ${result.error || result.stderr}`)
    assert(log.includes(`MSAA: requested ${samples}, active ${samples}`), 'actual device sample count must match audit')
    const prefix = 'Qua native window smoke json: '
    const line = result.stdout.split('\n').find(line => line.startsWith(prefix))
    assert(line, 'capture summary is required')
    const summary = JSON.parse(line.slice(prefix.length))
    assert.equal(summary.frameCaptureWidth, 960); assert.equal(summary.frameCaptureHeight, 540)
    assert.equal(summary.textureUploadErrorCount, 0); assert.equal(summary.textureShutdownCleanupErrorCount, 0)
    assert.equal(summary.textureShutdownReleasedCount, summary.textureUploadUploadedCount)
    return pixels(image)
  }
  for (const samples of [1, 4]) {
    for (const size of (masksOnly ? [] : [8, 127])) {
      const character = size === 8 ? {} : { position: { x: 960.3, y: 540.3, width: 73, height: 73, anchor: 'center' } }
      const a = await capture(`matte-black-${size}-${samples}x`, samples, { ...character, sprite: `edge-0-${size}.png` })
      const b = await capture(`matte-white-${size}-${samples}x`, samples, { ...character, sprite: `edge-255-${size}.png` })
      assert.deepEqual(a, b, 'transparent RGB must not change visible pixels at any scale')
      const painted = a.filter((_, i) => i % 4 === 0 && a[i] > 8).length
      assert(painted > 100, 'the fixture must be visible, not a missing transparent texture')
      report.cases.push({ id: `matte-${size}-${samples}x`, hiddenMatteMaxDifference: 0, painted })
    }
    for (const mode of ['alpha', 'luminance']) {
      const masked = await capture(`mask-${mode}-${samples}x`, samples, undefined, {
        mode: 'image', assetName: 'white.png', assetType: 'characters', x: 780, y: 360, width: 360, height: 360,
        composition: { mask: { assetName: 'mask.png', assetType: 'characters', mode } },
      })
      const at = (270 * 960 + 480) * 4, expected = mode === 'alpha' ? 128 : 64
      assert(Math.abs(masked[at] - expected) <= 1, 'mask must apply alpha once, including luminance')
      report.cases.push({ id: `mask-${mode}-${samples}x`, center: masked.slice(at, at + 4) })
    }
    if (masksOnly) continue
    // Half-opacity parent and overlapping image layer require an isolated
    // subtree plus a resolve before the parent composite, not per-draw alpha.
    const nested = await capture(`group-${samples}x`, samples, { sprite: 'white.png', opacity: 0.5,
      metadata: { spriteLayers: [{ asset: 'white.png', opacity: 0.5, zIndex: 1 }] } })
    const at = (270 * 960 + 480) * 4
    assert(Math.abs(nested[at] - 128) <= 1, 'parent opacity applies once after overlap')
    report.cases.push({ id: `group-${samples}x`, center: nested.slice(at, at + 4) })
    const diagonal = await capture(`diagonal-${samples}x`, samples, { sprite: 'white.png',
      position: { x: 960, y: 540, width: 360, height: 360, anchor: 'center', rotation: 17 } })
    let partialPixels = 0
    for (let i = 0; i < diagonal.length; i += 4) if (diagonal[i] > 0 && diagonal[i] < 255) partialPixels++
    report.cases.push({ id: `diagonal-${samples}x`, partialPixels })
  }
  if (!masksOnly) {
    const aliased = report.cases.find(c => c.id === 'diagonal-1x').partialPixels
    const antialiased = report.cases.find(c => c.id === 'diagonal-4x').partialPixels
    assert(antialiased > aliased + 100, '4x must produce measurable subpixel geometry coverage')
  }
  writeFileSync(resolve(output, masksOnly ? 'mask-results.json' : 'results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
