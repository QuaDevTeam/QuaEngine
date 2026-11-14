import type { UnityNativeBridge } from './bridge'
import { createSceneScriptHost } from '@quajs/scene-runtime'
import { nativeBridge, resourcePath, storagePath } from './bridge'
import { onUnityTick } from './globals'

export type { UnityNativeBridge } from './bridge'
export type { SceneHost as UnityHost } from '@quajs/scene-host'
export function createUnityHost(bridge: UnityNativeBridge = nativeBridge()) {
  return createSceneScriptHost({ bridge, resourcePath, storagePath, onTick: onUnityTick, capabilities: { localFiles: true, remoteFiles: false, writableStorage: true, input: true, audioEq: false, audioGainAboveUnity: false, audioPlaybackRate: true, video: true, capture: false, fonts: true, nativeAssets: true } })
}
