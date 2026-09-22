/* eslint-disable no-template-curly-in-string -- QuaScript fixtures contain literal interpolation. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeQuaScript, checkTypeScriptProject, getQuaScriptHover, QuaScriptTypeScriptSession } from '../src'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
describe('shared authoring analysis', () => {
  it('takes speakers and literal ranges from the AST while excluding scripts, comments, narration and interpolations', async () => {
    const source = [
      '<script setup lang="ts">',
      'const value = { label: "not dialogue" }',
      '</script>',
      '// Ghost: comment',
      '  神代凛: 前面 ${value.label} 后面😀',
      'Mara: A colon: remains dialogue',
      '没有角色署名的旁白。',
      '- 选择 -> next',
    ].join('\r\n')
    const analysis = await analyzeQuaScript(source)
    const slice = (range: { start: { offset: number }, end: { offset: number } }) => source.slice(range.start.offset, range.end.offset)
    expect(analysis.previewSteps[0]).toMatchObject({ index: 0, range: { start: { line: 4 } } })
    expect(analysis.previewSteps.at(-1)?.range.end.line).toBe(7)
    expect(analysis.dialogueHighlights.map(item => item.character)).toEqual(['神代凛', 'Mara'])
    const first = analysis.dialogueHighlights[0]
    expect(slice(first.speaker)).toBe('神代凛')
    expect(first.speaker.start).toMatchObject({ line: 4, column: 2 })
    expect(first.text.map(slice)).toEqual(['前面 ', ' 后面😀'])
    expect(analysis.dialogueHighlights[1].text.map(slice)).toEqual(['A colon: remains dialogue'])
    expect((await analyzeQuaScript(source, { toolingConfig: { lint: { enable: false } } })).dialogueHighlights).toEqual(analysis.dialogueHighlights)
  })

  it('reuses TypeScript while refreshing virtual text, external dependencies and configuration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qua-session-'))
    roots.push(root)
    const filePath = join(root, 'scene.qs')
    const helper = join(root, 'helper.ts')
    writeFileSync(helper, 'export const value = 1')
    const typescriptSession = new QuaScriptTypeScriptSession()
    const options = { filePath, projectRoot: root, typescriptSession }
    const source = '<script lang="ts">\nimport { value } from "./helper"\n</script>\nRin: ${value.toFixed()}'
    try {
      expect((await analyzeQuaScript(source, options)).diagnostics.filter(item => item.severity === 'error')).toEqual([])
      expect((await getQuaScriptHover(source, { line: 3, character: 8 }, options))?.contents).toContain('value')
      writeFileSync(helper, 'export const value = "changed"')
      expect((await analyzeQuaScript(source, options)).diagnostics.some(item => item.code === 'TS_2551')).toBe(true)
      expect((await analyzeQuaScript(source.replace('value.toFixed()', 'missing'), options)).diagnostics.some(item => item.code === 'TS_2304')).toBe(true)
      expect((await analyzeQuaScript('Mara: plain dialogue', options)).diagnostics.filter(item => item.severity === 'error')).toEqual([])
    }
    finally { typescriptSession.dispose() }
  })

  it('checks unopened TypeScript files and tsconfig diagnostics without emitting output', () => {
    const root = mkdtempSync(join(tmpdir(), 'qua-tscheck-'))
    roots.push(root)
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, types: [] }, include: ['*.ts'] }))
    writeFileSync(join(root, 'broken.ts'), 'export const count: number = "wrong"')
    expect(checkTypeScriptProject(root).find(item => item.code === 'TS_2322')).toMatchObject({ filePath: join(root, 'broken.ts'), range: { start: { line: 0, column: 13 } } })
    writeFileSync(join(root, 'broken.ts'), 'export const count: number = 3')
    expect(checkTypeScriptProject(root)).toEqual([])
    writeFileSync(join(root, 'tsconfig.json'), '{')
    expect(checkTypeScriptProject(root).some(item => item.severity === 'error')).toBe(true)
  })
})
