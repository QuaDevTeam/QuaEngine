import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium } from 'playwright'
import { backgroundAuditAssets, png } from './background-assets.mjs'
import { createNativeRendererJsonFrameInput } from '../../packages/native/engine-native/dist/index.js'
import { resolveSpriteProjection } from '../../packages/plugins/sprite/dist/contracts.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/sprite-animation')
mkdirSync(output, { recursive: true })
const manifest = { version: 1, family: 'motion', base: { asset: 'base.png' }, expressions: {
  smile: { layers: [{ asset: 'face.png', mask: 'motion/mask.png' }, { asset: 'mark.png', offsetY: 20, opacity: 0.6 }] },
} }
const index = JSON.parse(readFileSync(resolve(root, 'demo/dist/assets/index.json')))
const { qpk, urls } = await backgroundAuditAssets(resolve(root, 'demo/dist/assets', index.targets['native-macos'].filename), output, 'characters', new Map([
  ['motion/base.png', png(240, 240, (x, y) => [220, 120, 20, Math.hypot(x - 120, y - 120) < 115 ? 255 : 0])],
  ['motion/face.png', png(240, 240, (x, y) => [30, 190, 220, x > 20 && x < 220 && y > 40 && y < 200 ? 220 : 0])],
  ['motion/mark.png', png(240, 240, (x, y) => [210, 40, 80, Math.hypot(x - 120, y - 120) < 70 ? 255 : 0])],
  ['motion/mask.png', png(240, 240, (x) => [255, 255, 255, x % 60 < 30 ? 255 : 0])],
  ['motion/sprite.manifest.json', Buffer.from(JSON.stringify(manifest))],
]))
const track = (target, property, from, to = from, extra = {}) => ({ target: `spriteLayer:mira:one:${target}`, property,
  keyframes: [{ at: 0, value: from }, { at: 1000, value: to }], ...extra })
const timeline = (tracks, extra = {}) => ({ id: 'sprite-motion', state: 'running', startedAt: 1000, duration: 1000,
  playbackRate: 1, fill: 'forwards', resolvedTracks: tracks, ...extra })
const cases = [
  { id: 'rest', animation: timeline([]) },
  { id: 'move-opacity', animation: timeline([track('expression', 'offsetX', 0, 80), track('expression:1', 'opacity', 0, 1)]) },
  { id: 'alias-order', animation: timeline([track('1', 'offsetX', 40), track('expression', 'offsetX', 20), track('expression:1', 'offsetX', 80)]) },
  { id: 'base-zero', animation: timeline([track('0', 'scale', 0), track('expression', 'opacity', 0.7)]) },
  { id: 'negative-mask', animation: timeline([track('1', 'scale', 0.5, -1.5), track('1', 'rotation', 0, 60), track('base', 'opacity', 0.5)]) },
  { id: 'base-front', animation: timeline([track('base', 'zIndex', 50), track('base', 'opacity', 0.5)]) },
  { id: 'hidden-blend', animation: timeline([track('2', 'visible', true, false, { interpolation: 'step' }), track('1', 'blendMode', 'screen')]), now: 2000 },
  { id: 'delay', animation: timeline([track('expression', 'offsetX', 0, 80)], { delay: 1000, fill: 'none' }) },
  { id: 'alternate-slow', animation: timeline([track('expression', 'offsetY', 0, 80)], { loop: 2, direction: 'alternate', playbackRate: 0.5 }), now: 4000 },
  { id: 'paused', animation: timeline([track('expression', 'rotation', 0, 60)], { state: 'paused', pausedAt: 1250 }), now: 9000 },
  { id: 'ease-in', animation: timeline([track('expression', 'offsetX', 0, 200, { keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 200, easing: 'ease-in' }] })]) },
  { id: 'ease-out', animation: timeline([track('expression', 'offsetX', 0, 200, { keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 200, easing: 'ease-out' }] })]), height: 1200 },
]
const app = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
const clock = process.env.QUA_NATIVE_AUDIT_CLOCK || resolve(root, 'packages/native/target/debug/examples/project_animation_frame')
if (!process.argv.includes('--skip-build')) {
  execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
  execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_wgpu_renderer', '--example', 'project_animation_frame'], { cwd: root, stdio: 'inherit' })
}
const web = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
  lib: { entry: resolve(root, 'packages/render/web/src/plugins/sprite.ts'), name: 'SpriteAudit', formats: ['iife'] } } })
const webCode = (Array.isArray(web) ? web[0] : web).output.find(item => item.type === 'chunk').code
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const browser = await chromium.launch({ channel: 'chrome' })
const report = { date: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), browser: browser.version(),
  appSha256: createHash('sha256').update(readFileSync(app)).digest('hex'), clockSha256: createHash('sha256').update(readFileSync(clock)).digest('hex'),
  method: 'Rust frame-clock sampling -> mounted QPK manifest -> Metal, against actual Web updateSpriteLayerAnimations and spriteLayerStyle. Fixed logical canvas, same QPK bytes.',
  limits: { mae: 3, fractionOver32: 0.015 }, cases: [] }
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const item of cases) {
    // Use an epoch after the transient entrance fade; timeline local times stay
    // deterministic and identical in Rust and Web.
    const epoch = Date.now() + 10_000
    const now = epoch + (item.now || 1500), height = item.height || 1080
    const animation = { ...item.animation, startedAt: epoch + item.animation.startedAt,
      ...(item.animation.pausedAt === undefined ? {} : { pausedAt: epoch + item.animation.pausedAt }) }
    const character = { id: 'mira:one', name: 'Mira', sprite: 'motion/base.png', expression: 'smile', visible: true, opacity: 0.7,
      position: { x: 960, y: 600, width: 240, height: 240, scale: 1.2, rotation: 20, anchor: 'center' } }
    const input = createNativeRendererJsonFrameInput({ characters: [character] }, { projectAnimations: false, layout: { preset: 'landscape' }, container: { width: 960, height: height / 2, devicePixelRatio: 2 } })
    input.view.animations = [animation]
    const projected = spawnSync(clock, [], { input: `${JSON.stringify({ frame: input, nowMs: now })}\n`, encoding: 'utf8', timeout: 30000 })
    if (projected.status !== 0) throw new Error(`Rust clock ${item.id}: ${projected.error || projected.stderr}`)
    const projection = JSON.parse(projected.stdout)
    const framePath = resolve(output, `${item.id}.json`), capture = resolve(output, `${item.id}-native.png`)
    writeFileSync(framePath, JSON.stringify(projection.frame))
    writeFileSync(resolve(output, `${item.id}-timeline.json`), JSON.stringify({ frame: input, nowMs: now }, null, 2))
    const native = spawnSync(app, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1', QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: framePath,
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2', QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: `1920x${height}`,
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: capture, QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    writeFileSync(resolve(output, `${item.id}.log`), `${native.stdout}\n${native.stderr}`)
    if (native.status !== 0) throw new Error(`Native ${item.id}: ${native.error || native.stderr}`)
    const prefix = 'Qua native window smoke json: '
    const summary = JSON.parse(native.stdout.split('\n').find(l => l.startsWith(prefix)).slice(prefix.length))
    if (summary.frameCaptureWidth !== 1920 || summary.frameCaptureHeight !== height || summary.textureUploadErrorCount || summary.fontAtlasErrorCount || summary.textureShutdownCleanupErrorCount || summary.textureShutdownReleasedCount !== summary.textureUploadUploadedCount) throw new Error(`Capture/resources: ${item.id}`)
    await page.setViewportSize({ width: 1920, height })
    await page.setContent(`<style>html,body{margin:0;background:black;overflow:hidden}#stage{position:absolute;top:${(height - 1080) / 2}px;width:1920px;height:1080px}#sprite{position:absolute;left:840px;top:480px;width:240px;height:240px;opacity:.7;transform:rotate(20deg) scale(1.2)}</style><div id=stage><div id=sprite></div></div>`)
    await page.addScriptTag({ content: webCode })
    const layers = resolveSpriteProjection(manifest, character.sprite, character.expression).layers
    await page.evaluate(async ({ layers, urls, animation, now }) => {
      const root = document.getElementById('sprite')
      for (const [index, layer] of layers.entries()) {
        const el = document.createElement('img'); el.src = urls[layer.asset]
        Object.assign(el.style, { display: 'block', width: '240px', height: '240px', objectFit: 'contain' }, SpriteAudit.spriteLayerStyle(layer, index === 0, urls[layer.mask]))
        Object.assign(el.dataset, { spriteLayerAnimation: 'true', spriteLayerTargetPrefix: 'mira:one', spriteLayerKind: layer.kind,
          spriteLayerIndex: String(index), spriteLayerIsBase: String(index === 0), spriteLayerBase: JSON.stringify(layer) })
        root.append(el)
      }
      SpriteAudit.updateSpriteLayerAnimations(root, [animation], now)
      await Promise.all([...document.images].map(image => image.decode()))
      const mask = new Image(); mask.src = urls['motion/mask.png']; await mask.decode()
    }, { layers, urls, animation, now })
    const webPath = resolve(output, `${item.id}-web.png`); await page.screenshot({ path: webPath })
    const metrics = await page.evaluate(async ({ n, w }) => {
      const pixels = async src => { const image = new Image(); image.src = src; await image.decode(); const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data }
      const a = await pixels(n), b = await pixels(w); let sum = 0, painted = 0, over = 0
      for (let i = 0; i < a.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) { const delta = Math.abs(a[i+c] - b[i+c]); sum += delta; d = Math.max(d, delta) } if (Math.max(a[i], a[i+1], a[i+2], b[i], b[i+1], b[i+2]) > 0) painted++; if (d > 32) over++ }
      return { mae: sum / (3 * Math.max(1, painted)), fractionOver32: over / Math.max(1, painted) }
    }, { n: `data:image/png;base64,${readFileSync(capture).toString('base64')}`, w: `data:image/png;base64,${readFileSync(webPath).toString('base64')}` })
    report.cases.push({ id: item.id, ...metrics, localWorkActive: projection.localWorkActive, summary })
    console.log(JSON.stringify({ id: item.id, ...metrics }))
    writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
  }
  writeFileSync(resolve(output, 'review.html'), `<!doctype html><meta charset=utf-8><style>body{background:#15191f;color:white;font:16px system-ui}img{width:49%;background:black}</style><h1>Sprite animation: Native / Chrome</h1>${report.cases.map(c => `<h2>${c.id}: MAE ${c.mae.toFixed(3)}</h2><img src="${c.id}-native.png"><img src="${c.id}-web.png">`).join('')}`)
  if (report.cases.some(c => c.mae > report.limits.mae || c.fractionOver32 > report.limits.fractionOver32)) throw new Error('Sprite timeline raster limits exceeded; inspect review.html')
} finally { await browser.close() }
