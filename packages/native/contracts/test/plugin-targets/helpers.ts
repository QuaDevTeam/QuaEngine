import type { TargetPluginManifest } from '../../src'

export function createPluginManifest(
  overrides: Partial<TargetPluginManifest> = {},
): TargetPluginManifest {
  return {
    pluginId: '@quajs/plugin-dialogue-plus',
    entries: [
      {
        specifier: '@quajs/plugin-dialogue-plus/shared',
        target: 'shared',
        imports: ['@quajs/engine', '@quajs/pipeline'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/web',
        target: 'web',
        imports: ['@quajs/renderer-web/plugins/dialogue'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/cocos',
        target: 'cocos',
        imports: ['@quajs/renderer-cocos/plugins/dialogue'],
      },
      {
        specifier: '@quajs/plugin-dialogue-plus/native',
        target: 'native',
        imports: ['@quajs/native-contracts', '@quajs/engine-native'],
      },
    ],
    ...overrides,
  }
}
