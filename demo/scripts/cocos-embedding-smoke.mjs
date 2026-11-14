import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const moduleDir=process.argv[2] ? resolve(process.argv[2]) : undefined
const output = join(demo, moduleDir ? '.generated/cocos-embedded-module-smoke' : '.generated/cocos-embedding-smoke')
const original = join(demo, 'dist/cocos/workspace')
const workspace = join(output, 'workspace')
await mkdir(output, { recursive: true })
await writeFile(join(output, 'report.json'), JSON.stringify({ success: false, status: 'running', startedAt: new Date().toISOString() }, null, 2))
await rm(join(output, 'capture.png'), { force: true })
await rm(workspace, { recursive: true, force: true })
await cp(original, workspace, { recursive: true, filter: path => !['build', 'library', 'temp', 'profiles'].includes(path.slice(original.length + 1).split('/')[0]) })
// This fixture is a separate parent project, not another import of the source
// application's identity. SDK caches must not alias previously opened copies.
const packageFile = join(workspace, 'package.json')
const packageJson = JSON.parse(await readFile(packageFile, 'utf8'))
packageJson.uuid = randomUUID()
await writeFile(packageFile, JSON.stringify(packageJson, null, 2))
if(moduleDir){
  await cp(join(moduleDir,'project-files'),workspace,{recursive:true})
  const importPath=join(workspace,'qua-import-meta.json')
  const imports=JSON.parse(await readFile(importPath,'utf8'))
  const module=JSON.parse(await readFile(join(moduleDir,'module.json'),'utf8'))
  for(const file of module.files){if(file.path.startsWith('project-files/')&&file.path.endsWith('.meta')){const path=file.path.slice('project-files/'.length);imports.files[path]=JSON.parse(await readFile(join(workspace,path),'utf8'))}}
  await writeFile(importPath,JSON.stringify(imports,null,2))
}
const component = join(workspace, 'assets/qua-runtime/QuaBootstrap.ts')
const source = await readFile(component, 'utf8')
const decorator = source.match(/@ccclass\('[^']+'\)/)?.[0]
assert.ok(decorator, 'Generated scene class identity')
await writeFile(component, `import { Component, _decorator, Node, UITransform, Label, game, director } from 'cc';
import { start } from './runtime.js';
const {ccclass}=_decorator;
${decorator}
export class QuaBootstrap extends Component {
  private app:any; private report:any; private region:any; private sentinel:any; private parentLabel:any; private end:any; private closing=false;
  async start(){
    const report=this.report=globalThis.__QUA_EMBEDDING_REPORT__={ready:false,success:false,closed:0,subscribed:0,unsubscribed:0,appExitCalls:0};
    this.end=game.end; game.end=()=>{report.appExitCalls++};
    try{
      this.parentLabel=new Node('Parent-owned label');this.parentLabel.layer=this.node.layer;this.node.addChild(this.parentLabel);
      const label=this.parentLabel.addComponent(Label);label.string='Parent application';label.fontSize=32;this.parentLabel.setPosition(0,300,0);
      this.region=new Node('Narrative module');this.region.layer=this.node.layer;this.node.addChild(this.region);this.region.addComponent(UITransform).setContentSize(640,360);
      this.sentinel=new Node('Parent-owned module child');this.sentinel.layer=this.node.layer;this.region.addChild(this.sentinel);
      this.app=await start(this.region,this.options());
      await new Promise(resolve=>this.scheduleOnce(resolve,1));report.ready=true;report.container={width:640,height:360};
    }catch(error){report.error=String(error)+(error?.stack||'');game.end=this.end;console.error(error);}
  }
  options(){return {${moduleDir ? `request:{protocol:'qua-embedded',version:1,type:'open',sessionId:'qa-'+this.report.subscribed,storageNamespace:'qa-embedding/account-42',parameters:{quest:42,wait:!this.report.restarted}},` : ''}embedded:true,storageNamespace:'qa-embedding/account-42',input:{onInput:()=>{this.report.subscribed++;return ()=>{this.report.unsubscribed++}}},layout:{getContainerSize:()=>({width:640,height:360}),onLayoutChange:()=>()=>{}},onClose:()=>{this.report.closed++}};}
  update(){if(this.report?.requestClose&&!this.closing){this.closing=true;void this.close();}}
  async close(){try{
    const before=director.getTotalFrames();
    await this.app.engine.getPipeline().emit('app/quit');
    ${moduleDir ? `this.report.firstResult=await this.app.result;await this.app.destroy();` : ''}
    await new Promise(resolve=>this.scheduleOnce(resolve,0.1));
    this.report.siblingContinued=director.getTotalFrames()>before;
    this.report.authorChildPreserved=this.sentinel.isValid&&this.sentinel.parent===this.region&&this.parentLabel.isValid;
    this.report.restarted=true;this.app=await start(this.region,this.options());
    ${moduleDir ? `this.report.secondResult=await this.app.result;` : ''}
    await this.app.destroy();this.app=undefined;await new Promise(resolve=>this.scheduleOnce(resolve,0.1));
    this.report.success=this.report.closed===${moduleDir ? 2 : 1}&&this.report.siblingContinued&&this.report.authorChildPreserved&&this.report.appExitCalls===0&&this.report.subscribed===this.report.unsubscribed;
  }catch(error){this.report.error=String(error)+(error?.stack||'');console.error(error);}finally{game.end=this.end;this.report.done=true;}}
  onDestroy(){void this.app?.destroy();if(this.end)game.end=this.end;}
}
`)

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(demo, 'scripts/cocos-build.mjs'), 'web-desktop', '--no-generate'], {
    cwd: demo, stdio: 'inherit', env: { ...process.env, QUA_COCOS_WORKSPACE: workspace, QUA_COCOS_BUILD_LOGS: join(output, 'logs') },
  })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Creator embedding fixture build failed (${code})`)))
}).catch(async error => {
  await writeFile(join(output, 'report.json'), JSON.stringify({ success: false, status: 'failed', error: String(error), scope: 'Creator import/build', logs: join(output, 'logs') }, null, 2))
  throw error
})
const artifact = join(workspace, 'build/web-desktop')
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4' }
const server = createServer(async (request, response) => {
  try {
    const path = resolve(artifact, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`)
    if (path !== artifact && !path.startsWith(artifact + sep)) throw new Error('Invalid path')
    const file = (await stat(path)).isDirectory() ? join(path, 'index.html') : path
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    createReadStream(file).on('error', () => response.destroy()).pipe(response)
  }
  catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => globalThis.__QUA_EMBEDDING_REPORT__?.ready || globalThis.__QUA_EMBEDDING_REPORT__?.error, undefined, { timeout: 60000 })
  let report = await page.evaluate(() => globalThis.__QUA_EMBEDDING_REPORT__)
  assert.ok(!report.error, report.error)
  await page.screenshot({ path: join(output, 'capture.png') })
  await page.evaluate(() => globalThis.__QUA_EMBEDDING_REPORT__.requestClose = true)
  await page.waitForFunction(() => globalThis.__QUA_EMBEDDING_REPORT__?.done, undefined, { timeout: 60000 })
  report = { ...await page.evaluate(() => globalThis.__QUA_EMBEDDING_REPORT__), browserErrors: errors, creatorVersion: '3.8.8', scope: 'Creator Web browser; native embedding not qualified' }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  assert.deepEqual(errors, [])
  assert.equal(report.success, true, JSON.stringify(report))
  if(moduleDir){assert.equal(report.firstResult.status,'cancelled');assert.deepEqual(report.secondResult,{status:'completed',value:{quest:42}})}
  process.stdout.write(`Creator Web embedding evidence: ${output}\n`)
}
finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
