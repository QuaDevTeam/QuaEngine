import { describe, expect, it } from 'vitest'
import { splitConsoleJson } from '../../ui/src/features/console/json.js'
import { NativeBuildProgress } from '../src/preview-host/native/progress.js'

describe('structured preview output', () => {
  it('recognizes prefixed, multiline and multiple strict JSON values without evaluating text', () => {
    const object = { escaped: 'a\\"}\\', markup: '<img src=x onerror=alert(1)>', nested: { items: [1, null, false] } }
    const text = `[native] dump ${JSON.stringify(object, null, 2)}\nnext [1,2,3]\n{not: 'json'}\n`
    const result = splitConsoleJson(text)
    expect(result.incomplete).toBe(false)
    expect(result.segments.filter(item => item.value).map(item => item.value)).toEqual([object, [1, 2, 3]])
    expect(result.segments.map(item => item.text).join('')).toBe(text)
  })

  it('keeps incomplete JSON for later process chunks and leaves malformed logs readable', () => {
    expect(splitConsoleJson('prefix {\n "array": [1,')).toMatchObject({ incomplete: true })
    expect(splitConsoleJson('prefix {\n "array": [1,2]}\n').segments.find(item => item.value)?.value).toEqual({ array: [1, 2] })
    expect(splitConsoleJson('line [warning] {not json}\n').segments.some(item => item.value)).toBe(false)
  })

  it('tracks actual build stages across partial ANSI log chunks without a made-up percentage', () => {
    const updates: unknown[] = []
    const progress = new NativeBuildProgress(value => updates.push(value))
    progress.append('Building native TypeScript renderer con')
    expect(updates).toHaveLength(1)
    progress.append('tracts...\n')
    progress.append('Bundling the complete native demo engine for JavaScriptCore...\n')
    progress.append('Building native demo assets and resident JavaScriptCore app QPK...\n')
    progress.append('\u001B[32mCompiling quajs_native_app v0.1\u001B[0m\n')
    progress.append('Launching complete native demo from /tmp/demo.qpk\n')
    expect(updates).toEqual([
      { stage: 'build', label: expect.any(String) },
      ...['contracts', 'scripts', 'assets', 'native', 'connect'].map(stage => ({ stage, label: expect.any(String), detail: expect.any(String) })),
    ])
  })
})
