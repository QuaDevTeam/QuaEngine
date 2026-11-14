import type { SceneStoreBackendOptions, SceneStoreStorageOptions } from '@quajs/scene-runtime/store'
import { createSceneStoreStorage, SceneFileStoreBackend } from '@quajs/scene-runtime/store'

export type GodotStoreBackendOptions = Omit<SceneStoreBackendOptions, 'format'>
export type GodotStoreStorageOptions = Omit<SceneStoreStorageOptions, 'format'>
export class GodotFileStoreBackend extends SceneFileStoreBackend {
  constructor(options: GodotStoreBackendOptions) { super({ ...options, format: 'quastore-godot' }) }
}
export function createGodotStoreStorage(options: GodotStoreStorageOptions) {
  return createSceneStoreStorage({ ...options, format: 'quastore-godot' })
}
