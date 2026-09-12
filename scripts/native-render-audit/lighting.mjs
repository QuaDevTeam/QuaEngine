/** Real WGPU/QPK character lighting regression against the Web SVG material. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { QPKBundler } from '../../packages/build/quack/dist/index.js'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'
import { characterLightingSvg } from '../../packages/render/web/dist/plugins/character.js'
import { png } from './background-assets.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/lighting')
mkdirSync(output, { recursive: true })
const sources = new Map()
sources.set('subject.png', png(64, 64, (x, y) => [200, 160, 120, [0,32,64,128,192,224,254,255][Math.floor(x / 8)]]))
sources.set('overlay.png', png(64, 64, () => [100, 200, 80, 96]))
const assets = [...sources].map(([name, bytes]) => {
  const path = resolve(output, name); writeFileSync(path, bytes)
  return { name, path, relativePath: name, type: 'characters', subType: 'image', size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'), mtime: 0, locales: ['default'] }
})
const qpk = resolve(output, 'lighting.qpk')
await new QPKBundler().createBundle(assets, {
  name: 'lighting-audit', version: '1.0.0', bundler: 'quack', created: new Date(0).toISOString(), createdAt: 0,
  format: 'qpk', bundleVersion: 1, compression: { algorithm: 'none', level: 0 }, encryption: { enabled: false, algorithm: 'none' },
  locales: ['default'], defaultLocale: 'default', assets: [], totalFiles: assets.length,
  totalSize: assets.reduce((n, asset) => n + asset.size, 0),
}, qpk, { compress: false, encrypt: false })
const app = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml',
  '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const profiles = [
  { id: 'neutral' },
  { id: 'ambient', lighting: { ambient: [0.8, 0.9, 1] } },
  { id: 'clamped-gain', lighting: { ambient: [1.5, 1.2, 0.9] } },
  { id: 'laundry', lighting: { ambient: [1.02, 0.98, 0.92], shade: { color: [0.9, 0.94, 1], from: [0.2, 0], to: [0.8, 1] } } },
  { id: 'demo-rain', lighting: { ambient: [0.94, 0.97, 1.02], shade: { color: [0.92, 0.95, 1], from: [0.6, 0], to: [0.2, 1] } } },
  { id: 'demo-monitor-night', lighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } } },
  { id: 'shade', lighting: { shade: { color: [0.6, 0.8, 1], from: [0, 0], to: [1, 0] } } },
  { id: 'degenerate', lighting: { shade: { color: [0.6, 0.8, 1], from: [0.5, 0.5], to: [0.5, 0.5] } } },
  { id: 'overlap-opacity', opacity: 0.5, overlay: true, lighting: { ambient: [0.8, 0.9, 1] } },
  { id: 'rotated-shade', rotation: 23, lighting: { shade: { color: [0.6, 0.8, 1], from: [0, 0], to: [1, 1] } } },
]
const report = { method: 'Real WGPU/QPK readback versus Chromium shared character SVG material. No browser/native pixel fabrication.', cases: [] }
const browser = await chromium.launch({ executablePath: process.env.QUA_PARITY_CHROMIUM })
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  for (const profile of profiles) {
    const { id, lighting, opacity = 1, rotation = 0, overlay } = profile
    const frame = { layout: { preset: 'landscape' }, container: { width: 960, height: 540, devicePixelRatio: 1 },
      view: createNativeRendererViewProjection({ background: { mode: 'image', characterLighting: lighting },
        characters: [{ id: 'subject', name: 'Subject', sprite: 'subject.png', opacity,
          position: { x: 960, y: 540, width: 256, height: 256, anchor: 'center', rotation },
          ...(overlay ? { metadata: { spriteLayers: [{ asset: 'overlay.png', zIndex: 1 }] } } : {}),
        }] }) }
    const fixture = resolve(output, `${id}.json`), image = resolve(output, `native-${id}.png`)
    writeFileSync(fixture, JSON.stringify(frame))
    const result = spawnSync(app, [], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixture, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: '960x540', QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: image,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    writeFileSync(resolve(output, `${id}.log`), `${result.stdout}\n${result.stderr}`)
    assert.equal(result.status, 0, `${id}: ${result.error || result.stderr}`)
    const prefix = 'Qua native window smoke json: '
    const summary = JSON.parse(result.stdout.split('\n').find(l => l.startsWith(prefix)).slice(prefix.length))
    assert.equal(summary.textureUploadErrorCount, 0)
    assert.equal(summary.textureShutdownCleanupErrorCount, 0)
    assert.equal(summary.textureShutdownReleasedCount, summary.textureUploadUploadedCount)
    const material = characterLightingSvg('grade', lighting)
    const source = `data:image/png;base64,${sources.get('subject.png').toString('base64')}`
    const over = `data:image/png;base64,${sources.get('overlay.png').toString('base64')}`
    await page.setContent('<style>body{margin:0;background:black}#subject{position:absolute;left:416px;top:206px;width:128px;height:128px}img{position:absolute;width:100%;height:100%}</style><div id="subject"></div>')
    await page.evaluate(async ({ material, source, over, opacity, rotation, overlay }) => {
      const element = n => { const e = document.createElementNS('http://www.w3.org/2000/svg', n.tag); for (const [k,v] of Object.entries(n.attrs)) e.setAttribute(k, v); for (const c of n.children || []) e.append(element(c)); return e }
      const subject = document.getElementById('subject')
      if (material) { document.body.append(element(material)); subject.style.filter = 'url(#grade)' }
      subject.style.opacity = opacity; subject.style.transform = `rotate(${rotation}deg)`
      for (const src of overlay ? [source, over] : [source]) { const img = new Image(); img.src = src; subject.append(img); await img.decode() }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    }, { material, source, over, opacity, rotation, overlay })
    const expected = await page.screenshot({ path: resolve(output, `web-${id}.png`) })
    const stats = await page.evaluate(async ([a, b]) => {
      const read = async data => { const img = new Image(); img.src = data; await img.decode(); const c = document.createElement('canvas'); c.width=960;c.height=540;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,960,540);ctx.drawImage(img,0,0);return ctx.getImageData(0,0,960,540).data }
      const [native, web] = await Promise.all([read(a),read(b)]), errors=[]
      for(let y=180;y<360;y++)for(let x=390;x<570;x++)for(let c=0;c<3;c++) { const i=(y*960+x)*4+c; if(native[i] || web[i]) errors.push(Math.abs(native[i]-web[i])) }
      errors.sort((a,b)=>a-b)
      return { mean: errors.reduce((n,v)=>n+v,0)/errors.length, p95: errors[Math.floor(errors.length*.95)], max: errors.at(-1), samples: errors.length }
    }, [`data:image/png;base64,${readFileSync(image).toString('base64')}`, `data:image/png;base64,${expected.toString('base64')}`])
    report.cases.push({ id, ...stats, textureUploads: summary.textureUploadUploadedCount, textureReleases: summary.textureShutdownReleasedCount })
    writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
    console.log(id, stats)
    assert(stats.mean <= 2 && stats.p95 <= 3, `${id}: character lighting differs from Chromium`)
  }
} finally { await browser.close() }
