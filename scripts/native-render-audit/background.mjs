import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { readQpkBundle } from '../../packages/build/quack/dist/index.js'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'
import { backgroundProjectionVars, backgroundLayerProjectionVars } from '../../packages/render/web/dist/index.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/background')
mkdirSync(output, { recursive: true })
const index = JSON.parse(readFileSync(resolve(root, 'demo/dist/assets/index.json')))
const qpk = resolve(root, 'demo/dist/assets', index.targets['native-macos'].filename)
const bundle = await readQpkBundle(qpk)
const urls = Object.fromEntries(['backgrounds/morning-city.jpg', 'cg/title.webp'].map(name => {
  const bytes = bundle.assets.get(`assets/images/${name}`)
  if (!bytes) throw new Error(`Missing QPK asset: ${name}`)
  return [name, `data:image/${name.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${bytes.toString('base64')}`]
}))
const back = { id: 'back', assetName: 'backgrounds/morning-city.jpg', assetType: 'images' }
const front = { id: 'front', assetName: 'cg/title.webp', assetType: 'images', x: 320, y: 200, width: 1280, height: 720, opacity: 0.65 }
const layered = (composition, top = {}, base = {}) => ({ mode: 'layered', ...base,
  layers: [back, { ...front, ...top, composition }] })
const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
  'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']
const filter = { blur: 4, brightness: 1.3, contrast: 0.8, saturate: 0.7, hueRotate: 45, grayscale: 0.2, sepia: 0.3 }
const cases = [
  ...modes.map(blendMode => ({ id: `blend-${blendMode}`, background: layered({ blendMode }) })),
  { id: 'blur-opacity', background: { mode: 'image', ...back, opacity: 0.5, composition: { filter: { blur: 8 } } } },
  { id: 'layered-opacity', background: layered(undefined, {}, { opacity: 0.5 }) },
  { id: 'layered-filter', background: layered(undefined, {}, { composition: { filter } }) },
  { id: 'layered-isolation', background: layered({ blendMode: 'screen' }, {}, { opacity: 0.5, composition: { isolation: true } }) },
  { id: 'layer-filter-blend', background: layered({ blendMode: 'multiply', filter }) },
  { id: 'translucent-backdrop', background: { mode: 'layered', opacity: 0.7, layers: [
    { ...back, opacity: 0.4 }, { ...front, composition: { blendMode: 'soft-light' } },
  ] } },
]
const selected = process.argv.find(arg => arg.startsWith('--case='))?.slice(7)
const selectedCases = cases.filter(item => !selected || item.id === selected)
if (!selectedCases.length) throw new Error(`Unknown case: ${selected}`)
// Leave room for image decoder/sampling variation while rejecting lost blend,
// doubled opacity and reordered-filter regressions. Apply to both regions so
// a passing interior cannot hide a broken boundary or an empty background.
const limits = { mae: 4, fractionOver16: 0.08 }
const binary = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) {
  execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml',
    '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
}
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const report = { date: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'Real Metal/WGPU vs Chrome, same QPK bytes; actual Web background style helpers and native TS frame serializer. 1920x1080; RGB MAE over the interior overlap, both flattened onto black.',
  qpk, limits, cases: [] }
const browser = await chromium.launch({ timeout: 30000, ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
report.browser = browser.version()
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  for (const item of selectedCases) {
    const frame = { layout: { preset: 'landscape' }, container: { width: 960, height: 540, devicePixelRatio: 2 },
      view: createNativeRendererViewProjection({ plugins: {}, background: item.background }) }
    const fixturePath = resolve(output, `${item.id}.json`)
    const nativePath = resolve(output, `${item.id}-native.png`)
    const webPath = resolve(output, `${item.id}-web.png`)
    writeFileSync(fixturePath, JSON.stringify(frame))
    const result = spawnSync(binary, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixturePath, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: nativePath, QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    writeFileSync(resolve(output, `${item.id}.log`), `${result.stdout || ''}\n${result.stderr || ''}`)
    if (result.status !== 0) throw new Error(`Native ${item.id} failed: ${result.error || result.stderr}`)
    const summaryLine = result.stdout.split('\n').find(line => line.startsWith('Qua native window smoke json: '))
    if (!summaryLine) throw new Error(`Missing capture summary: ${item.id}`)
    const summary = JSON.parse(summaryLine.slice('Qua native window smoke json: '.length))
    if (summary.frameCaptureWidth !== 1920 || summary.frameCaptureHeight !== 1080 || summary.textureUploadErrorCount || summary.fontAtlasErrorCount)
      throw new Error(`Invalid capture/resource sync: ${JSON.stringify(summary)}`)
    const bg = item.background
    const rootStyle = backgroundProjectionVars(bg)
    const layers = bg.mode === 'layered' ? bg.layers.map(layer => ({ ...layer, style: backgroundLayerProjectionVars(layer) })) : undefined
    await page.setContent('<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:black}</style>')
    await page.evaluate(({ bg, rootStyle, layers, urls }) => {
      const apply = (element, style) => { for (const [key, value] of Object.entries(style)) element.style.setProperty(key, String(value)) }
      const element = document.createElement(layers ? 'div' : 'img')
      apply(element, rootStyle)
      if (layers) for (const layer of layers) {
        const image = document.createElement('img'); image.src = urls[layer.assetName]
        apply(image, layer.style); element.append(image)
      } else element.src = urls[bg.assetName]
      document.body.append(element)
    }, { bg, rootStyle, layers, urls })
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())) })
    await page.screenshot({ path: webPath })
    const metrics = await page.evaluate(async ({ nativeUrl, webUrl }) => {
      async function pixels(url) {
        const image = new Image(); image.src = url; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 1920, 1080); ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, 1920, 1080).data
      }
      const n = await pixels(nativeUrl), w = await pixels(webUrl)
      const measure = (x0, y0, x1, y1) => {
        let sum = 0, changed = 0
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = (y * 1920 + x) * 4; let delta = 0
          for (let c = 0; c < 3; c++) { const d = Math.abs(n[i + c] - w[i + c]); sum += d; delta = Math.max(delta, d) }
          if (delta > 16) changed++
        }
        const count = (x1 - x0) * (y1 - y0)
        return { mae: sum / (count * 3), fractionOver16: changed / count }
      }
      return { ...measure(340, 220, 1580, 900), wholeFrame: measure(0, 0, 1920, 1080) }
    }, { nativeUrl: `data:image/png;base64,${readFileSync(nativePath).toString('base64')}`,
      webUrl: `data:image/png;base64,${readFileSync(webPath).toString('base64')}` })
    const passed = [metrics, metrics.wholeFrame].every(region =>
      region.mae <= limits.mae && region.fractionOver16 <= limits.fractionOver16)
    report.cases.push({ id: item.id, ...metrics, passed, summary })
    writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ id: item.id, ...metrics }))
  }
  writeFileSync(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>Background parity</title>
<style>body{background:#15191f;color:white;font:16px system-ui;margin:24px}.pair{position:relative;max-width:1280px;background:black}img{display:block;width:100%}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:100%;max-width:1280px}</style>
<h1>Native / Chrome background composition</h1><p>Native left, Chrome right. MAE is per RGB channel (0..255); this fixture is not a whole-renderer parity score.</p>
${report.cases.map(c => `<h2>${c.id} — MAE ${c.mae.toFixed(3)}</h2><div class="pair"><img src="${c.id}-web.png"><img class="native" src="${c.id}-native.png"></div><input aria-label="Comparison divider" type="range" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'"></input>`).join('')}`)
  console.log(`Audit: ${report.cases.length} background cases; ${output}/review.html`)
  const failed = report.cases.filter(item => !item.passed)
  if (failed.length) throw new Error(`Background parity limits exceeded: ${failed.map(item => item.id).join(', ')}`)
} finally { await browser.close() }
