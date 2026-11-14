import type { SceneStoreBackendOptions, SceneStoreStorageOptions } from '@quajs/scene-runtime/store'
import { createSceneStoreStorage, SceneFileStoreBackend } from '@quajs/scene-runtime/store'

export type UnityStoreBackendOptions = Omit<SceneStoreBackendOptions, 'format'>
export type UnityStoreStorageOptions = Omit<SceneStoreStorageOptions, 'format'>
export class UnityFileStoreBackend extends SceneFileStoreBackend {
  constructor(options: UnityStoreBackendOptions) { super({ ...options, format: 'quastore-unity' }) }
}
export function createUnityStoreStorage(options: UnityStoreStorageOptions) {
  return createSceneStoreStorage({ ...options, format: 'quastore-unity' })
}
