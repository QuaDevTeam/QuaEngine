import type { NormalizedQuaProjectConfig } from './project'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from './core/bundler'
import { AssetPipelinePlugin } from './plugins/asset-pipeline'
import { createQuaProjectAssetTargets } from './project'
import { buildSceneScriptBundle } from './project-scene-bundle'
import { emitQuaTargetBundleManifest } from './project-target-bundle'
import { readQpkSummary } from './qpk-reader'
import { WorkspaceManager } from './workspace/workspace'

export async function buildEmbeddedWeb(root: string, output: string, project: NormalizedQuaProjectConfig, options: {
  configPath?: string
  workspaceConfig?: string
  signal?: AbortSignal
}) {
  const config = project.targets.web.build
  if (!project.targets.web.enabled || typeof config?.embeddedEntry !== 'string')
    throw new Error('Web module export requires targets.web.build.embeddedEntry exporting bootstrap(services).')
  if (!Array.isArray(config.embeddedOrigins) || !config.embeddedOrigins.length || config.embeddedOrigins.some((origin) => {
    try {
      const url = new URL(origin)
      return !['https:', 'http:'].includes(url.protocol) || url.origin !== origin
    }
    catch {
      return true
    }
  })) {
    throw new Error('Web module export requires exact HTTP(S) targets.web.build.embeddedOrigins.')
  }
  const workspace = new WorkspaceManager(root)
  await workspace.loadConfig(options.workspaceConfig, { projectConfig: options.configPath })
  const buildNumber = `embedded-web-${randomUUID()}`
  const bundles: unknown[] = []
  await mkdir(join(output, 'qua'), { recursive: true })
  for (const definition of workspace.getBundlesBuildOrder()) {
    options.signal?.throwIfAborted()
    await new QuackBundler(workspace.createBundleConfig(definition.name, { output: join(output, 'qua', `${definition.name}.qpk`), format: 'qpk', assetTargets: [], assetTarget: createQuaProjectAssetTargets(project).find(target => target.platform === 'web'), plugins: [new AssetPipelinePlugin()], compression: { algorithm: 'none' }, encryption: { enabled: false, algorithm: 'none' }, versioning: { bundleVersion: 1, buildNumber, incrementVersion: false } })).bundle(definition.name)
    const file = (await readdir(join(output, 'qua'))).find(name => name.startsWith(`${definition.name}.`) && name.endsWith('.qpk'))
    if (!file)
      throw new Error('Missing embedded Web QPK')
    const path = join(output, 'qua', file)
    const summary = await readQpkSummary(path)
    if (!summary.manifest || summary.errors.length)
      throw new Error('Invalid embedded Web QPK')
    bundles.push({ path: `qua/${file}`, identity: { name: summary.manifest.name, version: summary.manifest.bundleVersion, buildNumber: summary.manifest.buildNumber, target: summary.manifest.assetTarget?.name, hash: createHash('sha256').update(await readFile(path)).digest('hex') } })
  }
  const entry = `
import { createWebAssets, createWebAssetsAdapter } from '@quajs/assets-web';
import { createWebStoreStorage } from '@quajs/store-web';
import { QuaWebDomRenderer } from '@quajs/renderer-web/dom';
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset';
import { createEmbeddedSession } from '@quajs/plugin-embedded/session';
import { installEmbeddedWebModule } from '@quajs/plugin-embedded/web';
import { bootstrap } from ${JSON.stringify(resolve(root, config.embeddedEntry))};
installEmbeddedWebModule({allowedParentOrigins:${JSON.stringify(config.embeddedOrigins)},async mount(request,send,signal){
 const session=createEmbeddedSession(request,send);let app,renderer,assets,closing;
 const container=document.getElementById('story');
 const cancelCommand={protocol:request.protocol,version:1,type:'cancel',sessionId:request.sessionId};
 const onAbort=()=>{void session.receive(cancelCommand);};signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
 const destroy=()=>closing ||= (async()=>{let failure;try{await session.beforeClose();}catch(error){failure=error;}try{await renderer?.unmount();}catch(error){failure ||= error;}try{await app?.destroy();}catch(error){failure ||= error;}try{await assets?.cleanup();}catch(error){failure ||= error;}signal.removeEventListener('abort',onAbort);session.closed(failure);if(failure)throw failure;})();
 try{
 const adapter=createWebAssetsAdapter({databaseName:${JSON.stringify(project.bundleId)}+':assets'});assets=createWebAssets({adapter,endpoint:new URL('./',location.href).href});await assets.initialize();
 for(const bundle of ${JSON.stringify(bundles)})await assets.loadBundle(new URL(bundle.path,location.href).href,{expected:bundle.identity});
 if(signal.aborted){await destroy();return {destroy,cancel:command=>session.receive(command)};}
 app=await bootstrap({signal,container,embedding:session.context,assets,adapter,store:createWebStoreStorage({dbName:${JSON.stringify(project.bundleId)}+':'+request.storageNamespace}),project:${JSON.stringify({ name: project.name, bundleId: project.bundleId, version: project.version })},layout:${JSON.stringify(project.targets.web.layout)},trustPolicy:{requireSignature:true,allowUnsignedInDevelopment:false,verifyPackage:()=>false},runtimeModuleLoader:{loadScriptModule:async()=>{throw new Error('Static module only');},loadSceneModule:async()=>{throw new Error('Static module only');},loadEnginePluginModule:async()=>{throw new Error('Static module only');},loadStoreMigrationModule:async()=>{throw new Error('Static module only');}}});
 await session.attach(app.engine,{beforeResult:outcome=>app.beforeEmbeddedResult?.(outcome),onResult:()=>{void Promise.resolve().then(destroy);}});
 if(signal.aborted){await destroy();return {destroy,cancel:command=>session.receive(command)};}
 renderer=new QuaWebDomRenderer({container,pipeline:app.engine.getPipeline(),assets,initialView:app.engine.getViewState(),plugins:app.rendererPlugins || createVisualNovelWebRendererPlugins({input:{target:container,pointerTarget:container,keyboardTarget:container,gamepad:false}})});await renderer.mount();
 app.engine.getPipeline().on('app/quit',()=>session.context.cancel('player-quit'));
 await session.ready();if(app.onEmbeddedOpen)void Promise.resolve().then(()=>app.onEmbeddedOpen(session.context)).catch(error=>session.context.fail(error));
 return {destroy,cancel:command=>session.receive(command)};
 }catch(error){await session.failStartup(error);try{await destroy();}catch{}throw error;}
}});`
  const dependencies = await buildSceneScriptBundle({ root, artifactDir: output, outputDir: output, target: 'web', entry, viteConfig: typeof config.embeddedViteConfig === 'string' ? resolve(root, config.embeddedViteConfig) : undefined })
  const styleLinks = (await readdir(output)).filter(name => name.endsWith('.css')).map(name => `<link rel="stylesheet" href="./${encodeURIComponent(name)}">`).join('')
  await writeFile(join(output, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Story module</title>${styleLinks}<style>html,body,#story{width:100%;height:100%;margin:0;overflow:hidden}</style></head><body><div id="story" tabindex="0"></div><script src="./runtime.js"></script></body></html>\n`)
  const require = createRequire(join(root, 'package.json'))
  const vite = await import(pathToFileURL(require.resolve('vite')).href)
  const packageRoot = dirname(require.resolve('@quajs/plugin-embedded/package.json'))
  await vite.build({ root, configFile: false, publicDir: false, build: { outDir: output, emptyOutDir: false, target: 'es2022', lib: { entry: join(packageRoot, 'dist/web.js'), formats: ['es'], fileName: () => 'client.js' }, rollupOptions: { external: [] } } })
  await emitQuaTargetBundleManifest({ artifactDir: output, expectedTarget: 'web', manifest: { schemaVersion: 1, profile: 'release', platform: 'web', app: { bundleId: project.bundleId, version: project.version, buildNumber }, ...createTargetCoreSelection('web'), dependencies, projectGraphs: [{ id: 'web.embedded.post-bundle', kind: 'post-bundle', references: dependencies }] } })
}
