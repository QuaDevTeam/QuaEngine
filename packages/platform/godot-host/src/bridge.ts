import { resolveSceneResourcePath } from '@quajs/scene-runtime/bridge'

export type { SceneScriptBridge as GodotNativeBridge } from '@quajs/scene-runtime/bridge'
export { callSceneHost as callGodot, nativeBridge } from '@quajs/scene-runtime/bridge'
export const resourcePath = (path: string) => resolveSceneResourcePath(path, 'res://', 'Godot')
export const storagePath = (path: string) => resourcePath(path).replace('res://', 'user://qua/')
