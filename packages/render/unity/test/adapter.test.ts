import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QuaSceneRendererController } from '@quajs/renderer-scene'
import { describe, expect, it } from 'vitest'
import { QuaUnityRendererController } from '../src'

describe('unity renderer adapter', () => {
  it('uses the shared scene runtime without a separate state implementation', () => {
    expect(QuaUnityRendererController).toBe(QuaSceneRendererController)
  })

  it('publishes Unity entries for renderer-facing feature plugins', () => {
    const root = resolve(import.meta.dirname, '../../../..')
    for (const feature of ['achievement', 'audio', 'background', 'backlog', 'fonts', 'gallery', 'settings', 'sprite']) {
      const pkg = JSON.parse(readFileSync(resolve(root, `packages/plugins/${feature}/package.json`), 'utf8'))
      expect(pkg.quajs.renderer.unity).toBe(`@quajs/renderer-unity/plugins/${feature}`)
    }
    const character = JSON.parse(readFileSync(resolve(root, 'packages/game/character/package.json'), 'utf8'))
    expect(character.quajs.renderer.unity).toBe('@quajs/renderer-unity/plugins/character')
  })
})
