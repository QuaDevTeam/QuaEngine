/** Real WGPU/QPK backdrop Gaussian regression against Chromium CSS. */
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
const output = resolve(root, 'packages/native/target/render-audit/backdrop')
mkdirSync(output, { recursive: true })
const sources = new Map()
sources.set('checker.png', png(192, 108, (x, y) => {
  const bit = (Math.floor(x / 9) + Math.floor(y / 7)) % 2
  return bit ? [190, 70, 40, 255] : [20, 120, 210, 255]
}))
const assets = [...sources].map(([name, bytes]) => {
  const path = resolve(output, name); writeFileSync(path, bytes)
  return { name, path, relativePath: name, type: 'images', subType: 'image', size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'), mtime: 0, locales: ['default'] }
})
const qpk = resolve(output, 'backdrop.qpk')
await new QPKBundler().createBundle(assets, {
  name: 'backdrop-audit', version: '1.0.0', bundler: 'quack', created: new Date(0).toISOString(), createdAt: 0,
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
  { id: 'blur-4', sigma: 4 }, { id: 'blur-12', sigma: 12 },
  { id: 'blur-32', sigma: 32 }, { id: 'blur-64', sigma: 64 },
  { id: 'rounded', sigma: 12, radius: 30 },
  { id: 'own-opacity', sigma: 12, opacity: 0.5 },
]
const report = { method: 'Real native WGPU readback versus Chromium backdrop-filter, same QPK source, stage size and sigma.', cases: [] }
const browser = await chromium.launch({ executablePath: process.env.QUA_PARITY_CHROMIUM })
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  for (const profile of profiles) {
    const { id, sigma, radius = 0, opacity = 1 } = profile
    const frame = { layout: { preset: 'landscape' }, container: { width: 960, height: 540, devicePixelRatio: 1 },
      view: createNativeRendererViewProjection({ background: { mode: 'image', assetName: 'checker.png', assetType: 'images', fit: 'fill' },
        ui: { visible: true, overlays: { audit: { visible: true, renderMode: 'render-only', surface: { key: 'audit', root: {
          id: 'glass', kind: 'Panel', visible: true, bounds: { x: 300, y: 200, width: 1320, height: 680 },
          style: { backgroundColor: '#ffffff18', opacity, borderRadius: radius, backdropFilter: { blurRadius: sigma } },
        } } } } },
      }) }
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
    const source = `data:image/png;base64,${sources.get('checker.png').toString('base64')}`
    await page.setContent(`<style>body{margin:0;background:black}img{position:absolute;width:960px;height:540px;inset:0}#glass{position:absolute;left:150px;top:100px;width:660px;height:340px;background:#ffffff18;opacity:${opacity};border-radius:${radius / 2}px;backdrop-filter:blur(${sigma / 2}px)}</style><img src="${source}"><div id="glass"></div>`)
    await page.evaluate(async () => { await document.querySelector('img').decode(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) })
    const expected = await page.screenshot({ path: resolve(output, `web-${id}.png`) })
    const stats = await page.evaluate(async ([a, b]) => {
      const read = async data => { const img = new Image(); img.src = data; await img.decode(); const c = document.createElement('canvas'); c.width=960;c.height=540;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,960,540);ctx.drawImage(img,0,0);return ctx.getImageData(0,0,960,540).data }
      const [native, web] = await Promise.all([read(a),read(b)]), errors=[]
      for(let y=96;y<444;y++)for(let x=146;x<814;x++)for(let c=0;c<3;c++) { const i=(y*960+x)*4+c; if(native[i] || web[i]) errors.push(Math.abs(native[i]-web[i])) }
      errors.sort((a,b)=>a-b)
      return { mean: errors.reduce((n,v)=>n+v,0)/errors.length, p95: errors[Math.floor(errors.length*.95)], max: errors.at(-1), samples: errors.length }
    }, [`data:image/png;base64,${readFileSync(image).toString('base64')}`, `data:image/png;base64,${expected.toString('base64')}`])
    report.cases.push({ id, ...stats, textureUploads: summary.textureUploadUploadedCount, textureReleases: summary.textureShutdownReleasedCount })
    writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
    console.log(id, stats)

  }
} finally { await browser.close() }
assert(report.cases.every(c => c.mean <= 2 && c.p95 <= 8), 'Backdrop blur differs from Chromium; inspect results.json')
