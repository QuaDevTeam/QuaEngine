import { describe, expect, it } from 'vitest'
import { analyzeQuaScript, getQuaScriptCompletions } from '../src'

describe('@quajs/language-server helpers', () => {
  it('creates diagnostics-free virtual TypeScript for typed qs files', async () => {
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
`)

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
})
