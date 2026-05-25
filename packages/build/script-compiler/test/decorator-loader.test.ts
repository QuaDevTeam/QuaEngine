import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadPackageDecoratorMappingsSync, loadProjectDecoratorMappings } from '../src/decorators'

describe('decorator mapping loader', () => {
  it('loads decorator mappings from package quajs metadata', () => {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const mappings = loadPackageDecoratorMappingsSync(projectRoot)

    expect(mappings.SetSprite).toEqual({
      function: 'sprite',
      module: '@quajs/character',
    })
    expect(mappings.SetBackground).toEqual({
      function: 'setBackgroundWithEngine',
      module: '@quajs/plugin-background',
    })
    expect(mappings.DefineAnimation).toEqual({
      function: 'registerAnimationWithEngine',
      module: '@quajs/plugin-animation',
    })
  })

  it('loads project decorator mappings without injecting plugin compilers', async () => {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const mappings = await loadProjectDecoratorMappings(projectRoot)

    expect(mappings.SetSprite).toEqual({
      function: 'sprite',
      module: '@quajs/character',
    })
    expect(mappings.SetBackground).toEqual({
      function: 'setBackgroundWithEngine',
      module: '@quajs/plugin-background',
    })
    expect(mappings.DefineAnimation).toEqual({
      function: 'registerAnimationWithEngine',
      module: '@quajs/plugin-animation',
    })
  })
})
