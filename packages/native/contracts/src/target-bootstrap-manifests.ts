import type {
  QuaTargetBootstrap,
  TargetBootstrapManifest,
  TargetCorePluginFamily,
} from './bootstrap'
import { normalizePackageSpecifier } from './target-core-specifiers'

export const WEB_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'web',
  corePluginFamily: 'web-core',
  coreAdapters: ['@quajs/assets-web', '@quajs/renderer-web'],
  corePluginFamilyRoots: [
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
  ],
  forbiddenCoreAdapters: [
    '@quajs/godot-host',
    '@quajs/renderer-godot',
    'quajs_godot_runtime',
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
}

export const COCOS_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'cocos',
  corePluginFamily: 'cocos-core',
  coreAdapters: ['@quajs/cocos-host', '@quajs/assets-cocos', '@quajs/renderer-cocos'],
  corePluginFamilyRoots: [
    '@quajs/cocos-host',
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/renderer-cocos',
  ],
  forbiddenCoreAdapters: [
    '@quajs/godot-host',
    '@quajs/renderer-godot',
    'quajs_godot_runtime',
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
}

export const NATIVE_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'native',
  corePluginFamily: 'native-core',
  coreAdapters: ['@quajs/engine-native', '@quajs/assets-native', '@quajs/store-native', '@quajs/native-contracts'],
  corePluginFamilyRoots: [
    '@quajs/engine-native',
    '@quajs/assets-native',
    '@quajs/store-native',
    '@quajs/native-contracts',
    'quajs_native_runtime',
    'quajs_wgpu_renderer',
    'quajs_native_app',
  ],
  forbiddenCoreAdapters: [
    '@quajs/godot-host',
    '@quajs/renderer-godot',
    'quajs_godot_runtime',
    '@quajs/assets-web',
    '@quajs/store-web',
    '@quajs/renderer-web',
    '@quajs/renderer-vue',
    '@quajs/renderer-react',
    '@quajs/renderer-svelte',
    '@quajs/assets-cocos',
    '@quajs/store-cocos',
    '@quajs/cocos-host',
    '@quajs/renderer-cocos',
  ],
}

export const GODOT_TARGET_BOOTSTRAP: TargetBootstrapManifest = {
  target: 'godot',
  corePluginFamily: 'godot-core',
  coreAdapters: ['@quajs/godot-host', '@quajs/renderer-godot'],
  corePluginFamilyRoots: ['@quajs/godot-host', '@quajs/renderer-godot', 'quajs_godot_runtime'],
  forbiddenCoreAdapters: [
    ...WEB_TARGET_BOOTSTRAP.corePluginFamilyRoots,
    ...COCOS_TARGET_BOOTSTRAP.corePluginFamilyRoots,
    ...NATIVE_TARGET_BOOTSTRAP.corePluginFamilyRoots,
  ],
}

export const TARGET_BOOTSTRAP_MANIFESTS: Record<QuaTargetBootstrap, TargetBootstrapManifest> = {
  web: WEB_TARGET_BOOTSTRAP,
  cocos: COCOS_TARGET_BOOTSTRAP,
  native: NATIVE_TARGET_BOOTSTRAP,
  godot: GODOT_TARGET_BOOTSTRAP,
}

export function getTargetCorePluginFamily(target: QuaTargetBootstrap): TargetCorePluginFamily {
  return TARGET_BOOTSTRAP_MANIFESTS[target].corePluginFamily
}

export function getPackageTargetCorePluginFamily(specifier: string): TargetCorePluginFamily | undefined {
  const packageName = normalizePackageSpecifier(specifier)
  for (const manifest of Object.values(TARGET_BOOTSTRAP_MANIFESTS)) {
    const familyRoots = new Set(
      [
        ...manifest.coreAdapters,
        ...manifest.corePluginFamilyRoots,
      ].map(normalizePackageSpecifier),
    )
    if (familyRoots.has(packageName))
      return manifest.corePluginFamily
  }
  return undefined
}

export function collectTargetCoreAdapterRoots(): ReadonlySet<string> {
  return new Set(Object.values(TARGET_BOOTSTRAP_MANIFESTS)
    .flatMap(manifest => [
      ...manifest.coreAdapters,
      ...manifest.corePluginFamilyRoots,
      ...manifest.forbiddenCoreAdapters,
    ])
    .map(normalizePackageSpecifier))
}
