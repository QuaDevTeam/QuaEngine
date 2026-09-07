import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { backgroundAuditAssets } from './background-assets.mjs'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'
import { spriteLayerStyle } from '../../packages/render/web/dist/plugins/sprite.js'

// This gate covers compositing already-resolved sprite layers only. It does
// not stand in for manifest/expression resolution, atlas or transform parity.
const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/sprite')
mkdirSync(output, { recursive: true })
const index = JSON.parse(readFileSync(resolve(root, 'demo/dist/assets/index.json')))
const { qpk, urls } = await backgroundAuditAssets(resolve(root, 'demo/dist/assets', index.targets['native-macos'].filename), output, 'characters')
const character = (extra = {}) => ({ id: 'subject', name: 'Subject', visible: true,
  sprite: 'silhouette.png', position: { x: 960, y: 600, width: 640, height: 480, anchor: 'center' },
  layer: 2, metadata: { spriteLayers: [{ asset: 'masks/stripes.png', zIndex: 100, opacity: 0.7 }] }, ...extra })
const cases = [
  ...[0, 0.25, 0.5, 1].map(opacity => ({ id: `opacity-${opacity}`, characters: [character({ opacity })] })),
  { id: 'presence', presence: 0.5, characters: [character({ opacity: 0.5 })] },
  { id: 'hidden-layer', characters: [character({ opacity: 0.5, metadata: { spriteLayers: [{ asset: 'white.png', visible: false }] } })] },
  { id: 'negative-layer', characters: [character({ opacity: 0.5, metadata: { spriteLayers: [{ asset: 'white.png', zIndex: -1, opacity: 0.7 }] } })] },
  { id: 'sibling-order', characters: [character(), character({ id: 'neighbor', name: 'Neighbor', layer: 3, opacity: 0.4, metadata: {} })] },
  { id: 'equal-order', characters: [character(), character({ id: 'neighbor', name: 'Neighbor', layer: 2, opacity: 0.4, metadata: {} })] },
  { id: 'mask-blend', characters: [character({ opacity: 0.7, metadata: { spriteLayers: [{ asset: 'white.png', opacity: 0.65, mask: 'masks/stripes.png', blendMode: 'screen' }] } })] },
  { id: 'letterbox', container: { width: 960, height: 600, devicePixelRatio: 2 }, characters: [character({ opacity: 0.5 })] },
]
const binary = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) {
  execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml',
    '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
}
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const limits = { mae: 0.4, fractionOver16: 0.001 }
const report = { date: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'Real Metal vs Chrome, same Quack characters QPK bytes and Web spriteLayerStyle; resolved layer opacity/stacking only.', limits, cases: [] }
const browser = await chromium.launch({ timeout: 30000, ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
report.browser = browser.version()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const item of cases) {
    const container = item.container || { width: 960, height: 540, devicePixelRatio: 2 }
    const width = container.width * container.devicePixelRatio, height = container.height * container.devicePixelRatio
    const scale = Math.min(width / 1920, height / 1080)
    const frame = { layout: { preset: 'landscape' }, container,
      view: createNativeRendererViewProjection({ plugins: {}, characters: item.characters }) }
    if (item.presence !== undefined) frame.view.characters[0].presenceOpacity = item.presence
    const fixturePath = resolve(output, `${item.id}.json`)
    const nativePath = resolve(output, `${item.id}-native.png`)
    const webPath = resolve(output, `${item.id}-web.png`)
    writeFileSync(fixturePath, JSON.stringify(frame))
    const result = spawnSync(binary, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixturePath, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: `${width}x${height}`, QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: nativePath,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    writeFileSync(resolve(output, `${item.id}.log`), `${result.stdout || ''}\n${result.stderr || ''}`)
    if (result.status !== 0) throw new Error(`Native ${item.id} failed: ${result.error || result.stderr}`)
    const prefix = 'Qua native window smoke json: '
    const line = result.stdout.split('\n').find(line => line.startsWith(prefix))
    if (!line) throw new Error(`Missing capture summary: ${item.id}`)
    const summary = JSON.parse(line.slice(prefix.length))
    if (summary.frameCaptureWidth !== width || summary.frameCaptureHeight !== height || summary.textureUploadErrorCount
      || summary.fontAtlasErrorCount || summary.textureShutdownCleanupErrorCount || summary.textureShutdownReleasedCount !== summary.textureUploadUploadedCount)
      throw new Error(`Invalid capture/resource sync: ${JSON.stringify(summary)}`)
    await page.setViewportSize({ width, height })
    await page.setContent(`<style>html,body{margin:0;overflow:hidden;background:black}#stage{position:absolute;width:1920px;height:1080px;transform-origin:0 0;left:${(width - 1920 * scale) / 2}px;top:${(height - 1080 * scale) / 2}px;transform:scale(${scale})}</style><div id=stage></div>`)
    const characters = item.characters.map(character => ({ ...character,
      layers: [{ asset: character.sprite, zIndex: 0 }, ...character.metadata.spriteLayers || []]
        .map((layer, index) => ({ ...layer, style: spriteLayerStyle(layer, index === 0, layer.mask ? urls[layer.mask] : undefined), base: index === 0 })) }))
    await page.evaluate(({ characters, presence, urls }) => {
      for (const character of characters) {
        const element = document.createElement('div')
        Object.assign(element.style, { position: 'absolute', left: '640px', top: '360px', width: '640px', height: '480px',
          zIndex: String(character.layer), opacity: String((character.opacity ?? 1) * (presence ?? 1)) })
        for (const layer of character.layers) {
          const image = document.createElement('img'); image.src = urls[layer.asset]
          Object.assign(image.style, { width: '640px', height: '480px', objectFit: layer.base ? 'fill' : 'contain', display: 'block' }, layer.style)
          element.append(image)
        }
        document.getElementById('stage').append(element)
      }
      return Promise.all([...document.images].map(image => image.decode()))
    }, { characters, presence: item.presence, urls })
    await page.screenshot({ path: webPath })
    const metrics = await page.evaluate(async ({ nativeUrl, webUrl, width, height }) => {
      const pixels = async (url) => {
        const image = new Image(); image.src = url; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, width, height).data
      }
      const n = await pixels(nativeUrl), w = await pixels(webUrl)
      let sum = 0, changed = 0, painted = 0
      for (let i = 0; i < n.length; i += 4) {
        let delta = 0
        for (let c = 0; c < 3; c++) { const d = Math.abs(n[i + c] - w[i + c]); sum += d; delta = Math.max(delta, d) }
        if (delta > 16) changed++
        if (Math.max(...w.slice(i, i + 3)) > 0) painted++
      }
      // Normalize by the painted area so letterboxing cannot dilute an error.
      const count = Math.max(1, painted)
      return { mae: sum / (count * 3), fractionOver16: changed / count }
    }, { width, height, nativeUrl: `data:image/png;base64,${readFileSync(nativePath).toString('base64')}`,
      webUrl: `data:image/png;base64,${readFileSync(webPath).toString('base64')}` })
    report.cases.push({ id: item.id, ...metrics, passed: metrics.mae <= limits.mae && metrics.fractionOver16 <= limits.fractionOver16, summary })
    writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ id: item.id, ...metrics }))
  }
  writeFileSync(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>Resolved sprite compositing</title><style>body{background:#15191f;color:white;font:16px system-ui}.pair{display:flex;background:black}img{width:50%}</style><h1>Native / Chrome resolved sprite layers</h1><p>Native left, Chrome right. This compares opacity and stacking, not manifest resolution.</p>${report.cases.map(c => `<h2>${c.id}: MAE ${c.mae.toFixed(3)}</h2><div class="pair"><img src="${c.id}-native.png"><img src="${c.id}-web.png"></div>`).join('')}`)
  const failed = report.cases.filter(c => !c.passed)
  if (failed.length) throw new Error(`Sprite compositing limits exceeded: ${failed.map(c => c.id).join(', ')}`)
  console.log(`Audit: ${report.cases.length} sprite cases; ${output}/review.html`)
} finally { await browser.close() }
