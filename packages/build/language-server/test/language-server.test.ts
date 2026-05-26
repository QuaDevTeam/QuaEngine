import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyQuaScriptTextEdits } from '@quajs/script-compiler'
import {
  analyzeQuaScript,
  formatQuaScriptDocumentEdits,
  getQuaScriptCodeActions,
  getQuaScriptCompletions,
  getQuaScriptDefinitions,
  getQuaScriptHover,
  lintQuaScript,
} from '../src'

describe('@quajs/language-server helpers', () => {
  it('creates diagnostics-free virtual TypeScript for typed qs files', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'scene.qs')
    const analysis = await analyzeQuaScript(`
<script lang="ts">
import { formatName } from './logic'

export interface Scope {
  playerName: string
}
</script>

<script setup lang="ts">
const displayName = formatName(scope.playerName)
</script>

Yuki: Hello \${displayName}!
`, {
      extraFiles: {
        [join(projectRoot, 'logic.ts')]: 'export function formatName(name: string): string { return name }',
      },
      filePath,
      projectRoot,
    })

    expect(analysis.virtualTypeScript).toContain('export interface Scope')
    expect(analysis.virtualTypeScript).toContain('scope: Scope')
    expect(analysis.virtualTypeScript).toContain('const displayName = formatName(scope.playerName)')
    expect(analysis.diagnostics).toEqual([])
  })

  it('suggests decorators and scope variables', async () => {
    const source = `
<script setup lang="ts">
const displayName = scope.name
</script>

@`

    const decorators = await getQuaScriptCompletions(source, { line: 5, character: 1 })
    expect(decorators.some(item => item.label === 'SetSprite')).toBe(true)

    const variables = await getQuaScriptCompletions('Yuki: Hello ${disp', { line: 0, character: 18 })
    expect(variables.map(item => item.label)).toContain('scope')
  })

  it('reports semantic diagnostics from mapped TypeScript expressions', async () => {
    const analysis = await analyzeQuaScript(`
<script lang="ts">
export interface Scope {
  playerName: string
}
</script>

Yuki: Hello \${scope.missing}
`)

    const diagnostic = analysis.diagnostics.find(item => item.message.includes('missing'))
    expect(diagnostic?.code).toMatch(/^TS_/)
    expect(diagnostic?.source).toBe('quascript/typescript')
    expect(diagnostic?.range?.start.line).toBe(7)
    expect(diagnostic?.range?.start.column).toBeGreaterThan(10)
  })

  it('returns lint summary counts with stable style diagnostic metadata', async () => {
    const lint = await lintQuaScript('Yuki: Hello  ')

    expect(lint.errorCount).toBe(0)
    expect(lint.warningCount).toBeGreaterThanOrEqual(2)
    expect(lint.fixableCount).toBeGreaterThanOrEqual(2)
    expect(lint.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QS_STYLE_TRAILING_WHITESPACE',
        severity: 'warning',
        source: 'quascript/style',
      }),
      expect.objectContaining({
        code: 'QS_STYLE_FINAL_NEWLINE',
        severity: 'warning',
        source: 'quascript/style',
      }),
    ]))
  })

  it('keeps parser diagnostics on the unified lint model', async () => {
    const lint = await lintQuaScript('<script>\nconst value = 1\n')

    expect(lint.errorCount).toBeGreaterThanOrEqual(2)
    expect(lint.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QS_PARSE_INVALID_SCRIPT_LANG',
        severity: 'error',
        source: 'quascript/parser',
      }),
      expect.objectContaining({
        code: 'QS_PARSE_MISSING_SCRIPT_CLOSE',
        severity: 'error',
        source: 'quascript/parser',
      }),
    ]))
  })

  it('applies lint rule severity overrides and off switches', async () => {
    const lint = await lintQuaScript('Yuki: Hello  ', {
      toolingConfig: {
        lint: {
          rules: {
            QS_STYLE_FINAL_NEWLINE: 'error',
            QS_STYLE_TRAILING_WHITESPACE: 'off',
          },
        },
      },
    })

    expect(lint.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['QS_STYLE_FINAL_NEWLINE'])
    expect(lint.errorCount).toBe(1)
    expect(lint.warningCount).toBe(0)
  })

  it('formats documents with minimal edits and returns no edits when already formatted', () => {
    const source = '@SetBackground("classroom.png")\n\nYuki: Hello  '
    const edits = formatQuaScriptDocumentEdits(source)
    const formatted = applyQuaScriptTextEdits(source, edits)

    expect(edits).toHaveLength(1)
    expect(formatted).toBe('@SetBackground("classroom.png")\nYuki: Hello\n')
    expect(formatQuaScriptDocumentEdits(formatted)).toEqual([])
  })

  it('uses TypeScript completions inside QuaScript expressions', async () => {
    const source = `
<script lang="ts">
export interface Scope {
  playerName: string
  unlocked: boolean
}
</script>

Yuki: Hello \${scope.}
`
    const completions = await getQuaScriptCompletions(source, { line: 8, character: 20 })
    const labels = completions.map(item => item.label)

    expect(labels).toContain('playerName')
    expect(labels).toContain('unlocked')
  })

  it('uses imported TypeScript files in virtual language service completions', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'scene.qs')
    const source = `
<script lang="ts">
import { formatName } from './logic.ts'

export interface Scope {
  playerName: string
}
</script>

Yuki: Hello \${format}
`
    const completions = await getQuaScriptCompletions(source, { line: 9, character: 20 }, {
      extraFiles: {
        [join(projectRoot, 'logic.ts')]: 'export function formatName(name: string): string { return name }',
      },
      filePath,
      projectRoot,
    })

    expect(completions.map(item => item.label)).toContain('formatName')
  })

  it('jumps from QuaScript expressions to imported TypeScript definitions', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'scene.qs')
    const logicPath = join(projectRoot, 'logic.ts')
    const source = `
<script lang="ts">
import { formatName } from './logic.ts'

export interface Scope {
  playerName: string
}
</script>

Yuki: Hello \${formatName(scope.playerName)}
`
    const definitions = getQuaScriptDefinitions(source, positionOf(source, 'formatName(scope'), {
      extraFiles: {
        [logicPath]: 'export function formatName(name: string): string { return name }',
      },
      filePath,
      projectRoot,
    })

    expect(definitions[0]?.filePath).toBe(logicPath)
    expect(definitions[0]?.range.start.line).toBe(0)
  })

  it('returns TypeScript hover and definitions through virtual source maps', async () => {
    const source = `
<script setup lang="ts">
const displayName = String(scope.name)
</script>

Yuki: Hello \${displayName}
`
    const hover = await getQuaScriptHover(source, { line: 5, character: 22 })
    expect(hover?.contents).toContain('displayName')

    const definitions = getQuaScriptDefinitions(source, { line: 5, character: 22 })
    expect(definitions[0]?.range.start.line).toBe(2)
    expect(definitions[0]?.range.start.column).toBe(6)
  })

  it('does not treat choice text before an arrow as a condition expression', async () => {
    const analysis = await analyzeQuaScript(`
- What if we wait -> wait
`)

    expect(analysis.diagnostics.filter(diagnostic =>
      diagnostic.source === 'quascript/story' || diagnostic.source === 'quascript/project',
    )).toEqual([])
  })

  it('returns decorator hover on decorator names with arguments', async () => {
    const hover = await getQuaScriptHover('@SetSprite("yuki.png")\nYuki: Hi', { line: 0, character: 5 })

    expect(hover?.contents).toContain('@SetSprite')
    expect(hover?.contents).toContain('@quajs/character')
  })

  it('uses plugin language metadata for decorator argument completions', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    mkdirSync(join(projectRoot, 'assets/images'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/classroom.png'), '')
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-background',
          decorators: {
            SetBackground: {
              function: 'setBackgroundWithEngine',
              module: '@quajs/plugin-background',
            },
          },
          language: {
            decorators: {
              SetBackground: {
                args: [
                  {
                    name: 'asset',
                    assetRoots: ['assets/images'],
                    assetExtensions: ['.png'],
                  },
                  {
                    name: 'transition',
                    values: ['fade', 'instant'],
                  },
                ],
              },
            },
          },
        },
      ],
    }))

    const assetCompletions = await getQuaScriptCompletions('@SetBackground("', { line: 0, character: 16 }, { projectRoot })
    expect(assetCompletions.map(item => item.label)).toContain('classroom.png')

    const transitionCompletions = await getQuaScriptCompletions('@SetBackground("classroom.png", ', { line: 0, character: 31 }, { projectRoot })
    expect(transitionCompletions.map(item => item.label)).toContain('fade')
  })

  it('aligns decorator completions and hover with auto-collect and local imports', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    mkdirSync(join(projectRoot, 'assets/images'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/classroom.png'), '')
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-background',
          decorators: {
            SetBackground: {
              function: 'setBackgroundWithEngine',
              module: '@quajs/plugin-background',
            },
          },
          language: {
            decorators: {
              SetBackground: {
                args: [
                  {
                    name: 'asset',
                    assetRoots: ['assets/images'],
                    assetExtensions: ['.png'],
                  },
                ],
              },
            },
          },
        },
      ],
    }))

    const toolingConfig = {
      decorators: {
        autoCollect: false,
      },
    }

    const inactiveSource = '@SetBackground("'
    const inactiveDecorators = await getQuaScriptCompletions(inactiveSource, { line: 0, character: 1 }, {
      projectRoot,
      toolingConfig,
    })
    const inactiveArgs = await getQuaScriptCompletions(inactiveSource, { line: 0, character: 16 }, {
      projectRoot,
      toolingConfig,
    })
    const inactiveHover = await getQuaScriptHover('@SetBackground("classroom.png")\nYuki: Hi', { line: 0, character: 5 }, {
      projectRoot,
      toolingConfig,
    })

    expect(inactiveDecorators.map(item => item.label)).not.toContain('SetBackground')
    expect(inactiveArgs).toEqual([])
    expect(inactiveHover).toBeUndefined()

    const activeSource = `<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground("`
    const activeDecorators = await getQuaScriptCompletions(activeSource, { line: 4, character: 1 }, {
      projectRoot,
      toolingConfig,
    })
    const activeArgs = await getQuaScriptCompletions(activeSource, { line: 4, character: 16 }, {
      projectRoot,
      toolingConfig,
    })
    const activeHover = await getQuaScriptHover(`<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground("classroom.png")
Yuki: Hi
`, { line: 4, character: 5 }, {
      projectRoot,
      toolingConfig,
    })

    expect(activeDecorators.map(item => item.label)).toContain('SetBackground')
    expect(activeArgs.map(item => item.label)).toContain('classroom.png')
    expect(activeHover?.contents).toContain('@quajs/plugin-background')
  })

  it('surfaces gallery decorators from discovered plugin metadata in completions and hover', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-gallery',
          decorators: {
            UnlockGallery: {
              function: 'unlockGalleryEntryWithEngine',
              module: '@quajs/plugin-gallery',
            },
            OpenGalleryScene: {
              function: 'openGallerySceneWithEngine',
              module: '@quajs/plugin-gallery',
            },
          },
          language: {
            decorators: {
              UnlockGallery: {
                description: 'Unlock a gallery entry',
              },
              OpenGalleryScene: {
                description: 'Open the gallery scene shell',
              },
            },
          },
        },
      ],
    }))

    const filePath = join(projectRoot, 'scene.qs')
    const completions = await getQuaScriptCompletions('@', { line: 0, character: 1 }, {
      filePath,
      projectRoot,
    })
    const hover = await getQuaScriptHover('@UnlockGallery("cg.sunset")\nYuki: Hi', { line: 0, character: 5 }, {
      filePath,
      projectRoot,
    })

    expect(completions.map(item => item.label)).toEqual(expect.arrayContaining(['UnlockGallery', 'OpenGalleryScene']))
    expect(hover?.contents).toContain('@UnlockGallery')
    expect(hover?.contents).toContain('@quajs/plugin-gallery')
  })

  it('surfaces achievement decorators from discovered plugin metadata in completions and hover', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-achievement',
          decorators: {
            UnlockAchievement: {
              function: 'unlockAchievementWithEngine',
              module: '@quajs/plugin-achievement',
            },
            OpenAchievementBoard: {
              function: 'openAchievementBoardWithEngine',
              module: '@quajs/plugin-achievement',
            },
          },
          language: {
            decorators: {
              UnlockAchievement: {
                description: 'Unlock an achievement',
              },
              OpenAchievementBoard: {
                description: 'Open the achievement board scene',
              },
            },
          },
        },
      ],
    }))

    const filePath = join(projectRoot, 'scene.qs')
    const completions = await getQuaScriptCompletions('@', { line: 0, character: 1 }, {
      filePath,
      projectRoot,
    })
    const hover = await getQuaScriptHover('@UnlockAchievement("story.first-step")\nYuki: Hi', { line: 0, character: 5 }, {
      filePath,
      projectRoot,
    })

    expect(completions.map(item => item.label)).toEqual(expect.arrayContaining(['UnlockAchievement', 'OpenAchievementBoard']))
    expect(hover?.contents).toContain('@UnlockAchievement')
    expect(hover?.contents).toContain('@quajs/plugin-achievement')
  })

  it('reports compiler decorator semantic diagnostics through language analysis', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-background',
          decorators: {
            SetBackground: {
              function: 'setBackgroundWithEngine',
              module: '@quajs/plugin-background',
            },
          },
        },
      ],
    }))

    const analysis = await analyzeQuaScript(`
@SetBackground('classroom.png')
Yuki: Hello
`, {
      projectRoot,
      toolingConfig: {
        decorators: {
          autoCollect: false,
        },
      },
    })

    expect(analysis.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QS_COMPILER_SEMANTICS',
        source: 'quascript/compiler',
      }),
    ]))
    expect(analysis.diagnostics.some(item => item.message.includes('Unknown QuaScript decorator @SetBackground'))).toBe(true)
  })

  it('suggests canonical choice decorators and helper targets', async () => {
    const decorators = await getQuaScriptCompletions('@Cho', { line: 0, character: 4 })
    expect(decorators.map(item => item.label)).toContain('Choice')

    const helpers = await getQuaScriptCompletions('@Choice("Go", ', { line: 0, character: 14 })
    expect(helpers.map(item => item.label)).toEqual(expect.arrayContaining(['node', 'scene', 'packageNode', 'image']))

    const source = '@Node("library")\nYuki: Hi\n- Go -> '
    const targets = await getQuaScriptCompletions(source, { line: 2, character: 8 })
    expect(targets.map(item => item.label)).toContain('library')
  })

  it('suggests target and image assets from project story declarations and runtime package metadata', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    mkdirSync(join(projectRoot, 'assets/images/story'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/story/library.png'), '')
    const source = '@Scene("school")\n@Node("start")\nYuki: Go?\n- Go -> '

    const targets = await getQuaScriptCompletions(source, { line: 3, character: 8 }, {
      extraFiles: {
        [join(projectRoot, 'library.qs')]: '@Scene("school")\n@Node("library")\nYuki: Library.',
        [join(projectRoot, 'runtime-story.json')]: JSON.stringify({
          runtimePackage: {
            id: 'runtime.extra',
            scripts: [{
              id: 'runtime.extra.story',
              metadata: {
                story: {
                  scenes: [{ id: 'runtime-scene' }],
                  nodes: [{ id: 'runtime-node', point: { sceneId: 'school', nodeId: 'runtime-node', contentPackageId: 'runtime.extra' } }],
                  labels: [{ id: 'runtime-label', point: { sceneId: 'school', labelId: 'runtime-label', contentPackageId: 'runtime.extra' } }],
                },
              },
            }],
          },
        }),
      },
      filePath: join(projectRoot, 'school.qs'),
      projectRoot,
    })
    const labels = targets.map(item => item.label)
    expect(labels).toEqual(expect.arrayContaining(['library', 'runtime.extra#runtime-node', '#runtime-label', 'scene:runtime-scene', 'script:runtime.extra.story']))

    const assets = await getQuaScriptCompletions('@Node("start", { thumbnail: image("', { line: 0, character: 35 }, { projectRoot })
    expect(assets.map(item => item.label)).toContain('story/library.png')
  })

  it('expands choice sugar to the canonical Choice decorator', () => {
    const source = '- Go -> scene:dorm#night if canGo'
    const actions = getQuaScriptCodeActions(source, { line: 0, character: 4 })

    expect(actions).toHaveLength(1)
    expect(actions[0]?.title).toBe('Expand choice sugar to @Choice')
    expect(actions[0]?.edit.newText).toBe("@Choice('Go', scene('dorm', { entry: 'night' }), { when: canGo })")
  })

  it('expands choice sugar with correct edit offsets in CRLF documents', () => {
    const source = 'Yuki: Choose\r\n- Go -> scene:dorm#night if canGo\r\nYuki: Done\r\n'
    const actions = getQuaScriptCodeActions(source, { line: 1, character: 4 })
    const edit = actions[0]?.edit.edits[0]

    expect(edit?.range.start.offset).toBe('Yuki: Choose\r\n'.length)
    expect(edit?.range.end.offset).toBe('Yuki: Choose\r\n- Go -> scene:dorm#night if canGo'.length)
    expect(applyQuaScriptTextEdits(source, edit ? [edit] : [])).toBe([
      'Yuki: Choose\r\n',
      "@Choice('Go', scene('dorm', { entry: 'night' }), { when: canGo })",
      '\r\nYuki: Done\r\n',
    ].join(''))
  })

  it('returns lint quick fixes and source fixAll without dropping refactor actions', async () => {
    const source = [
      '@SetBackground("classroom.png")',
      '',
      'Yuki: Hello  ',
      '- Go -> library',
    ].join('\n')
    const lint = await lintQuaScript(source)
    const actions = getQuaScriptCodeActions(source, { line: 2, character: 12 }, {
      diagnostics: lint.diagnostics,
      includeLintFixes: true,
    })
    const quickFix = actions.find(action => action.kind === 'quickfix' && action.title === 'Remove trailing whitespace')
    const fixAll = actions.find(action => action.kind === 'source.fixAll.quascript')

    expect(quickFix?.diagnostics?.[0]?.code).toBe('QS_STYLE_TRAILING_WHITESPACE')
    expect(fixAll?.edit.edits.length).toBeGreaterThanOrEqual(3)
    expect(applyQuaScriptTextEdits(source, fixAll?.edit.edits || [])).toBe([
      '@SetBackground("classroom.png")',
      'Yuki: Hello',
      '- Go -> library',
      '',
    ].join('\n'))

    const refactorActions = getQuaScriptCodeActions(source, { line: 3, character: 4 }, {
      diagnostics: lint.diagnostics,
      includeLintFixes: true,
    })
    expect(refactorActions.map(action => action.title)).toContain('Expand choice sugar to @Choice')
  })

  it('reports rich story diagnostics for targets, assets, packages, and complex sugar conditions', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'school.qs')
    mkdirSync(join(projectRoot, 'assets/images'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/library.png'), '')
    const source = `
@Scene('school')
@Node('start')
Yuki: Choose.
- Cross -> dorm if scope.a && scope.b && scope.c
@Choice('Missing asset', node('start', { requiredRuntimePackages: ['runtime.extra'] }), {
  presentation: { thumbnail: image('missing.png') }
})
@Choice('Unknown package', packageNode('runtime.unknown', 'extra'))
@Choice('Known package without dependency', packageNode('runtime.extra', 'extra'))
`

    const analysis = await analyzeQuaScript(source, {
      extraFiles: {
        [join(projectRoot, 'dorm.qs')]: "@Scene('dorm')\n@Node('dorm')\nYuki: Dorm.",
        [join(projectRoot, 'runtime-extra.json')]: JSON.stringify({
          runtimePackage: {
            id: 'runtime.extra',
            scripts: [{
              id: 'runtime.extra.story',
              metadata: {
                story: {
                  nodes: [{ id: 'extra', point: { sceneId: 'school', nodeId: 'extra', contentPackageId: 'runtime.extra' } }],
                },
              },
            }],
          },
        }),
      },
      filePath,
      projectRoot,
    })
    const messages = analysis.diagnostics.map(item => item.message)
    const metadata = analysis.diagnostics.map(item => [item.code, item.source])

    expect(messages).toContain('Choice sugar uses a complex if expression. Prefer <script setup> bindings or @Choice(..., { when }) for maintainable branching.')
    expect(messages).toContain('Choice "Cross" targets "node:dorm" in another scene. Use scene(...) or scene:id#entry for cross-scene choice jumps.')
    expect(messages).toContain('Story asset "missing.png" was not found under project assets.')
    expect(messages).toContain('Package-scoped target references unknown runtime package "runtime.unknown".')
    expect(messages).toContain('Package-scoped target "runtime.extra" should be declared through runtime package dependencies or requiredRuntimePackages.')
    expect(metadata).toEqual(expect.arrayContaining([
      ['QS_STORY_COMPLEX_CHOICE_CONDITION', 'quascript/story'],
      ['QS_STORY_CROSS_SCENE_TARGET', 'quascript/story'],
      ['QS_PROJECT_MISSING_ASSET', 'quascript/project'],
      ['QS_PROJECT_UNKNOWN_RUNTIME_PACKAGE', 'quascript/project'],
      ['QS_PROJECT_MISSING_RUNTIME_PACKAGE_DEPENDENCY', 'quascript/project'],
    ]))
  })

  it('does not report story diagnostics for valid same-scene targets and assets', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    mkdirSync(join(projectRoot, 'assets/images'), { recursive: true })
    writeFileSync(join(projectRoot, 'assets/images/library.png'), '')
    const source = `
@Scene('school')
@Node('start', { thumbnail: image('library.png') })
Yuki: Choose.
@Choice('Library', node('library', { requiredRuntimePackages: ['runtime.extra'] }), { presentation: { thumbnail: image('library.png') } })

@Node('library')
Yuki: Library.
`

    const analysis = await analyzeQuaScript(source, {
      extraFiles: {
        [join(projectRoot, 'runtime-extra.json')]: JSON.stringify({
          runtimePackage: {
            id: 'runtime.extra',
            dependencies: ['runtime.base'],
          },
        }),
      },
      filePath: join(projectRoot, 'school.qs'),
      projectRoot,
    })

    expect(analysis.diagnostics.filter(diagnostic =>
      diagnostic.source === 'quascript/story' || diagnostic.source === 'quascript/project',
    )).toEqual([])
  })

  it('jumps from story targets to Node, Label, and Scene declarations', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'school.qs')
    const source = `
@Scene('school')
@Node('start')
Yuki: Choose.
- Library -> library
@Choice('Label', label('return'))
@Choice('Dorm', scene('dorm'))

@Label('return')
Yuki: Back.
`
    const extraPath = join(projectRoot, 'library.qs')
    const extraSource = "@Scene('dorm')\n@Node('library')\nYuki: Library."

    const libraryDefinition = getQuaScriptDefinitions(source, positionOf(source, 'library'), {
      extraFiles: { [extraPath]: extraSource },
      filePath,
      projectRoot,
    })
    expect(libraryDefinition[0]?.filePath).toBe(extraPath)
    expect(libraryDefinition[0]?.range.start.line).toBe(1)

    const labelDefinition = getQuaScriptDefinitions(source, positionOf(source, 'return\'))'), { filePath, projectRoot })
    expect(labelDefinition[0]?.filePath).toBeUndefined()
    expect(labelDefinition[0]?.range.start.line).toBe(8)

    const sceneDefinition = getQuaScriptDefinitions(source, positionOf(source, 'dorm\'))'), {
      extraFiles: { [extraPath]: extraSource },
      filePath,
      projectRoot,
    })
    expect(sceneDefinition[0]?.filePath).toBe(extraPath)
    expect(sceneDefinition[0]?.range.start.line).toBe(0)
  })

  it('understands entry-scoped scene targets from story declarations', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quajs-lsp-'))
    const filePath = join(projectRoot, 'scene.qs')
    const source = `
@Scene('dorm')
@Entry('nightReturn')
Yuki: Back.
- Go home -> scene:dorm#nightReturn
`

    const definitions = getQuaScriptDefinitions(source, positionOf(source, 'scene:dorm#nightReturn'), {
      filePath,
      projectRoot,
    })

    expect(definitions[0]?.filePath).toBeUndefined()
    expect(definitions[0]?.range.start.line).toBe(2)
  })
})

function positionOf(source: string, needle: string) {
  const offset = source.indexOf(needle)
  expect(offset).toBeGreaterThanOrEqual(0)

  const before = source.slice(0, offset)
  const lines = before.split('\n')
  return {
    character: lines[lines.length - 1].length,
    line: lines.length - 1,
  }
}
