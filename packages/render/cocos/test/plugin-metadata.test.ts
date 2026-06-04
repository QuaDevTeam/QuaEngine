import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../../..')

describe('cocos renderer plugin metadata', () => {
  it('publishes Cocos renderer entries for renderer-facing feature plugins', () => {
    expectRendererEntry('packages/game/character/package.json', 'cocos', '@quajs/renderer-cocos/plugins/character')
    expectRendererEntry('packages/plugins/achievement/package.json', 'cocos', '@quajs/renderer-cocos/plugins/achievement')
    expectRendererEntry('packages/plugins/audio/package.json', 'cocos', '@quajs/renderer-cocos/plugins/audio')
    expectRendererEntry('packages/plugins/background/package.json', 'cocos', '@quajs/renderer-cocos/plugins/background')
    expectRendererEntry('packages/plugins/backlog/package.json', 'cocos', '@quajs/renderer-cocos/plugins/backlog')
    expectRendererEntry('packages/plugins/fonts/package.json', 'cocos', '@quajs/renderer-cocos/plugins/fonts')
    expectRendererEntry('packages/plugins/gallery/package.json', 'cocos', '@quajs/renderer-cocos/plugins/gallery')
    expectRendererEntry('packages/plugins/settings/package.json', 'cocos', '@quajs/renderer-cocos/plugins/settings')
    expectRendererEntry('packages/plugins/sprite/package.json', 'cocos', '@quajs/renderer-cocos/plugins/sprite')
  })

  it('publishes gallery entries for every official renderer', () => {
    expectRendererEntry('packages/plugins/gallery/package.json', 'web', '@quajs/renderer-web/plugins/gallery')
    expectRendererEntry('packages/plugins/gallery/package.json', 'vue', '@quajs/renderer-vue/plugins/gallery')
    expectRendererEntry('packages/plugins/gallery/package.json', 'react', '@quajs/renderer-react/plugins/gallery')
    expectRendererEntry('packages/plugins/gallery/package.json', 'svelte', '@quajs/renderer-svelte/plugins/gallery')
    expectRendererEntry('packages/plugins/gallery/package.json', 'cocos', '@quajs/renderer-cocos/plugins/gallery')
  })

  it('keeps logic-only plugins out of renderer discovery', () => {
    expect(readPackage('packages/plugins/animation/package.json').quajs.renderer).toBeUndefined()
    expect(readPackage('packages/plugins/inventory/package.json').quajs.renderer).toBeUndefined()
    expect(readPackage('packages/game/story-graph/package.json').quajs.renderer).toBeUndefined()
  })
})

function expectRendererEntry(packagePath: string, key: string, entry: string): void {
  expect(readPackage(packagePath).quajs.renderer[key]).toBe(entry)
}

function readPackage(packagePath: string): { quajs: { renderer?: Record<string, string> } } {
  return JSON.parse(readFileSync(resolve(repoRoot, packagePath), 'utf8')) as { quajs: { renderer?: Record<string, string> } }
}
