import { resolveSceneResourcePath } from '@quajs/scene-runtime/bridge'

export type { SceneScriptBridge as UnityNativeBridge } from '@quajs/scene-runtime/bridge'
export { callSceneHost as callUnity, nativeBridge } from '@quajs/scene-runtime/bridge'
export const resourcePath = (path: string) => resolveSceneResourcePath(path, 'qua://', 'Unity')
export const storagePath = (path: string) => resourcePath(path).replace('qua://', 'store://')
