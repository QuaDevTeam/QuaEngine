import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeQuaScript,
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
