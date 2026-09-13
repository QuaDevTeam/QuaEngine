import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { readQpkBundle } from '../packages/build/quack/dist/index.js'
import { background, cases, projectBrowserNode, translateNode } from './native-render-audit/cases.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit')
mkdirSync(output, { recursive: true })
const index = JSON.parse(readFileSync(resolve(root, 'demo/dist/assets/index.json')))
const qpk = resolve(root, 'demo/dist/assets', index.targets['native-macos'].filename)
const bundle = await readQpkBundle(qpk)
const assetBytes = name => {
  const bytes = bundle.assets.get(`assets/${name}`)
  if (!bytes) throw new Error(`Missing audit asset in QPK: ${name}`)
  return bytes
}
const pngUrl = name => `data:image/${name.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${assetBytes(`images/${name}`).toString('base64')}`
const fonts = [
  { id: 'audit-latin', family: 'Noto Sans', assetName: 'NotoSans-Regular.ttf' },
  { id: 'audit-cjk', family: 'Noto Sans', assetName: 'NotoSansCJKsc-Regular.otf' },
]
// CSS tries the last matching face first; native uses projection order.
const fontCss = [...fonts].reverse().map(font => `@font-face{font-family:"${font.family}";src:url(data:font/ttf;base64,${assetBytes(`fonts/${font.assetName}`).toString('base64')})}`).join('\n')
const urls = Object.fromEntries(['backgrounds/morning-city.jpg', 'cg/title.webp'].map(name => [name, pngUrl(name)]))
const report = { date: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'Real Metal/WGPU PNG readback vs Chrome CSS rasterization; resolved geometry, 1920x1080 physical pixels. MAE is per RGB channel (0..255), not a whole-renderer parity score.',
  qpk, browser: '', pages: [], cases: [], rejected: [] }

function makeFixture(nodes) {
  return { layout: { preset: 'landscape' }, container: { width: 960, height: 540, devicePixelRatio: 2 }, view: {
    plugins: { fonts: { revision: 1, faces: fonts.map(f => ({ ...f, assetType: 'fonts' })) } },
    ui: { visible: true, overlays: [{ elementId: 'audit', visible: true, renderMode: 'render-only', interactive: false,
      overlayStack: 'screen', surface: { key: 'native/test/render-audit', root: {
        id: 'root', kind: 'Box', visible: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        style: { backgroundColor: background }, children: nodes,
      } } }] },
  } }
}
const cleanEnv = { ...process.env }
for (const key of Object.keys(cleanEnv)) if (key.startsWith('QUA_NATIVE_')) delete cleanEnv[key]
const nativeBinary = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')

if (!process.argv.includes('--skip-build')) {
  const build = spawnSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml', '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, encoding: 'utf8', timeout: 300000 })
  writeFileSync(resolve(output, 'build.log'), `${build.stdout || ''}\n${build.stderr || ''}`)
  if (build.status !== 0) throw new Error(`Native audit build failed: ${build.error || build.stderr}`)
}
// Exercise the product JSON boundary individually so one rejected feature does
// not prevent unrelated accepted features from reaching the real GPU.
for (const item of cases) {
  const fixturePath = resolve(output, `probe-${item.id}.json`)
  writeFileSync(fixturePath, JSON.stringify(makeFixture([item])))
  const probe = spawnSync(nativeBinary, [], { cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...cleanEnv, QUA_NATIVE_LOG: 'error', QUA_NATIVE_RENDERER_SMOKE_FRAME: fixturePath } })
  writeFileSync(resolve(output, `probe-${item.id}.log`), `${probe.stdout || ''}\n${probe.stderr || ''}`)
  if (probe.status !== 0) {
    if (!probe.stderr?.includes('Invalid native renderer frame JSON')) throw new Error(`Probe failed: ${probe.error || probe.stderr}`)
    report.rejected.push({ id: item.id, reason: probe.stderr.trim() })
  } else if (!probe.stdout.includes('Qua native renderer smoke json: ')) throw new Error('Native binary has no renderer smoke support')
}
const rejected = new Set(report.rejected.map(item => item.id))
console.log(JSON.stringify({ testedAtJsonBoundary: cases.length, rejected: [...rejected] }))
const browser = await chromium.launch({ timeout: 30000, ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM }
  : { channel: process.env.QUA_PARITY_BROWSER || 'chrome' }) })
report.browser = browser.version()
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  for (let start = 0; start < cases.length; start += 16) {
    const batch = cases.slice(start, start + 16)
    const number = start / 16
    const nodes = batch.map((item, i) => translateNode(item, (i % 4) * 480, Math.floor(i / 4) * 270))
    const fixture = makeFixture(nodes.filter(item => !rejected.has(item.id)))
    const fixturePath = resolve(output, `fixture-${number}.json`)
    const nativePath = resolve(output, `native-${number}.png`)
    writeFileSync(fixturePath, JSON.stringify(fixture))
    const env = { ...cleanEnv }
    Object.assign(env, { QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
      QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixturePath, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
      QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: nativePath, QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk })
    const run = spawnSync(nativeBinary, [], { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024 })
    writeFileSync(resolve(output, `native-${number}.log`), `${run.stdout || ''}\n${run.stderr || ''}`)
    if (run.status !== 0) throw new Error(`Native page ${number} failed: ${run.error || run.stderr}`)
    const summaryLine = run.stdout.split('\n').find(line => line.startsWith('Qua native window smoke json: '))
    if (!summaryLine) throw new Error(`Native page ${number} has no capture summary`)
    const summary = JSON.parse(summaryLine.slice('Qua native window smoke json: '.length))
    if (summary.frameCaptureWidth !== 1920 || summary.frameCaptureHeight !== 1080 || summary.textureUploadErrorCount || summary.fontAtlasErrorCount)
      throw new Error(`Invalid native capture/resource sync: ${JSON.stringify(summary)}`)
    await page.setContent(`<style>html,body{margin:0;background:${background}}${fontCss}</style>`)
    await page.evaluate(`globalThis.projectBrowserNode = ${projectBrowserNode.toString()}`)
    await page.evaluate(({ nodes, urls }) => {
      for (const item of nodes) globalThis.projectBrowserNode(item, document.body, urls)
    }, { nodes, urls })
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map(image => image.decode()))
    })
    const webPath = resolve(output, `web-${number}.png`)
    await page.screenshot({ path: webPath })
    const comparisons = await page.evaluate(async ({ nativeUrl, webUrl, ids }) => {
      async function pixels(url) {
        const image = new Image(); image.src = url; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, image.width, image.height).data
      }
      const native = await pixels(nativeUrl); const web = await pixels(webUrl)
      return ids.map((id, i) => {
        const left = (i % 4) * 480; const top = Math.floor(i / 4) * 270
        let sum = 0; let changed = 0; let max = 0; let nonBackground = 0
        for (let y = top + 20; y < top + 250; y++) for (let x = left + 20; x < left + 450; x++) {
          const at = (y * 1920 + x) * 4
          let delta = 0
          for (let c = 0; c < 3; c++) { const d = Math.abs(native[at + c] - web[at + c]); sum += d; delta = Math.max(delta, d) }
          if (delta > 16) changed++
          max = Math.max(max, delta)
          if (Math.abs(native[at] - 32) + Math.abs(native[at + 1] - 37) + Math.abs(native[at + 2] - 43) > 15) nonBackground++
        }
        const count = 430 * 230
        const at = ((top + 120) * 1920 + left + 180) * 4
        return { id, mae: sum / (count * 3), fractionOver16: changed / count, maxChannelDelta: max,
          nativeNonBackgroundFraction: nonBackground / count, centerNative: Array.from(native.slice(at, at + 4)), centerWeb: Array.from(web.slice(at, at + 4)) }
      })
    }, { nativeUrl: `data:image/png;base64,${readFileSync(nativePath).toString('base64')}`, webUrl: `data:image/png;base64,${readFileSync(webPath).toString('base64')}`, ids: batch.map(c => c.id) })
    report.pages.push({ number, summary })
    report.cases.push(...comparisons.map(item => rejected.has(item.id)
      ? { id: item.id, status: 'rejected-at-json-boundary', page: number }
      : { ...item, status: 'rasterized', page: number }))
    for (const item of comparisons) if (!rejected.has(item.id) && item.nativeNonBackgroundFraction === 0)
      throw new Error(`Native case is blank: ${item.id}`)
    writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ page: number, cases: comparisons.map(c => ({ id: c.id, mae: rejected.has(c.id) ? null : +c.mae.toFixed(3) })) }))
  }
  writeFileSync(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8"><title>Native render audit</title>
<style>body{font:16px system-ui;background:#161b20;color:#eee;margin:24px}.pair{position:relative;max-width:1500px}img{display:block;width:100%}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:100%;max-width:1500px}table{border-collapse:collapse}td,th{padding:6px 18px;border-bottom:1px solid #455}</style>
<h1>Native / Chrome</h1><p>Native left, Chrome right. Cell order: left to right, top to bottom. RGB error is measured over each cell, including its margin. Blank native cells are rejected at the JSON boundary; see the table.</p>
${report.pages.map(({ number }) => `<h2>Page ${number}</h2><p>${cases.slice(number * 16, number * 16 + 16).map(c => c.id).join(' | ')}</p><div class="pair"><img src="web-${number}.png"><img class="native" src="native-${number}.png"></div><input aria-label="Comparison divider" type="range" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'"></input>`).join('')}
<table><tr><th>Feature</th><th>Mean RGB error</th><th>Pixels over 16/255</th></tr>${report.cases.map(c => `<tr><td>${c.id}</td><td>${c.mae?.toFixed(3) ?? c.status}</td><td>${c.fractionOver16 === undefined ? '-' : `${(100 * c.fractionOver16).toFixed(2)}%`}</td></tr>`).join('')}</table>`)
  console.log(`Audit: ${report.cases.length} measured cases; ${output}/review.html`)
} finally { await browser.close() }
