import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modules = resolve(process.argv[2] || join(demo, 'dist/embedded'))
const output = join(demo, '.generated/embedded-module-smoke')
await mkdir(output, { recursive: true })
await writeFile(join(output, 'report.json'), JSON.stringify({ success: false, status: 'running' }))
const report = { success: false, web: {}, godot: {} }
const parent = `<!doctype html><html><body><h1>Parent application</h1><div id="story" style="width:640px;height:360px"></div><script type="module">
import {mountEmbeddedFrame} from '/web/client.js';
window.openCase=parameters=>{
 window.messages=[];
 const session=mountEmbeddedFrame({container:document.getElementById('story'),url:'/web/index.html',sessionId:'quest-'+crypto.randomUUID(),storageNamespace:'fixture/account',parameters,onMessage:message=>window.messages.push(message)});
 window.story=session;window.outcome=undefined;window.storyClosed=false;
 session.result.then(value=>window.outcome=value);session.closed.then(()=>window.storyClosed=true);return session.ready;
};
</script></body></html>`
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.qpk': 'application/octet-stream' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(parent); return }
    const path = resolve(modules, `.${pathname}`)
    if (!path.startsWith(modules + sep)) throw new Error('Invalid path')
    const file = (await stat(path)).isDirectory() ? join(path, 'index.html') : path
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
    createReadStream(file).on('error', () => response.destroy()).pipe(response)
  }
  catch { response.writeHead(404).end() }
})
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4189, '127.0.0.1', resolve) })
let browser
try {
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true })
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4189/')
  await page.waitForFunction(() => !!window.openCase)
  await page.evaluate(() => window.openCase({ quest: 42 }))
  await page.waitForFunction(() => window.storyClosed)
  let result = await page.evaluate(() => ({ outcome: window.outcome, types: window.messages.map(message => message.type), frames: document.querySelectorAll('iframe').length }))
  assert.deepEqual(result.outcome, { status: 'completed', value: { quest: 42 } })
  assert.deepEqual(result.types, ['ready', 'result', 'closed'])
  assert.equal(result.frames, 0)
  report.web.completed = result
  await page.evaluate(() => window.openCase({ quest: 43, wait: true }))
  // A forged response from the parent window has the right session ID and origin,
  // but the wrong source. It must not settle the real child result.
  await page.evaluate(() => window.postMessage({ protocol: 'qua-embedded', version: 1, type: 'result', sessionId: window.messages[0].sessionId, outcome: { status: 'completed', value: 'forged' } }, location.origin))
  await page.frameLocator('iframe').getByText('Unity fixture').waitFor({state:'visible'})
  await page.screenshot({ path: join(output, 'web-parent.png') })
  assert.equal(await page.evaluate(() => window.outcome), undefined)
  await page.evaluate(() => window.story.destroy())
  result = await page.evaluate(() => ({ outcome: window.outcome, types: window.messages.map(message => message.type), parent: document.querySelector('h1').textContent }))
  assert.equal(result.outcome.status, 'cancelled')
  assert.equal(result.parent, 'Parent application')
  report.web.cancelled = result
  await page.evaluate(() => window.openCase({ quest: 44, failPersistence: true }))
  await page.waitForFunction(() => window.storyClosed)
  result = await page.evaluate(() => ({ outcome: window.outcome, types: window.messages.map(message => message.type) }))
  assert.equal(result.outcome.status, 'error')
  assert.equal(result.outcome.code, 'PERSISTENCE_FAILED')
  report.web.persistenceFailure = result
  await page.evaluate(() => {
    void window.openCase({ quest: 45, wait: true })
    return window.story.destroy()
  })
  result = await page.evaluate(() => ({ outcome: window.outcome, types: window.messages.map(message => message.type), frames: document.querySelectorAll('iframe').length }))
  assert.equal(result.outcome.status, 'cancelled')
  assert.equal(result.frames, 0)
  report.web.closeDuringInitialization = result
  assert.deepEqual(errors, [])
  report.web.errors = errors
}
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }

const godotModule = JSON.parse(await readFile(join(modules, 'godot/module.json'), 'utf8'))
const project = join(output, 'godot-parent')
await mkdir(project, { recursive: true })
await cp(join(modules, 'godot/project-files'), project, { recursive: true })
await writeFile(join(project, 'project.godot'), '[application]\nconfig/name="Embedded parent fixture"\nrun/main_scene="res://parent.tscn"\n[display]\nwindow/size/viewport_width=800\nwindow/size/viewport_height=600\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
await writeFile(join(project, 'parent.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://parent.gd" id="1"]\n[node name="Parent" type="Control"]\nscript=ExtResource("1")\n')
await writeFile(join(project, 'parent.gd'), `extends Control
var messages: Array = []
var outcomes: Array = []
func _ready() -> void:
 var title := Label.new();title.text="Parent application";add_child(title)
 var original_fps := Engine.max_fps
 for index in range(5):
  var story = load(${JSON.stringify(godotModule.entry.scene)}).instantiate()
  story.position=Vector2(80,100);story.storage_namespace="qa/account-"+str(index);add_child(story)
  messages=[];outcomes=[]
  story.story_message.connect(func(message):messages.append(message))
  story.story_result.connect(func(outcome):outcomes.append(outcome))
  story.open_story("quest-"+str(index),{"quest":42,"wait":index==1,"failPersistence":index==2,"hangPersistence":index==4})
  if index==3:story.stop_module()
  if index==4:
   await story.module_ready
   await get_tree().create_timer(0.1).timeout
   story.stop_module()
  if index==1:
   await story.module_ready
   await get_tree().create_timer(0.3).timeout
   get_viewport().get_texture().get_image().save_png("res://capture.png")
   story.cancel_story()
  await story.module_closed
  if outcomes.size()!=1:fail("Expected one terminal result: "+str(outcomes));return
  var expected := "completed" if index==0 else "error" if index==2 or index==4 else "cancelled"
  if outcomes[0].status!=expected:fail("Unexpected outcome: "+str(outcomes));return
  if index==0 and outcomes[0].value.quest!=42:fail("Parameters were lost");return
  if messages.back().type!="closed":fail("Missing final closed acknowledgement");return
  if not is_instance_valid(title) or Engine.max_fps!=original_fps:fail("Parent ownership changed");return
  story.queue_free();await get_tree().process_frame
 var file=FileAccess.open("res://report.json",FileAccess.WRITE);file.store_string(JSON.stringify({"success":true,"cases":["completed","cancelled","persistence-error","close-during-init","shutdown-timeout"],"parentContinued":true,"godot":Engine.get_version_info().string}));file.close();get_tree().quit()
func fail(message:String)->void:
 push_error(message);get_tree().quit(1)
`)
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
await new Promise((resolve, reject) => {
  const child = spawn(godot, ['--path', project], { stdio: 'inherit' })
  const timeout = setTimeout(() => { child.kill(); reject(new Error('Godot embedded business smoke timed out')) }, 60000)
  child.once('error', error => { clearTimeout(timeout); reject(error) })
  child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Godot fixture failed (${code})`)) })
})
report.godot = JSON.parse(await readFile(join(project, 'report.json'), 'utf8'))
await cp(join(project, 'capture.png'), join(output, 'godot-parent.png'))
report.success = true
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
process.stdout.write(`Embedded business evidence: ${output}\n`)
