import type { GodotNativeBridge } from './bridge'
import { createSceneScriptHost } from '@quajs/scene-runtime'
import { nativeBridge, resourcePath, storagePath } from './bridge'
import { onGodotTick } from './globals'

export type { GodotNativeBridge } from './bridge'
export type { SceneHost as GodotHost } from '@quajs/scene-host'
export function createGodotHost(bridge: GodotNativeBridge = nativeBridge()) {
  return createSceneScriptHost({ bridge, resourcePath, storagePath, onTick: onGodotTick, capabilities: { localFiles: true, remoteFiles: false, writableStorage: true, input: true, audioEq: false, audioGainAboveUnity: true, audioPlaybackRate: true, video: true, capture: true, fonts: true, nativeAssets: true } })
}
