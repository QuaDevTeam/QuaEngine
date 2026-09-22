import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { backgroundAuditAssets, png } from './background-assets.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, 'packages/native/target/render-audit/background-transitions')
mkdirSync(output, { recursive: true })
const vueRuntime = createRequire(resolve(root, 'packages/render/vue/package.json')).resolve('vue/dist/vue.runtime.esm-bundler.js')
const server = await createServer({ configFile: false, root, resolve: { alias: { vue: vueRuntime } }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { web: [], native: [] }
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } })
  await page.goto(`${base}package.json`)
  await page.evaluate(async () => {
    const { BackgroundShaderCanvas } = await import('/packages/render/web/src/plugins/background-runtime/shader.ts')
    window.Shader = BackgroundShaderCanvas
    document.body.innerHTML = ''
    document.body.style.margin = '0'
  })
  const sources = {
    wgsl: 'fn transition(uv: vec2<f32>) -> vec4<f32> { return mix(sampleFrom(uv), sampleTo(uv), smoothstep(uv.x-params.x, uv.x+params.x, progress)); }',
    glsl: 'vec4 transition(vec2 uv) { return mix(sampleFrom(uv), sampleTo(uv), smoothstep(uv.x-params.x, uv.x+params.x, progress)); }',
    params: [0.01, 0, 0, 0],
  }
  const pixels = await page.evaluate(async ({ sources }) => {
    const shader = new window.Shader(document, sources, 320, 180)
    await shader.ready
    const colors = ['red', 'blue'].map(color => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180
      const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 180)
      return c
    })
    shader.upload(...colors)
    document.body.append(shader.canvas)
    const samples = [0, 0.5, 1].map(progress => {
      shader.draw(progress)
      const gl = shader.canvas.getContext('webgl2')
      const sample = x => { const bytes = new Uint8Array(4); gl.readPixels(x, 90, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return [...bytes] }
      return { progress, left: sample(40), right: sample(280) }
    })
    shader.draw(0.5)
    return samples
  }, { sources })
  assert.deepEqual(pixels[0].left, [255, 0, 0, 255])
  assert.deepEqual(pixels[1].left, [0, 0, 255, 255])
  assert.deepEqual(pixels[1].right, [255, 0, 0, 255])
  assert.deepEqual(pixels[2].right, [0, 0, 255, 255])
  report.web = pixels
  await page.screenshot({ path: resolve(output, 'shader-web.png') })
  report.invalidWebShaderRejected = await page.evaluate(async () => {
    try { await new window.Shader(document, { glsl: 'broken shader', wgsl: '' }, 16, 16).ready; return false }
    catch { return true }
  })
  assert.equal(report.invalidWebShaderRejected, true)

  report.lifecycle = await page.evaluate(async (sources) => {
    const [{ Pipeline }, { createViewLayoutProjection, LogicToRenderEvents }, { QuaWebDomRenderer }, { createBackgroundWebRendererPlugin }, backgroundApi] = await Promise.all([
      import('/packages/core/pipeline/src/index.ts'), import('/packages/render/core/src/index.ts'),
      import('/packages/render/web/src/dom.ts'), import('/packages/render/web/src/plugins/background.ts'),
      import('/packages/plugins/background/src/index.ts'),
    ])
    const pipeline = new Pipeline()
    const container = document.createElement('div'); container.style.cssText = 'width:320px;height:180px;position:relative'
    document.body.replaceChildren(container)
    let releaseNew
    let gate = new Promise(resolve => { releaseNew = resolve })
    const assets = {
      on() {}, off() {},
      async getAsset(type, name) {
        if (name === 'blue.png') await gate
        const color = name === 'blue.png' ? 'blue' : 'red'
        return { data: new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/></svg>`), mimeType: 'image/svg+xml' }
      },
    }
    let view = { layout: createViewLayoutProjection(), characters: [], dialogue: { visible: false, text: '' }, choices: [], ui: { visible: true }, effects: [], animations: [], plugins: {} }
    const store = {}
    const publish = () => pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view })
    const engine = {
      getViewState: () => view, getPipeline: () => pipeline, getStore: () => store,
      async setBackgroundProjection(background) { view = { ...view, background }; await publish() },
      async setAnimationProjection(animation) { view = { ...view, animations: [...view.animations.filter(a => a.id !== animation.id), animation] }; await publish() },
      async removeAnimationProjection(id) { view = { ...view, animations: view.animations.filter(a => a.id !== id) }; await publish() },
    }
    const renderer = new QuaWebDomRenderer({ container, pipeline, assets, initialView: view, plugins: [createBackgroundWebRendererPlugin()] })
    await renderer.mount()
    await backgroundApi.setBackgroundWithEngine(engine, 'red.png')
    const pending = backgroundApi.setBackgroundWithEngine(engine, 'blue.png', { transition: { type: 'crossfade', duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 40))
    const preparing = { layers: view.background.layers.map(l => l.opacity), animations: view.animations.length, oldDecoded: [...container.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0) }
    releaseNew(); await pending
    const final = { asset: view.background.assetName, preparation: view.background.preparationId, images: container.querySelectorAll('img').length }
    const shaderPending = backgroundApi.setBackgroundWithEngine(engine, 'red.png', { transition: { type: 'shader', duration: 160, shader: sources } })
    let shaderSeen = false
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      if (container.querySelector('.qua-background--shader')) { shaderSeen = true; break }
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    await shaderPending
    let rejected = false
    try { await backgroundApi.setBackgroundWithEngine(engine, 'blue.png', { transition: { type: 'shader', shader: { ...sources, glsl: 'invalid shader' } } }) }
    catch { rejected = true }
    const rollback = view.background.assetName
    await renderer.unmount()
    const { createApp, h, nextTick, QuaRenderer, createBackgroundRendererPlugin } = await import('/scripts/native-render-audit/background-vue.ts')
    const app = createApp({ render: () => h(QuaRenderer, { pipeline, assets, initialView: view, plugins: [createBackgroundRendererPlugin()] }) })
    app.mount(container)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 30))
    const vuePending = backgroundApi.setBackgroundWithEngine(engine, 'blue.png', { transition: { type: 'shader', duration: 250, shader: sources } })
    const vueDeadline = performance.now() + 5000
    let vueShaderSeen = false
    let vueFallbackImages = -1
    while (performance.now() < vueDeadline) {
      if (container.querySelector('.qua-background--shader')) {
        await nextTick()
        vueShaderSeen = true
        vueFallbackImages = container.querySelectorAll('img').length
        break
      }
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    await vuePending
    app.unmount()
    await nextTick()
    return { preparing, final, shaderSeen, rejected, rollback, vueShaderSeen, vueFallbackImages, remainingReadyListeners: pipeline.getListenerCount('background/ready') }
  }, sources)
  assert.deepEqual(report.lifecycle.preparing.layers, [1, 0])
  assert.equal(report.lifecycle.preparing.animations, 0)
  assert.equal(report.lifecycle.preparing.oldDecoded, true)
  assert.equal(report.lifecycle.final.asset, 'blue.png')
  assert.equal(report.lifecycle.shaderSeen, true)
  assert.equal(report.lifecycle.rejected, true)
  assert.equal(report.lifecycle.rollback, 'red.png')
  assert.equal(report.lifecycle.vueShaderSeen, true)
  assert.equal(report.lifecycle.vueFallbackImages, 0)
  assert.equal(report.lifecycle.remainingReadyListeners, 0)

  if (!process.argv.includes('--web-only')) {
    const { qpk } = await backgroundAuditAssets(undefined, output, 'images', new Map([['red.png', png(32, 18, () => [255, 0, 0, 255])], ['blue.png', png(32, 18, () => [0, 0, 255, 255])]]))
    const binary = process.env.QUA_NATIVE_TEST_APP || resolve(root, 'packages/native/target/debug/quajs_native_app')
    for (const progress of [0, 0.5, 1]) {
      const background = { mode: 'layered', layers: [
        { id: 'old', assetName: 'red.png', opacity: 1 },
        { id: 'new', assetName: 'blue.png', opacity: 1, zIndex: 1000 },
      ], shaderTransition: { shader: sources, progress, incomingLayerIds: ['new'] } }
      const fixture = resolve(output, `shader-${progress}.json`)
      const capture = resolve(output, `shader-${progress}-native.png`)
      writeFileSync(fixture, JSON.stringify({ layout: { preset: 'landscape' }, container: { width: 320, height: 180, devicePixelRatio: 1 }, view: { background } }))
      const result = spawnSync(binary, [], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, QUA_NATIVE_LOG: 'warn', QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1', QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixture,
          QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2', QUA_NATIVE_RENDERER_WINDOW_CAPTURE_SIZE: '320x180', QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: capture,
          QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpk } })
      writeFileSync(resolve(output, `shader-${progress}.log`), `${result.stdout}\n${result.stderr}`)
      assert.equal(result.status, 0, result.stderr)
      const png = `data:image/png;base64,${readFileSync(capture).toString('base64')}`
      const sample = await page.evaluate(async (url) => {
        const image = new Image(); image.src = url; await image.decode()
        const c = document.createElement('canvas'); c.width = 320; c.height = 180
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0)
        return { left: [...ctx.getImageData(40, 90, 1, 1).data], right: [...ctx.getImageData(280, 90, 1, 1).data], center: [...ctx.getImageData(160, 90, 1, 1).data] }
      }, png)
      report.native.push({ progress, ...sample })
    }
    assert.deepEqual(report.native[0].left, [255, 0, 0, 255])
    for (let i = 0; i < report.native.length; i++) {
      assert.deepEqual(report.native[i].left, report.web[i].left)
      assert.deepEqual(report.native[i].right, report.web[i].right)
    }
    assert.deepEqual(report.native[1].right, report.native[0].right)
    assert.deepEqual(report.native[1].left, report.native[2].left)
    assert.notDeepEqual(report.native[0].center, report.native[2].center)
  }
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close(); await server.close() }
