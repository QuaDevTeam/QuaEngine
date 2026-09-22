/* eslint-disable no-template-curly-in-string -- QuaScript source fixtures. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseQuaScriptDocument, QuaScriptParser } from '@quajs/script-compiler'
import { afterEach, describe, expect, it } from 'vitest'
import { collectQuaScriptAuthoring } from '../src/authoring'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'qua-authoring-'))
  roots.push(projectRoot)
  writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({ plugins: [{
    name: 'fixture',
    decorators: { Mood: { module: './effects', function: 'mood' } },
    language: { decorators: { Mood: { args: [{ name: 'value', values: ['calm', 'tense'] }, { name: 'options' }] } } },
  }] }))
  return { projectRoot }
}
function authoring(source: string, options = fixture()) {
  return collectQuaScriptAuthoring(source, new QuaScriptParser().parse(parseQuaScriptDocument(source).dslBody), options)
}

describe('source-preserving authoring projection', () => {
  it('preserves attachment, action boundaries, masked script blocks and choice steps', async () => {
    const source = '<script lang="ts">\nconst text = "@Mood()"\n</script>\n@Mood("calm")\n\n// action ends above\n@Mood("tense")\n凛: 雨。\n- Stay\n- Leave\n'
    const result = await authoring(source)
    expect(result.steps.map(step => step.kind)).toEqual(['action', 'dialogue', 'choice'])
    expect(result.steps[1]).toMatchObject({ line: 7, endLine: 8 })
    expect(result.steps[1].decorators).toHaveLength(1)
    expect(result.steps[1].fields.map(field => [field.label, source.slice(field.start, field.end)])).toEqual([['说话角色', '凛'], ['文本', '雨。']])
    expect(result.steps[2].decorators).toEqual([])
  })

  it('edits only leaf bytes inside multiline parameters, retaining comments, CRLF and expressions', async () => {
    const source = '  @Mood(\r\n    "calm",\r\n    { /* composition */ position: { x: -25, y: 1080 }, enabled: true, gain: scope.gain, label: "雨\\\"🌧" }\r\n  )\r\n凛: Hello ${scope.name}.\r\n'
    const result = await authoring(source)
    const fields = result.steps[0].decorators[0].fields
    expect(fields.find(field => field.label === 'value')).toMatchObject({ kind: 'string', value: 'calm', choices: ['calm', 'tense'] })
    expect(fields.find(field => field.label === 'options.gain')).toMatchObject({ kind: 'expression', value: 'scope.gain' })
    expect(fields.find(field => field.label === 'options.enabled')).toMatchObject({ kind: 'boolean', value: 'true' })
    expect(fields.find(field => field.label === 'options.label')?.value).toBe('雨"🌧')
    const x = fields.find(field => field.label === 'options.position.x')!
    expect(source.slice(x.start, x.end)).toBe('-25')
    const edited = `${source.slice(0, x.start)}50${source.slice(x.end)}`
    expect(edited).toBe(source.replace('x: -25', 'x: 50'))
    expect((await authoring(edited)).steps[0].fields.at(-1)?.value).toBe('Hello ${scope.name}.')
  })

  it('keeps spreads, shorthand, computed properties, arrays and calls as expressions', async () => {
    for (const value of ['{ ...scope.options, x: 1 }', '{ x }', '{ [key]: 1 }', '[1, 2]', 'choose("a", "b")']) {
      const result = await authoring(`@Mood("calm", ${value})\nA: hi`)
      expect(result.steps[0].decorators[0].fields[1]).toMatchObject({ kind: 'expression', value })
    }
  })

  it('normalizes numeric input values without rewriting their source representations', async () => {
    const source = '@Mood("calm", { distance: 1_024, offset: - 0x20 })\nA: hi'
    const fields = (await authoring(source)).steps[0].decorators[0].fields
    expect(fields.find(field => field.label === 'options.distance')).toMatchObject({ kind: 'number', value: '1024' })
    const offset = fields.find(field => field.label === 'options.offset')!
    expect(offset.value).toBe('-32')
    expect(source.slice(offset.start, offset.end)).toBe('- 0x20')
  })

  it('disables malformed source and respects active mappings including explicit overrides', async () => {
    expect((await authoring('@Mood("calm"\nA: hi')).error).toBeTruthy()
    const options = fixture()
    const noAuto = await collectQuaScriptAuthoring('', new QuaScriptParser().parse(''), { ...options, toolingConfig: { decorators: { autoCollect: false } } })
    expect(noAuto.decorators.some(item => item.name === 'Mood')).toBe(false)
    const source = '@Mood("calm")\nA: hi'
    const override = await collectQuaScriptAuthoring(source, new QuaScriptParser().parse(source), { ...options, toolingConfig: { decorators: { mappings: { Mood: { module: './other', function: 'other' } } } } })
    expect(override.steps[0].decorators[0].fields[0]).toMatchObject({ label: '参数 1', choices: undefined })
  })
})
