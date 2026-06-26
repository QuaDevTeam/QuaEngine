import { describe, expect, it } from 'vitest'
import {
  assertQuackPluginReferencesTargetIsolation,
  assertQuackPluginSpecifiersTargetIsolation,
} from '../src/target-plugin-isolation'

describe('Quack target plugin isolation', () => {
  it('keeps the string specifier compatibility wrapper', () => {
    expect(() => assertQuackPluginSpecifiersTargetIsolation([
      '@quajs/renderer-web/plugins/audio',
    ], {
      target: 'native',
      fieldName: 'quack --plugin',
    })).toThrow(/@quajs\/renderer-web\/plugins\/audio resolves to @quajs\/renderer-web/)
  })

  it('checks both specifier and packageName fields in generated plugin references', () => {
    expect(() => assertQuackPluginReferencesTargetIsolation([
      {
        packageName: '@quajs/plugin-menu',
        specifier: '@quajs/renderer-web/plugins/ui',
      },
      {
        packageName: '@quajs/cocos-host',
        specifier: '@quajs/plugin-gallery/cocos',
      },
      {
        packageName: '@quajs/plugin-native-menu',
        specifier: '@quajs/engine-native/runtime',
      },
    ], {
      target: 'native',
      fieldName: 'generated plugin resolver',
    })).toThrow(
      /generated plugin resolver[\s\S]*@quajs\/renderer-web\/plugins\/ui resolves to @quajs\/renderer-web[\s\S]*@quajs\/cocos-host resolves to @quajs\/cocos-host[\s\S]*@quajs\/engine-native\/runtime resolves to @quajs\/engine-native/,
    )
  })
})
