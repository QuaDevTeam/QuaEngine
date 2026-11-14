export function createSceneTargetEntry(target: 'godot' | 'unity', businessEntry: string, bundles: unknown[], project: unknown, layout: unknown, debug: boolean, embedded = false): string {
  const name = target === 'godot' ? 'Godot' : 'Unity'
  return `
${embedded ? `import { createEmbeddedSession } from '@quajs/plugin-embedded/session';` : ''}
import { install${name}Globals, on${name}Tick } from '@quajs/${target}-host/globals';
import { create${name}Host } from '@quajs/${target}-host';
import { create${name}Assets, create${name}AssetsAdapter } from '@quajs/${target}-host/assets';
import { create${name}StoreStorage } from '@quajs/${target}-host/store';
import { create${name}StaticOnlyTrustPolicy, createUnsupported${name}RuntimeModuleLoader } from '@quajs/${target}-host/security';
import { Qua${name}RendererController, createVisualNovel${name}RendererPlugins } from '@quajs/renderer-${target}';
import { createQui${name}RendererPlugin } from '@quajs/renderer-${target}/qui';
import { createDialogue${name}RendererPlugin } from '@quajs/renderer-${target}/plugins/dialogue';
import { createChoices${name}RendererPlugin } from '@quajs/renderer-${target}/plugins/choices';
import { bootstrap } from ${JSON.stringify(businessEntry)};
install${name}Globals();
let host, assets, app, renderer, starting, closing=false, closeTask, embeddedSession, disposeEmbeddedTick;
${embedded
  ? `const embeddedRequest=JSON.parse(globalThis.__quaCall('embedded_open','{}')).value;
embeddedSession=createEmbeddedSession(embeddedRequest,message=>globalThis.__quaCall('embedded_event',JSON.stringify(message)));
disposeEmbeddedTick=on${name}Tick((_time,events)=>{for(const event of events)if(event.type==='embedded-command')void embeddedSession.receive(event.command).catch(error=>embeddedSession.context.fail(error));});`
  : ''}
globalThis.__quaClosed=false;
globalThis.__quaShutdown=()=>closeTask ||= (async()=>{
  closing=true;let failure;
  try{await starting?.catch(()=>{});await embeddedSession?.beforeClose();}catch(error){failure=error;}
  for(const cleanup of [()=>renderer?.destroy(),()=>app?.destroy(),()=>assets?.cleanup(),()=>host?.destroy(),()=>disposeEmbeddedTick?.()]){
    try{await cleanup();}catch(error){failure ||= error;}
  }
  globalThis.__quaClosed=true;embeddedSession?.closed(failure);
})();
async function start(){
  host=create${name}Host(); const adapter=create${name}AssetsAdapter(); assets=create${name}Assets({adapter,cacheSize:256*1024*1024});
  await assets.initialize();
  for(const bundle of ${JSON.stringify(bundles)}) { if(closing)return; await assets.loadBundle(bundle.path,{expected:bundle.identity}); }
  if(closing)return;
  app=await bootstrap({embedding:embeddedSession?.context,host,assets,adapter,store:create${name}StoreStorage({host}),project:${JSON.stringify(project)},layout:${JSON.stringify(layout)},trustPolicy:create${name}StaticOnlyTrustPolicy(),runtimeModuleLoader:createUnsupported${name}RuntimeModuleLoader()});
  if(embeddedSession)await embeddedSession.attach(app.engine,{beforeResult:outcome=>app.beforeEmbeddedResult?.(outcome),onResult:()=>{void Promise.resolve().then(()=>globalThis.__quaShutdown()).then(()=>globalThis.__quaCall('quit','{}'));}});
  if(closing)return;
  const plugins=createVisualNovel${name}RendererPlugins({ui:app.surfaceKeys?false:undefined,character:{boxSize:app.characterBoxSize}}).filter(plugin=>!app.surfaceKeys||!['settings','backlog','gallery','achievement','dialogue','choices'].some(name=>plugin.name.endsWith('/'+name)));
  if(app.surfaceKeys)plugins.push(createDialogue${name}RendererPlugin({render:app.renderDialogue}),createChoices${name}RendererPlugin({render:app.renderChoices}),createQui${name}RendererPlugin({features:app.features,surfaceKeys:app.surfaceKeys}));
  renderer=new Qua${name}RendererController({host,assets,pipeline:app.engine.getPipeline(),initialView:app.engine.getViewState(),plugins});
  await renderer.start();
  app.engine.getPipeline().on('app/quit',()=>embeddedSession?embeddedSession.context.cancel():globalThis.__quaCall('quit','{}'));
  await embeddedSession?.ready();
  if(embeddedSession && app.onEmbeddedOpen)void Promise.resolve().then(()=>app.onEmbeddedOpen(embeddedSession.context)).catch(error=>embeddedSession.context.fail(error));
  globalThis.__quaCall('ready','{}');
  ${debug ? 'globalThis.__quaInspect=()=>({view:app.engine.getViewState(),point:app.engine.getStoryPoint()});' : ''}
  console.info('QUA_${target.toUpperCase()}_READY');
}
starting=start();starting.catch(async error=>{if(embeddedSession){await embeddedSession.failStartup(error);void globalThis.__quaShutdown().then(()=>globalThis.__quaCall('quit','{}'));}else globalThis.__quaCall('startup_error',JSON.stringify({message:String(error)+(error?.stack?'\\n'+error.stack:'')}));});
`
}
