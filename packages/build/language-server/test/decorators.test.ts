/* eslint-disable no-template-curly-in-string -- QuaScript interpolation fixtures. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decoratorArgumentContext, decoratorOccurrences } from '../src/decorators'
import { getQuaScriptCompletions, getQuaScriptDefinitions, getQuaScriptHover, getQuaScriptSignatureHelp, QuaScriptTypeScriptSession } from '../src/index'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'qua-decorators-'))
  roots.push(projectRoot)
  writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({ plugins: [{
    name: 'story-effects',
    decorators: { Mood: { module: './effects', function: 'mood' } },
    language: { decorators: { Mood: { description: 'Change the mood.', args: [
      { name: 'value', values: ['calm', 'tense'], detail: 'Mood to display' },
      { name: 'options', detail: 'Transition options' },
    ] } } },
  }] }))
  return { projectRoot, filePath: join(projectRoot, 'scene.qs') }
}
function cursor(source: string, needle = '|') {
  const offset = source.indexOf(needle)
  const lines = source.slice(0, offset).split('\n')
  return { line: lines.length - 1, character: lines.at(-1)!.length }
}

describe('decorator language intelligence', () => {
  it('replaces the entire name without consuming @ or arguments and supplies documentation', async () => {
    const options = fixture()
    const source = '  @Mo|od("calm")'
    const item = (await getQuaScriptCompletions(source.replace('|', ''), cursor(source), options)).find(item => item.label === 'Mood')!
    expect(item.detail).toContain('@Mood(value, options)')
    expect(item.documentation).toContain('Change the mood.')
    expect(item.range?.start.column).toBe(3)
    expect(item.range?.end.column).toBe(7)
    expect(item.insertText).toBe('Mood')
  })

  it('ignores comments, embedded TypeScript and @ inside multiline argument strings', async () => {
    const source = '<script lang="ts">\n@Mood\nclass Demo {}\n</script>\n/*\n@Mood\n*/\n// @Mood\n@Mood(`line\n@Mood\n`)\n@QuickLoad()'
    expect(decoratorOccurrences(source).map(item => item.name)).toEqual(['Mood', 'QuickLoad'])
    const items = await getQuaScriptCompletions('// @Mo', { line: 0, character: 6 }, fixture())
    expect(items.some(item => item.kind === 'decorator')).toBe(false)
  })

  it('tracks multiline arguments across nested calls, objects, strings, comments and templates', async () => {
    const source = '@Mood(\n  fn({ a: [1, 2] }, `x,${foo(1, 2)}`), /* , ) */\n  |'
    const text = source.replace('|', '')
    const help = await getQuaScriptSignatureHelp(text, cursor(source), fixture())
    expect(help?.activeParameter).toBe(1)
    expect(help?.signatures[0]).toMatchObject({ label: '@Mood(value, options)', parameters: [{ label: 'value', documentation: 'Mood to display' }, { label: 'options' }] })
    expect(decoratorArgumentContext('@Mood("calm")', { line: 0, character: 13 })).toBeUndefined()
  })

  it('completes values on later lines with a complete quoted replacement range', async () => {
    const source = '@Mood(\r\n  "ca|lm"\r\n)'
    const items = await getQuaScriptCompletions(source.replace('|', ''), cursor(source), fixture())
    const item = items.find(item => item.label === 'calm')!
    expect(item.insertText).toBe('calm')
    expect(item.range).toMatchObject({ start: { line: 1, column: 3 }, end: { line: 1, column: 7 } })
  })

  it('resolves workspace definitions and JSDoc through re-exports and unsaved TS drafts', async () => {
    const options = fixture()
    const definition = join(options.projectRoot, 'implementation.ts')
    const session = new QuaScriptTypeScriptSession()
    const language = { ...options, typescriptSession: session, extraFiles: {
      [join(options.projectRoot, 'effects.ts')]: 'export { mood } from "./implementation"',
      [definition]: '/** Set the visible mood. */\nexport function mood(value: string) {}',
    } }
    try {
      const definitions = getQuaScriptDefinitions('@Mood("calm")', { line: 0, character: 3 }, language)
      expect(definitions[0]).toMatchObject({ filePath: definition, range: { start: { line: 1, column: 16 } } })
      language.extraFiles[definition] = '\n\nexport function mood(value: string) {}'
      expect(getQuaScriptDefinitions('@Mood', { line: 0, character: 2 }, language)[0]?.range.start.line).toBe(2)
      const hover = await getQuaScriptHover('@Mood', { line: 0, character: 2 }, language)
      expect(hover?.contents).toContain('Mood to display')
    }
    finally { session.dispose() }
  })

  it('keeps all providers aligned with auto-collection and value-import activation', async () => {
    const options = { ...fixture(), toolingConfig: { decorators: { autoCollect: false } } }
    expect((await getQuaScriptCompletions('@Mo', { line: 0, character: 3 }, options)).some(item => item.label === 'Mood')).toBe(false)
    expect(await getQuaScriptHover('@Mood', { line: 0, character: 2 }, options)).toBeUndefined()
    expect(await getQuaScriptSignatureHelp('@Mood(', { line: 0, character: 6 }, options)).toBeUndefined()
    expect(getQuaScriptDefinitions('@Mood', { line: 0, character: 2 }, options)).toEqual([])
    for (const kind of ['type ', '']) {
      const source = `<script lang="ts">\nimport ${kind}{ mood } from './effects'\n</script>\n@Mood(`
      expect(Boolean(await getQuaScriptSignatureHelp(source, { line: 3, character: 6 }, options))).toBe(!kind)
    }
  })

  it('does not inherit a different plugin signature after an explicit mapping override', async () => {
    const options = { ...fixture(), toolingConfig: { decorators: { mappings: { Mood: { module: './custom', function: 'other' } } } } }
    expect(await getQuaScriptSignatureHelp('@Mood(', { line: 0, character: 6 }, options)).toBeUndefined()
  })

  it('keeps generated virtual helpers out of author-facing argument completion', async () => {
    const source = '@Mood("calm", '
    const items = await getQuaScriptCompletions(source, { line: 0, character: source.length }, fixture())
    expect(items.some(item => ['__quaDecorator', '__quaExpr', 'createQuaScript'].includes(item.label))).toBe(false)
    expect(items.some(item => item.label === 'scope')).toBe(true)
  })

  it('provides builtin DSL signatures without requiring plugin discovery', async () => {
    expect((await getQuaScriptSignatureHelp('@Choice("Stay", ', { line: 0, character: 16 }, fixture()))?.signatures[0].label).toBe('@Choice(text, target?, options?)')
    expect((await getQuaScriptSignatureHelp('@QuickLoad(', { line: 0, character: 11 }, fixture()))?.signatures[0].parameters).toEqual([])
  })
})
