export type QuaTargetBootstrap = 'web' | 'cocos' | 'native'

export interface TargetBootstrapManifest {
  target: QuaTargetBootstrap
  coreAdapters: readonly string[]
  forbiddenCoreAdapters: readonly string[]
}

export const WEB_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'web',
  coreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
  forbiddenCoreAdapters: [
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
  ],
}

export const COCOS_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'cocos',
  coreAdapters: ['@quajs/cocos-host', '@quajs/renderer-cocos'],
  forbiddenCoreAdapters: [
    '@quajs/assets-web',
    '@quajs/renderer-web',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
  ],
}

export const NATIVE_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'native',
  coreAdapters: ['@quajs/engine-native', '@quajs/assets-native', '@quajs/store-native', '@quajs/native-contracts'],
  forbiddenCoreAdapters: [
    '@quajs/assets-web',
    '@quajs/renderer-web',
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
  ],
}

export const TARGET_BOOTSTRAP_MANIFESTS: Record<QuaTargetBootstrap, TargetBootstrapManifest> = {
  web: WEB_TARGET_BOOTSTRAP,
  cocos: COCOS_TARGET_BOOTSTRAP,
  native: NATIVE_TARGET_BOOTSTRAP,
}

export interface TargetBootstrapValidationResult {
  ok: boolean
  forbidden: string[]
}

export function validateTargetBootstrap(target: QuaTargetBootstrap, packageNames: readonly string[]): TargetBootstrapValidationResult {
  const manifest = TARGET_BOOTSTRAP_MANIFESTS[target]
  const packageNameSet = new Set(packageNames)
  const forbidden = manifest.forbiddenCoreAdapters.filter(packageName => packageNameSet.has(packageName))
  return {
    ok: forbidden.length === 0,
    forbidden,
  }
}

