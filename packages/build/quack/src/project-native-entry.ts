/** Native resolver: business factory + engine-owned embedding + existing JSC pipeline transport. */
export function createNativeEmbeddedEntry(entry: string, bundles: string[], project: unknown, layout: unknown): string {
  return `
import {createNativeHostApiFromBridge} from '@quajs/native-contracts';
import {createNativeAssets,createNativeAssetsAdapter} from '@quajs/assets-native';
import {createNativeStorageConfig} from '@quajs/store-native';
import {createNativeEngineBootstrap,createNativeRendererViewProjection,installNativeJscPipelineBridge,resolveNativeJscPipelineBridge} from '@quajs/engine-native';
import {createEmbeddedSession} from '@quajs/plugin-embedded/session';
import {parseEmbeddedOpen,parseEmbeddedCancel} from '@quajs/plugin-embedded/protocol';
import {bootstrap} from ${JSON.stringify(entry)};
// JavaScriptCore supplies timers/cancellation; these small byte primitives are
// local to this native entry and never emulate DOM, fetch or a browser runtime.
if(!globalThis.TextEncoder)globalThis.TextEncoder=class{encode(text=''){const bytes=[];for(const c of text){let n=c.codePointAt(0);if(n>=0xd800&&n<=0xdfff)n=0xfffd;if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else bytes.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}return new Uint8Array(bytes);}};
if(!globalThis.TextDecoder)globalThis.TextDecoder=class{decode(input){if(!input)return '';const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);return decodeURIComponent(Array.from(bytes,b=>'%'+b.toString(16).padStart(2,'0')).join(''));}};
const bridge=resolveNativeJscPipelineBridge();
if(!bridge)throw new Error('Native pipeline bridge unavailable');
let sequence=0,app,assets,session,starting,closing,disposePipeline;
const pending=new Map();
const send=request=>new Promise((resolve,reject)=>{if(pending.size>=128){reject(new Error('Too many native host requests'));return;}const id=++sequence;pending.set(id,{resolve,reject});bridge.emit('native-sdk/request',{id,request});});
const call=async request=>{
 if(request.method==='readAssetBytes'){
  let offset=0,bytes;do{const response=await send({method:'readAssetChunk',params:{...request.params,offset}});if(!response.ok)return response;const chunk=response.payload.value;if(!bytes)bytes=new Uint8Array(chunk.size);bytes.set(chunk.bytes,offset);offset+=chunk.bytes.length;if(!chunk.bytes.length&&offset<bytes.length)throw new Error('Truncated native asset');}while(offset<bytes.length);
  return {ok:true,payload:{type:'assetBytes',value:bytes}};
 }
 if(request.method==='hashBytes'&&request.params.algorithm==='sha256'){
  const start=await send({method:'hashStart'});if(!start.ok)return start;const id=start.payload.value;
  const bytes=request.params.bytes;for(let offset=0;offset<bytes.length;offset+=65536){const response=await send({method:'hashChunk',params:{id,bytes:bytes.slice(offset,offset+65536)}});if(!response.ok)return response;}
  return await send({method:'hashFinish',params:{id}});
 }
 return await send(request);
};
const host=createNativeHostApiFromBridge(call);
export function respond(id,response){const item=pending.get(id);pending.delete(id);item?.resolve(response);return true;}
export function validateOpen(request){return parseEmbeddedOpen(request);}
export function cancel(request){const command=parseEmbeddedCancel(request);void session.receive(command).catch(error=>session.context.fail(error));return true;}
export function close(){closing ||= (async()=>{let failure;try{await starting?.catch(()=>{});await session?.beforeClose();}catch(error){failure=error;}for(const cleanup of [()=>disposePipeline?.(),()=>app?.destroy(),()=>assets?.cleanup()]){try{await cleanup();}catch(error){failure ||= error;}}session?.closed(failure);for(const item of pending.values())item.reject(new Error('Native session closed'));pending.clear();})();return true;}
export function open(request){
 session=createEmbeddedSession(request,message=>bridge.emit('native-sdk/event',message));
 starting=(async()=>{
  const adapter=createNativeAssetsAdapter({host,cacheRoot:'asset-cache'});assets=createNativeAssets({adapter,native:{host},enableCache:false});await assets.initialize();
  for(const path of ${JSON.stringify(bundles)})await assets.loadBundle(path);
  const manifest=JSON.parse(new TextDecoder().decode(await host.readAssetBytes({url:'target-bundle-manifest.json'})));
  app=await bootstrap({embedding:session.context,host,assets,adapter,store:createNativeStorageConfig({host,namespace:request.storageNamespace}),project:${JSON.stringify(project)},layout:${JSON.stringify(layout)},trustPolicy:{requireSignature:true,allowUnsignedInDevelopment:false,verifyPackage:()=>false},runtimeModuleLoader:{loadScriptModule:async()=>{throw new Error('Static native module only');},loadSceneModule:async()=>{throw new Error('Static native module only');},loadEnginePluginModule:async()=>{throw new Error('Static native module only');},loadStoreMigrationModule:async()=>{throw new Error('Static native module only');}}});
  const native=createNativeEngineBootstrap(host,{targetBundleManifest:manifest,featureSurfaces:app.featureSurfaces,targetBootstrapPackages:manifest.selectedCoreAdapters,runtimeModuleLoader:{loadScriptModule:async()=>{throw new Error('Static native module only');}},requireSignature:true});
  await app.engine.useRuntimePlugin(native.plugin);
  const projected={emit(event,payload){bridge.emit(event,event==='view/update'&&payload?.view?{...payload,view:app.projectNativeView?app.projectNativeView(payload.view):createNativeRendererViewProjection(payload.view,{projectAnimations:false,featureSurfaces:app.featureSurfaces})}:payload);}};
  disposePipeline=installNativeJscPipelineBridge(projected,app.engine.getPipeline(),{initialView:app.engine.getViewState()});
  await session.attach(app.engine,{beforeResult:outcome=>app.beforeEmbeddedResult?.(outcome),onResult:()=>{void Promise.resolve().then(close);}});
  app.engine.getPipeline().on('app/quit',()=>session.context.cancel('player-quit'));
  if(closing)return;
  await session.ready();if(app.onEmbeddedOpen)void Promise.resolve().then(()=>app.onEmbeddedOpen(session.context)).catch(error=>session.context.fail(error));
 })();
 starting.catch(async error=>{await session.failStartup(error);close();});return true;
}
`
}
