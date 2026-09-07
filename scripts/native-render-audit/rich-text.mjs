import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build } from 'vite'
import { readQpkBundle } from '../../packages/build/quack/dist/index.js'
import { createNativeRendererViewProjection } from '../../packages/native/engine-native/dist/index.js'

// Measure actual Web plugin inline-block layout against Native atlas geometry.
// Text colors isolate glyphs from the native dialogue chrome and its shadows.
const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, process.env.QUA_NATIVE_AUDIT_OUTPUT || 'packages/native/target/render-audit/rich-text')
mkdirSync(output, { recursive: true })
const index = JSON.parse(readFileSync(resolve(root, 'demo/dist/assets/index.json')))
const qpk = resolve(root, 'demo/dist/assets', index.targets['native-macos'].filename)
const bundle = await readQpkBundle(qpk)
const fonts = [
  { id: 'latin', family: 'Audit Latin', assetName: 'NotoSans-Regular.ttf', weight: '400' },
  { id: 'cjk', family: 'Audit CJK', assetName: 'NotoSansCJKsc-Regular.otf', weight: '400' },
]
const fontCss = fonts.map(font => {
  const bytes = bundle.assets.get(`assets/fonts/${font.assetName}`)
  if (!bytes) throw new Error(`Missing QPK font: ${font.assetName}`)
  return `@font-face{font-family:"${font.family}";font-weight:${font.weight};src:url(data:font/ttf;base64,${bytes.toString('base64')})}`
}).join('\n')
const webBuild = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: false,
  lib: { entry: resolve(root, 'packages/render/web/src/plugins/dialogue.ts'), name: 'QuaAuditDialogue', formats: ['iife'] } } })
const webCode = (Array.isArray(webBuild) ? webBuild : [webBuild]).flatMap(r => r.output).find(o => o.type === 'chunk').code
const span = (text, color = '#ff0000', extra = {}) => ({ text, color, ...extra })
const document = (blocks, extra = {}) => ({ kind: 'rich-text', fontFamily: 'Audit Latin', fontSize: 24,
  blocks: blocks.map(spans => ({ type: 'paragraph', spans })), ...extra })
const cases = [
  { id: 'proportional', text: document([[span('iiiiiiii'), span('MMMM', '#00ff00'), span('office', '#0000ff')]]) },
  { id: 'span-spaces', text: document([[span('Hello'), span(' world', '#00ff00'), span('  !', '#0000ff')]]) },
  { id: 'wrapped-spaces', text: document([[span('  Leading spaces survive wrapping. '.repeat(6))]]) },
  { id: 'mixed-size', text: document([[span('small'), span('BIG', '#00ff00', { fontSize: 40 }), span('small', '#0000ff')]]) },
  { id: 'mixed-family', text: document([[span('Latin'), span('中文基线', '#00ff00', { fontFamily: 'Audit CJK' }), span('office', '#0000ff')]]) },
  { id: 'blocks', text: document([[span('First block')], [span('Second block', '#00ff00')]]) },
  { id: 'multiline-baseline', text: document([[span('first\nsecond'), span('last baseline', '#00ff00')]]) },
  { id: 'center', text: document([[span('iiii'), span('MMMM', '#00ff00')]], { textAlign: 'center' }) },
  { id: 'right', text: document([[span('iiii'), span('MMMM', '#00ff00')]], { textAlign: 'right' }) },
  { id: 'atomic-wrap', text: document([[span('Wide words occupy the available line. '.repeat(3)), span('Move this complete span onto the next line.', '#00ff00')]]) },
  { id: 'long-span', text: document([[span('A long inline block wraps its words using font advances. '.repeat(4))]]) },
  { id: 'cjk-wrap', text: document([[span('中文的换行需要保留标点和字体测量。'.repeat(8), '#00ff00', { fontFamily: 'Audit CJK' })]]) },
  { id: 'combining', text: document([[span('e\u0301e\u0301e\u0301'), span('office affine', '#00ff00')]]) },
  { id: 'scaled-letterbox', container: { width: 960, height: 600, devicePixelRatio: 1 },
    text: document([[span('iiiiiiii'), span('Wide', '#00ff00', { fontSize: 40 }), span('中文', '#0000ff', { fontFamily: 'Audit CJK' })]]) },
  ...[1.5, '150%', '1.5em', '36px', 'normal', 0].map((lineHeight, index) => ({
    id: `line-height-${index}`, text: document([[span('first\nsecond'), span('Large\nchild', '#00ff00', { fontSize: '2em' }), span('tail', '#0000ff')]], { lineHeight }),
  })),
  { id: 'block-inheritance', text: document([], { fontSize: '24px', lineHeight: 1.5, blocks: [
    { type: 'paragraph', fontSize: '150%', textAlign: 'right', spans: [span('Paragraph size'), span('child', '#00ff00', { fontSize: '50%' })] },
    { type: 'paragraph', fontSize: '2em', lineHeight: '120%', textAlign: 'center', spans: [span('Computed line height', '#0000ff'), span('half', '#00ff00', { fontSize: '50%' })] },
  ] }) },
  { id: 'normal-cjk', text: document([[span('中文度量\n第二行', '#00ff00', { fontFamily: 'Audit CJK', fontSize: 48 }), span('Latin baseline')]], { lineHeight: 'normal' }) },
  { id: 'measured-narrow', text: document([[span('i'.repeat(900))]], { fontSize: 32, lineHeight: 1.5 }) },
  { id: 'measured-large-child', text: document([[span('Large text grows the dialogue panel. '.repeat(4), '#00ff00', { fontSize: 56 })]], { lineHeight: 1.5 }) },
  { id: 'empty-inline', text: document([[span('', '#ff0000', { fontSize: 120 })], [span('After empty inline', '#00ff00')]]) },
  { id: 'strut-only-family', text: document([], { blocks: [
    { type: 'paragraph', fontFamily: 'Audit CJK', fontSize: 48, lineHeight: 'normal', spans: [span('Latin text on a CJK paragraph strut', '#00ff00', { fontFamily: 'Audit Latin', fontSize: 24, lineHeight: '36px' })] },
    { type: 'paragraph', spans: [span('Next paragraph', '#0000ff')] },
  ] }) },
  { id: 'speaker-growth', speaker: document([[span('Speaker\nsecond line', '#0000ff', { fontSize: 36 })]], { lineHeight: 1.5 }),
    speakerStyle: { lineHeight: '1.2em' }, text: document([[span('Body follows measured speaker height')]]) },

]
const binary = process.env.QUA_NATIVE_AUDIT_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
if (!process.argv.includes('--skip-build')) execFileSync('cargo', ['build', '--locked', '--manifest-path', 'packages/native/Cargo.toml',
  '-p', 'quajs_native_app', '--features', 'native-window'], { cwd: root, stdio: 'inherit' })
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('QUA_NATIVE_')) delete env[key]
const report = { qpk, fontAssets: fonts.map(f => ({ ...f, sha256: createHash('sha256').update(bundle.assets.get(`assets/fonts/${f.assetName}`)).digest('hex') })), binary, binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'), date: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'Real Metal vs actual Web dialogue plugin in Chrome; same QPK fonts. Colored glyph bounds and bidirectional 2px mask distance, independent of dialogue chrome. Settled text with independent browser auto-height and bottom anchoring; CSS units, block inheritance and speaker growth included. Reveal, ruby, span motion and paragraph bidi remain outside this visual gate.',
  limits: { boundsDelta: 3, unmatchedFraction: 0.035 }, cases: [] }
const browser = await chromium.launch({ timeout: 30000, ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
report.browser = browser.version()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const selected = process.argv.find(arg => arg.startsWith('--case='))?.slice(7)
  const selectedCases = cases.filter(item => !selected || item.id === selected)
  if (!selectedCases.length) throw new Error(`Unknown rich text case: ${selected}`)
  for (const item of selectedCases) {
    const container = item.container || { width: 960, height: 540, devicePixelRatio: 2 }
    const width = container.width * container.devicePixelRatio, height = container.height * container.devicePixelRatio
    const scale = Math.min(width / 1920, height / 1080)
    const dialogue = { visible: true, mode: 'say', text: item.text, speaker: item.speaker, speakerStyle: item.speakerStyle, typewriter: { enabled: false } }
    const frame = { layout: { preset: 'landscape' }, container, view: createNativeRendererViewProjection({
      dialogue, plugins: { fonts: { revision: 1, faces: fonts.map(f => ({ ...f, assetType: 'fonts' })) } },
    }) }
    const fixture = resolve(output, `${item.id}.json`), nativePath = resolve(output, `${item.id}-native.png`), webPath = resolve(output, `${item.id}-web.png`)
    writeFileSync(fixture, JSON.stringify(frame))
    const result = spawnSync(binary, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
      env: { ...env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixture, QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
        QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: `${width}x${height}`, QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: nativePath,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
    writeFileSync(resolve(output, `${item.id}.log`), `${result.stdout || ''}\n${result.stderr || ''}`)
    if (result.status !== 0) throw new Error(`Native ${item.id}: ${result.error || result.stderr}`)
    const prefix = 'Qua native window smoke json: '
    const line = result.stdout.split('\n').find(line => line.startsWith(prefix))
    if (!line) throw new Error(`Missing native summary: ${item.id}`)
    const summary = JSON.parse(line.slice(prefix.length))
    if (summary.frameCaptureWidth !== width || summary.frameCaptureHeight !== height || summary.fontAtlasErrorCount !== 0
      || !summary.fontAtlasTextDrawCount || summary.textureShutdownFontAtlasErrorCount !== 0
      || !summary.fontAtlasUploadedCount || summary.textureShutdownFontAtlasReleasedCount !== summary.fontAtlasUploadedCount) throw new Error(`Invalid font capture/cleanup: ${JSON.stringify(summary)}`)
    // Browser computes content/panel height independently; no native estimate or
    // captured bounds feed Web positioning. Glyph Y therefore also gates reflow.
    const safeWidth = 1080 * 1.6, panelWidth = safeWidth * 0.9
    const box = { x: 0, y: 0, width: 1920, height: 1080 }
    await page.setViewportSize({ width, height })
    await page.setContent(`<!doctype html><style>${fontCss}html,body{margin:0;background:black;overflow:hidden}#stage{position:absolute;width:1920px;height:1080px;transform-origin:0 0;transform:scale(${scale});left:${(width - 1920 * scale) / 2}px;top:${(height - 1080 * scale) / 2}px}.qua-dialogue-box{position:absolute;box-sizing:border-box;left:${(1920 - safeWidth) / 2 + safeWidth * .05}px;bottom:54px;width:${panelWidth}px;min-height:132.3px;padding:22px 28px 18px;font-family:'Audit Latin';white-space:pre-wrap;overflow-wrap:anywhere}.qua-dialogue-speaker{font-size:18px;line-height:20px;font-weight:700;margin-bottom:8px}.qua-dialogue-text{margin:0;font-size:20px;line-height:36px}</style><div id=stage></div>`)
    await page.addScriptTag({ content: webCode })
    await page.evaluate(async dialogue => {
      if (document.compatMode !== 'CSS1Compat') throw new Error('Typography audit requires standards mode')
      const plugin = QuaAuditDialogue.createDialogueWebRendererPlugin()
      const disposers = []
      await plugin.setup({ getAssets: () => undefined, refresh() {}, addDisposer: fn => disposers.push(fn),
        registerAdvanceInterceptor: () => () => {} })
      const node = plugin.layers[0].render({ document, view: { dialogue, animations: [], plugins: {}, ui: { visible: true } } })
      if (!node) throw new Error('Real Web dialogue plugin returned no DOM')
      document.getElementById('stage').append(node)
      await document.fonts.ready
      if (![...document.querySelectorAll('.qua-rich-text-span')].every(s => getComputedStyle(s).display === 'inline-block'))
        throw new Error('Web span layout semantics changed')
    }, dialogue)
    const webLayout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height } }
      return { panel: rect('.qua-dialogue-box'), text: rect('.qua-dialogue-text'), speaker: rect('.qua-dialogue-speaker'), nodes: [...document.querySelectorAll('.qua-dialogue-speaker, .qua-rich-text-block, .qua-rich-text-span')].map(node => { const css = getComputedStyle(node), bounds = node.getBoundingClientRect(); return { text: node.textContent, tag: node.className, size: css.fontSize, lineHeight: css.lineHeight, font: css.fontFamily, height: bounds.height, y: bounds.y } }) }
    })
    await page.screenshot({ path: webPath })
    const metrics = await page.evaluate(async ({ nativeUrl, webUrl, width, height, box, scale }) => {
      const masks = async url => {
        const image = new Image(); image.src = url; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0)
        const pixels = ctx.getImageData(0, 0, width, height).data
        const masks = [new Set(), new Set(), new Set()]
        const x0 = Math.floor(box.x * scale + (width - 1920 * scale) / 2), y0 = Math.floor(box.y * scale + (height - 1080 * scale) / 2)
        for (let y = y0; y < y0 + Math.ceil(box.height * scale); y++) for (let x = x0; x < x0 + Math.ceil(box.width * scale); x++) {
          const offset = (y * width + x) * 4
          for (let c = 0; c < 3; c++) if (pixels[offset + c] - Math.max(pixels[offset + (c + 1) % 3], pixels[offset + (c + 2) % 3]) > 64)
            masks[c].add(y * width + x)
        }
        return masks
      }
      const n = await masks(nativeUrl), w = await masks(webUrl)
      const bounds = set => { const x = [...set].map(p => p % width), y = [...set].map(p => Math.floor(p / width));
        return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)] }
      const unmatched = (a, b) => [...a].filter(p => {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (b.has(p + dy * width + dx)) return false
        return true
      }).length
      return n.map((mask, c) => {
        if (!mask.size && !w[c].size) return { color: c, empty: true }
        const nativeBounds = bounds(mask), webBounds = bounds(w[c])
        return { color: c, nativePixels: mask.size, webPixels: w[c].size, nativeBounds, webBounds,
          boundsDelta: Math.max(...nativeBounds.map((v, i) => Math.abs(v - webBounds[i]))),
          unmatchedFraction: (unmatched(mask, w[c]) + unmatched(w[c], mask)) / Math.max(1, mask.size + w[c].size) }
      })
    }, { width, height, box, scale, nativeUrl: `data:image/png;base64,${readFileSync(nativePath).toString('base64')}`,
      webUrl: `data:image/png;base64,${readFileSync(webPath).toString('base64')}` })
    const passed = metrics.some(m => !m.empty) && metrics.every(m => m.empty || m.nativePixels && m.webPixels && m.boundsDelta <= report.limits.boundsDelta && m.unmatchedFraction <= report.limits.unmatchedFraction)
    report.cases.push({ id: item.id, passed, metrics, webLayout, summary })
    writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ id: item.id, passed, metrics }))
  }
  writeFileSync(resolve(output, 'review.html'), `<!doctype html><meta charset=utf-8><title>Rich text parity</title><style>body{background:#15191f;color:white;font:16px system-ui}.pair{display:flex}img{width:50%}</style><h1>Native / Chrome rich text</h1><p>${report.method}</p>${report.cases.map(c => `<h2>${c.id}: ${c.passed ? 'pass' : 'FAIL'}</h2><div class=pair><img src="${c.id}-native.png"><img src="${c.id}-web.png"></div>`).join('')}`)
  const failed = report.cases.filter(c => !c.passed)
  if (failed.length) throw new Error(`Rich text parity failed: ${failed.map(c => c.id).join(', ')}`)
  console.log(`Audit: ${report.cases.length} rich text cases; ${output}/review.html`)
} finally { await browser.close() }
