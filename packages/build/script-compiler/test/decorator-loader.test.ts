import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@quajs/plugin-discovery', async () => {
  return await import('../../../core/plugin-discovery/src/index.ts')
})

import { loadPackageDecoratorMappingsSync, loadProjectDecoratorMappings, loadProjectDecoratorMappingsSync } from '../src/decorators'

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

  it('rejects conflicting decorator mappings between package metadata and discovered plugins', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quascript-decorators-'))
    mkdirSync(join(projectRoot, 'node_modules/test-plugin'), { recursive: true })
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        'test-plugin': '1.0.0',
      },
    }), 'utf-8')
    writeFileSync(join(projectRoot, 'node_modules/test-plugin/package.json'), JSON.stringify({
      name: 'test-plugin',
      version: '1.0.0',
      quajs: {
        decorators: {
          PlayVoice: {
            function: 'playVoicePackage',
            module: 'package-audio',
          },
        },
      },
    }), 'utf-8')
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: 'custom-audio',
          decorators: {
            PlayVoice: {
              function: 'playVoiceCustom',
              module: 'custom-audio',
            },
          },
        },
      ],
    }), 'utf-8')

    await expect(loadProjectDecoratorMappings(projectRoot)).rejects.toThrow(
      /Conflicting decorator mapping for @PlayVoice: "(.+#.+)" vs "(.+#.+)"/,
    )
  })

  it('rejects conflicting decorator mappings in synchronous project loading', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quascript-decorators-sync-'))
    mkdirSync(join(projectRoot, 'node_modules/test-plugin'), { recursive: true })
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        'test-plugin': '1.0.0',
      },
    }), 'utf-8')
    writeFileSync(join(projectRoot, 'node_modules/test-plugin/package.json'), JSON.stringify({
      name: 'test-plugin',
      version: '1.0.0',
      quajs: {
        decorators: {
          PlayVoice: {
            function: 'playVoicePackage',
            module: 'package-audio',
          },
        },
      },
    }), 'utf-8')
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: 'custom-audio',
          decorators: {
            PlayVoice: {
              function: 'playVoiceCustom',
              module: 'custom-audio',
            },
          },
        },
      ],
    }), 'utf-8')

    expect(() => loadProjectDecoratorMappingsSync(projectRoot)).toThrow(
      /Conflicting decorator mapping for @PlayVoice: "(.+#.+)" vs "(.+#.+)"/,
    )
  })
})
