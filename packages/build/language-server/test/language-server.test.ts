import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeQuaScript,
  getQuaScriptCodeActions,
  getQuaScriptCompletions,
  getQuaScriptDefinitions,
  getQuaScriptHover,
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
    expect(diagnostic?.range?.start.line).toBe(7)
    expect(diagnostic?.range?.start.column).toBeGreaterThan(10)
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

    expect(analysis.diagnostics).toEqual([])
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

    expect(messages).toContain('Choice sugar uses a complex if expression. Prefer <script setup> bindings or @Choice(..., { when }) for maintainable branching.')
    expect(messages).toContain('Choice "Cross" targets "node:dorm" in another scene. Use scene(...) or scene:id#entry for cross-scene choice jumps.')
    expect(messages).toContain('Story asset "missing.png" was not found under project assets.')
    expect(messages).toContain('Package-scoped target references unknown runtime package "runtime.unknown".')
    expect(messages).toContain('Package-scoped target "runtime.extra" should be declared through runtime package dependencies or requiredRuntimePackages.')
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

    expect(analysis.diagnostics).toEqual([])
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
