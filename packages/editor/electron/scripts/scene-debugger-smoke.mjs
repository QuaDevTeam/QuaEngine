import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-scene-debugger-')))
const fixture = join(temporary, 'project')
const artifacts = resolve(root, '.codex-tmp/editor-scene-debugger')
await mkdir(fixture)
await mkdir(artifacts, { recursive: true })
await symlink(resolve(root, 'demo/node_modules'), join(fixture, 'node_modules'))
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'scene-debugger-fixture', type: 'module', scripts: { 'dev:web': 'vite' } }))
await writeFile(join(fixture, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Scene debugger', bundleId: 'dev.qua.scenedebugger', icons: { favicon: 'room.svg' }, targets: { web: { enabled: true } } }))
const plugins = []
for (const path of ['plugins/background', 'plugins/audio', 'game/character']) {
  const pkg = JSON.parse(await readFile(join(root, 'packages', path, 'package.json'), 'utf8'))
  plugins.push({ name: pkg.name, decorators: pkg.quajs.decorators, language: pkg.quajs.language })
}
await writeFile(join(fixture, 'qua.plugins.json'), JSON.stringify({ plugins }))
await writeFile(join(fixture, 'vite.config.ts'), `import { quaScriptPlugin } from '@quajs/script-compiler'; export default { server: { hmr: false }, plugins: [quaScriptPlugin()] }`)
await writeFile(join(fixture, 'index.html'), '<html><meta charset="utf-8"><div id="app"></div><script type="module" src="/main.ts"></script></html>')
await writeFile(join(fixture, 'room.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#274354"/><path d="M0 700 L1920 300 V1080 H0" fill="#536750"/></svg>')
await writeFile(join(fixture, 'hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect x="60" y="200" rx="90" width="280" height="600" fill="#779ab8"/><circle cx="200" cy="140" r="100" fill="#e6c6a8"/></svg>')
// Actual PCM WAV decoding/playback. Quiet synthetic tones; no Demo assets mutated.
const wav = Buffer.alloc(44 + 16000 * 30 * 2)
wav.write('RIFF')
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(16000, 24)
wav.writeUInt32LE(32000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(wav.length - 44, 40)
for (let i = 0; i < 16000 * 30; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 16000) * 80), 44 + i * 2)
for (const name of ['voice', 'bgm', 'sfx', 'ambient']) await writeFile(join(fixture, `${name}.wav`), wav)
const source = `@SetBackground("room.svg")
@ShowCharacter("hero", { sprite: "hero.svg", position: { x: 960, y: 900 } })
@PlayBGM("bgm.wav")
@PlayAmbient("ambient.wav")
@PlaySFX("sfx.wav")
@PlayVoice("voice.wav")
Hero: 第一句 🌧
Other: 第二句
Hero: 第三句
`
await writeFile(join(fixture, 'scene.qs'), source)
await writeFile(join(fixture, 'main.ts'), `
import { MemoryAssetStorage } from '@quajs/assets'
import { createWebAssetsAdapter } from '@quajs/assets-web'
import { QuaEngine } from '@quajs/engine'
import { registerCharacter } from '@quajs/character'
import { AudioPlugin, getAudioProjection, pauseAudioWithEngine, resumeAudioWithEngine, seekAudioWithEngine, stopAudioWithEngine } from '@quajs/plugin-audio'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { createQuaWebDomRenderer } from '@quajs/renderer-web'
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'
import '@quajs/renderer-vue/styles/base.scss'
import '@quajs/renderer-vue/styles/default.scss'
import scene from './scene.qs'
const entries = ['room.svg','hero.svg','voice.wav','bgm.wav','sfx.wav','ambient.wav'].map(name => ({ id: 'fixture:'+name, bundleName:'fixture', name:name==='hero.svg'?'hero/hero.svg':name, type:name.endsWith('.wav')?'audio':name==='hero.svg'?'characters':'images', locale:'default', path:name, mimeType:name.endsWith('.wav')?'audio/wav':'image/svg+xml' }))
const engine = new QuaEngine({ assets: { adapter:createWebAssetsAdapter({storage:new MemoryAssetStorage()}), provider:{mode:'memory', getManifest:async()=>({version:'1',assets:entries}),getAsset:async(_id,record)=>new Uint8Array(await(await fetch('/'+record.path)).arrayBuffer())} }, dialogue:{typewriter:{enabled:false}} })
engine.use(new AudioPlugin()).use(new BackgroundPlugin())
registerCharacter({ id:'hero', name:'Hero', aliases:['Hero'], sprite:'hero.svg' })
await engine.init()
const renderer = createQuaWebDomRenderer({container:document.getElementById('app')!,pipeline:engine.getPipeline(), assets:engine.getAssets(), initialView:engine.getViewState(), plugins:createVisualNovelWebRendererPlugins()})
await renderer.mount()
document.head.insertAdjacentHTML('beforeend','<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#121a24}.qua-character{width:400px}.qua-dialogue-box{font-size:28px}</style>')
if(import.meta.env.DEV && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1') {
 const [{createEditorPreviewRuntime},{mountWebPreviewDevtools},{getWebAudioPlaybackEntries}] = await Promise.all([import('@quajs/editor-core/runtime'),import('@quajs/renderer-web/devtools'),import('@quajs/renderer-web/audio')])
 const runtime = await createEditorPreviewRuntime(engine,{baselinePoint:{sceneId:'fixture',stepId:'baseline'},resolveFile:path=>{if(path!=='scene.qs')throw new Error('unknown source');return scene},getAudio:()=>{const a=getAudioProjection(engine);return [...(a.bgm?[a.bgm]:[]),...a.bgmOutgoing,...a.voices,...a.sfx,...a.ambients]},controlAudio:async q=>{if(q.action==='pause')await pauseAudioWithEngine(engine,q.target);if(q.action==='resume')await resumeAudioWithEngine(engine,q.target);if(q.action==='stop')await stopAudioWithEngine(engine,q.target);if(q.action==='seek')await seekAudioWithEngine(engine,q.target,q.positionMs)}})
 Object.assign(globalThis,{__QUA_EDITOR_PREVIEW__:runtime.request})
 mountWebPreviewDevtools({container:document.getElementById('app')!,pipeline:engine.getPipeline(),getViewState:()=>engine.getViewState(),getAudioPlayback:()=>getWebAudioPlaybackEntries(engine.getPipeline())})
} else { void engine.dialogue(scene()) }
`)

const startupGuard = join(temporary, 'startup-guard.cjs')
await writeFile(startupGuard, `process.on('uncaughtException', error => { console.error(error); process.exit(1) });require('electron').dialog.showErrorBox = (title, content) => { console.error(title, content); process.exit(1) }`)
let app
let page
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
async function preview(code) {
  return app.evaluate(async ({ webContents }, code) => {
    const contents = webContents.getAllWebContents().find(value => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value.getURL()))
    assertPreview(contents)
    function assertPreview(value) {
      if (!value)
        throw new Error('No preview WebContents')
    }
    return contents.executeJavaScript(code, true)
  }, code)
}
async function command(command) {
  return page.evaluate(async (command) => {
    const state = await window.quaEditor.previewState()
    return window.quaEditor.previewCommand(state.identity.sessionId, command)
  }, command)
}
async function debug() {
  return (await command({ action: 'debug', request: { kind: 'read', after: 0 } })).debug
}
async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check())
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout: ${label}`)
}
async function clickPreview(selector, x = 0.5, y = 0.5) {
  let previous = ''
  await until(async () => {
    const rect = await preview(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON())`)
    const stable = previous === rect
    previous = rect
    return stable
  }, 'stable preview layout')
  const point = await preview(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`)
  await app.evaluate(({ webContents }, point) => {
    const wc = webContents.getAllWebContents().find(value => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value.getURL()))
    wc.focus()
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  }, point)
}
try {
  // Even an accidentally inherited editor flag must not instrument a production build.
  process.env.VITE_QUA_EDITOR_PREVIEW = '1'
  await build({ root: fixture, logLevel: 'error', build: { target: 'es2022', outDir: join(temporary, 'production'), emptyOutDir: true } })
  const paths = await readdir(join(temporary, 'production/assets'))
  const js = (await Promise.all(paths.filter(path => path.endsWith('.js')).map(path => readFile(join(temporary, 'production/assets', path), 'utf8')))).join('\n')
  assert.ok(!/editor\/preview|qua-preview-devtools|__QUA_EDITOR_PREVIEW__|expectedText/.test(js), 'production excludes developer code and source metadata')
  delete process.env.VITE_QUA_EDITOR_PREVIEW
  process.stdout.write('Production bundle excludes devtools and source markers.\n')
  app = await _electron.launch({ executablePath: require('electron'), args: ['-r', startupGuard, editorRoot, '--project', fixture, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
  process.stdout.write('Electron launched.\n')
  page = await app.firstWindow({ timeout: 20000 })
  process.stdout.write('Editor window ready.\n')
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name="Scene debugger"]').waitFor()
  process.stdout.write('Project ready.\n')
  await page.locator('#run').click()
  await until(async () => (await page.evaluate(() => window.quaEditor.previewState())).phase === 'running', 'preview startup', 60000)
  await until(async () => preview('typeof globalThis.__QUA_EDITOR_PREVIEW__ === "function"'), 'runtime entry')
  process.stdout.write('Preview runtime ready.\n')
  await command({ action: 'seek', path: 'scene.qs', stepIndex: 0 })
  await page.locator('#tab-scene-debugger').click()
  await page.getByRole('button', { name: '拾取属性', exact: true }).click()
  await until(async () => (await debug()).picking, 'picking enabled')
  const before = await command({ action: 'status' })
  await until(async () => preview(`document.querySelector('.qua-character img')?.naturalWidth > 0`), 'character image decoded')
  await clickPreview('.qua-character', 0.5, 0.3)
  await page.locator('#visual-editor [data-decorator="ShowCharacter"]').waitFor()
  process.stdout.write('Character picked.\n')
  assert.equal((await command({ action: 'status' })).stepId, before.stepId)
  await clickPreview('.qua-background', 0.1, 0.2)
  await page.locator('#visual-editor [data-decorator="SetBackground"]').waitFor()
  await clickPreview('.qua-dialogue-box')
  await until(async () => preview('!document.querySelector(".inline-dialogue").hidden'), 'inline text editor')
  await until(async () => (await debug()).clips.filter(clip => clip.track).length === 4 && (await debug()).clips.filter(clip => clip.track).every(clip => clip.playback?.durationMs > 29000), 'real audio decode')
  await preview('document.querySelector(".inline-dialogue textarea").value="改写后的台词 🌧";document.querySelector("[data-action=apply]").click()')
  await page.waitForFunction(() => document.querySelector('#visual-editor [data-field="文本"]')?.value === '改写后的台词 🌧')
  assert.equal(await readFile(join(fixture, 'scene.qs'), 'utf8'), source, 'preview edit remains a draft')
  await until(async () => preview('document.querySelector(".inline-dialogue").hidden'), 'writeback response')
  await page.locator('#visual-editor [data-field="文本"]').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForFunction(() => document.querySelector('#visual-editor [data-field="文本"]')?.value === '第一句 🌧')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.waitForFunction(() => document.querySelector('#visual-editor [data-field="文本"]')?.value === '改写后的台词 🌧')
  // A second request against the old compiled source must not overwrite the draft.
  await clickPreview('.qua-dialogue-box')
  await preview('document.querySelector(".inline-dialogue textarea").value="stale overwrite";document.querySelector("[data-action=apply]").click()')
  await until(async () => preview('document.querySelector(".qua-preview-devtools output").textContent.includes("已变化")'), 'stale source rejection')
  assert.equal(await page.locator('#visual-editor [data-field="文本"]').inputValue(), '改写后的台词 🌧')
  await preview('document.querySelector("[data-action=cancel]").click()')
  await page.locator('#save').click()
  await until(async () => (await readFile(join(fixture, 'scene.qs'), 'utf8')).includes('改写后的台词'), 'saved QS')
  await until(async () => {
    const state = await page.evaluate(() => window.quaEditor.previewState())
    if (state.reloading)
      return false
    return preview('document.querySelector(".qua-dialogue-box")?.textContent.includes("改写后的台词")').catch(() => false)
  }, 'saved text rendered', 60000)
  await until(async () => {
    const tracks = (await debug()).clips.filter(clip => clip.track)
    return tracks.length === 4 && tracks.every(clip => clip.playback?.durationMs > 29000 && clip.playback?.state === 'playing')
  }, 'all decoded audio lanes')
  await page.locator('#tab-scene-debugger').click()
  await page.getByRole('button', { name: '暂停全部音频', exact: true }).click()
  await until(async () => (await debug()).clips.filter(clip => clip.track).every(clip => clip.playback?.state === 'paused'), 'pause all audio')
  const bgm = (await debug()).clips.find(clip => clip.kind === 'bgm')
  await command({ action: 'debug', request: { kind: 'audio', action: 'seek', target: bgm.track.id, positionMs: 5000 } })
  await until(async () => (await debug()).clips.find(clip => clip.kind === 'bgm')?.playback?.positionMs >= 5000, 'seek paused audio')
  await until(async () => (await debug()).timeMs > 3000, 'visible timeline intervals')
  await page.locator('#panel-scene-debugger').getByRole('button', { name: '单步', exact: true }).click()
  await until(async () => (await debug()).clips.filter(clip => clip.kind === 'dialogue').length >= 2, 'dialogue timeline')
  const data = await debug()
  assert.ok(data.clips.some(clip => clip.lane === 'Hero'))
  assert.ok(data.clips.some(clip => clip.lane === 'Other'))
  await page.locator('.dock-separator[data-split-id="main"]').focus()
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowUp')
  await page.locator('.scene-dialogue-list button').filter({ hasText: 'Other' }).waitFor()
  await page.screenshot({ path: join(artifacts, 'timeline.png') })
  const capture = await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(value => /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value.getURL()))
    return (await wc.capturePage()).toPNG().toString('base64')
  })
  await writeFile(join(artifacts, 'preview.png'), Buffer.from(capture, 'base64'))
  await writeFile(join(artifacts, 'trace.json'), JSON.stringify(data, null, 2))
  await page.locator('.scene-dialogue-list button').filter({ hasText: 'Hero' }).dblclick()
  await until(async () => {
    try {
      return (await command({ action: 'status' })).stepIndex === 0
    }
    catch (error) {
      if (String(error).includes('正在更新预览'))
        return false
      throw error
    }
  }, 'replay from dialogue')
  await page.locator('#tab-scene-debugger').click()
  await page.getByRole('button', { name: '自动阅读', exact: true }).click()
  await until(async () => (await debug()).flow === 'auto', 'auto reading')
  await page.getByRole('button', { name: '停止自动阅读', exact: true }).click()
  await until(async () => (await debug()).flow === 'normal', 'manual reading')
  await page.locator('#stop').click()
  assert.deepEqual(errors, [])
  process.stdout.write('Scene debugger: production isolation, real preview picks, guarded QS draft/undo/save/reload, four decoded audio lanes, pause/seek and speaker timeline passed.\n')
}
catch (error) {
  console.error(error)
  if (app) {
    await writeFile(join(artifacts, 'preview-failure.json'), JSON.stringify(await preview(`(()=>({body:document.body.innerHTML, sizes:[...document.querySelectorAll('.qua-dialogue-box,.qua-character,.qua-background')].map(e=>({cls:e.className,rect:e.getBoundingClientRect().toJSON(),text:e.textContent})),width:innerWidth,height:innerHeight}))()`), null, 2)).catch(() => {})
    await writeFile(join(artifacts, 'debug-failure.json'), JSON.stringify(await debug(), null, 2)).catch(() => {})
  }
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  if (page)
    await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ error: String(error), logs: await page.locator('#logs').textContent(), state: await page.evaluate(() => window.quaEditor.previewState()) }, null, 2)).catch(() => {})
  throw error
}
finally {
  delete process.env.VITE_QUA_EDITOR_PREVIEW
  await page?.evaluate(() => window.quaEditor.stopPreview()).catch(() => {})
  await app?.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 })
  }).catch(() => {})
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
