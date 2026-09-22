import type { CharacterCatalog, SourceTarget } from '../src/contracts'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { indexCharacters } from '../src/indexing/indexer'

async function inspect(files: Record<string, string>): Promise<CharacterCatalog> {
  return indexCharacters({
    root: '/fixture',
    entries: Object.entries(files).map(([path, text]) => ({ path, kind: path.endsWith('.png') ? 'image' : 'document', size: text.length, modified: 0 })),
    readDocument: async path => ({ path: `/fixture/${path}`, text: files[path], revision: createHash('sha256').update(files[path]).digest('hex') }),
  })
}
function replace(source: string, target: SourceTarget, newText: string): string {
  expect(source.slice(target.start, target.end)).toBe(target.expectedText)
  return source.slice(0, target.start) + newText + source.slice(target.end)
}

describe('character editor source indexing', () => {
  it('indexes the actual Demo map/destructuring/template definitions and manifest paths', async () => {
    const source = await readFile(new URL('../../../../demo/src/game/content/characters.ts', import.meta.url), 'utf8')
    const manifest = await readFile(new URL('../../../../demo/assets/characters/rin/sprite.manifest.json', import.meta.url), 'utf8')
    const result = await inspect({ 'characters.ts': source, 'assets/characters/rin/sprite.manifest.json': manifest, 'assets/characters/rin/smile.png': '' })
    expect(result.characters).toHaveLength(6)
    const rin = result.characters[0]
    expect(rin.id.value).toBe('rin')
    expect(rin.displayName.value).toBe('神代凛')
    expect(rin.displayName.edit?.expectedText).toBe('\'神代凛\'')
    expect(rin.expressions.find(item => item.name === 'smile')?.assets[0].path).toBe('assets/characters/rin/smile.png')
    expect(rin.expressions.length).toBeGreaterThan(50)
    expect(rin.addExpression).toBeDefined()
    expect(rin.remove).toBeUndefined()
    expect(result.issues).toEqual([])
  })

  it('resolves aliases, namespaces, imported constants, shorthand and createCharacter without executing calls', async () => {
    const result = await inspect({
      'src/data.ts': 'export const name = "Yuki"; export const profile = { id: "yuki", displayName: name, aliases: ["雪"] } as const',
      'src/main.ts': `import { registerCharacter as add, createCharacter } from '@quajs/character'
import * as characters from '@quajs/character'
import { profile } from './data.js'
add(profile)
characters.registerCharacters([{id: 'rin', displayName: '凛'}])
createCharacter('mara', { displayName: 'Mara' })
function fake(registerCharacter: (p: unknown) => void) { registerCharacter({ id: 'wrong' }) }
add((() => { throw new Error('must never execute') })())`,
    })
    expect(result.characters.map(character => character.id.value)).toEqual(['yuki', 'rin', 'mara'])
    expect(result.characters[0].displayName.edit?.path).toBe('src/data.ts')
    expect(result.issues).toHaveLength(1)
    expect(result.registrations).toHaveLength(1)
  })

  it('keeps dynamic values unknown, reports duplicates, handles cycles and limits shared field editing', async () => {
    const result = await inspect({ 'characters.ts': `import { registerCharacter as add } from '@quajs/character'
const title = 'Shared'
const loop = loop
add({ id: 'a', displayName: title })
add({ id: 'b', displayName: title })
add({ id: 'a', displayName: dynamicName(), sprites: loop })
add({id: 'hidden', ...getProfile()})` })
    expect(result.characters.map(character => character.id.value)).toEqual(['a', 'b', 'a'])
    expect(result.characters[0].warnings.join()).toContain('重复 ID')
    expect(result.characters[0].displayName.edit).toBeUndefined()
    expect(result.characters[2].warnings.join()).toContain('动态表达式')
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('edits/removes literal definitions and appends while preserving surrounding source', async () => {
    const source = `import { registerCharacters } from '@quajs/character'\nregisterCharacters([\n // keep\n { id: 'a', displayName: 'A' },\n { id: 'b', displayName: 'B' },\n])\n// footer`
    const result = await inspect({ 'characters.ts': source })
    const renamed = replace(source, result.characters[0].displayName.edit!, '"New"')
    expect(renamed).toContain('// keep')
    expect((await inspect({ 'characters.ts': renamed })).characters[0].displayName.value).toBe('New')
    for (const character of result.characters) {
      const removed = replace(source, character.remove!, '')
      expect((await inspect({ 'characters.ts': removed })).characters).toHaveLength(1)
    }
    const append = result.registrations[0].append
    const added = replace(source, append, `${append.expectedText}\n${append.appendComma ? ',' : ''}\n{ id: 'c' }\n`)
    expect((await inspect({ 'characters.ts': added })).characters.map(character => character.id.value)).toEqual(['a', 'b', 'c'])
    expect(added).toContain('// footer')
  })

  it('supports manifest edits and removal including a single property without leaving invalid commas', async () => {
    const source = `import { registerCharacter } from '@quajs/character'; registerCharacter({ id: 'a', spriteManifest: 'a/sprite.manifest.json' })`
    const manifest = JSON.stringify({ version: 1, expressions: { smile: { layers: [{ asset: 'a/smile.png', opacity: 0.5 }] } } }, null, 2)
    const files = { 'characters.ts': source, 'assets/characters/a/sprite.manifest.json': manifest }
    const result = await inspect(files)
    const expression = result.characters[0].expressions[0]
    const changed = replace(manifest, expression.assets[0].edit!, '"a/happy.png"')
    expect(JSON.parse(changed).expressions.smile.layers[0]).toEqual({ asset: 'a/happy.png', opacity: 0.5 })
    expect(JSON.parse(replace(manifest, expression.remove!, '')).expressions).toEqual({})
    const single = `import {registerCharacters} from '@quajs/character'; registerCharacters([{id:'a'},])`
    const singleResult = await inspect({ 'characters.ts': single })
    expect((await inspect({ 'characters.ts': replace(single, singleResult.characters[0].remove!, '') })).characters).toEqual([])
  })

  it('does not resolve escaped/missing asset references and reports malformed manifests', async () => {
    const result = await inspect({
      'characters.ts': `import {registerCharacters} from '@quajs/character'; registerCharacters([{id:'a',sprite:'../secret.png'}, {id:'b',spriteManifest:'b/sprite.manifest.json'}])`,
      'assets/characters/b/sprite.manifest.json': '{broken}',
    })
    expect(result.characters[0].base[0].path).toBeUndefined()
    expect(result.characters[1].warnings.join()).toContain('读取失败')
  })

  it('resolves family-relative sprite paths through sprite contracts and keeps unknown tuple positions', async () => {
    const result = await inspect({
      'characters.ts': `import {registerCharacters, createCharacter} from '@quajs/character'; registerCharacters([['a', dynamic(), 'wrong']].map(([id, displayName]) => ({id,displayName,spriteManifest:'a/sprite.manifest.json'}))); createCharacter('bare')`,
      'assets/characters/a/sprite.manifest.json': JSON.stringify({ version: 1, family: 'a', base: { asset: 'smile.png' }, expressions: {} }),
      'assets/characters/a/smile.png': '',
    })
    expect(result.characters[0].displayName.value).not.toBe('wrong')
    expect(result.characters[0].base[0].path).toBe('assets/characters/a/smile.png')
    expect(result.characters[1].displayName.edit).toBeUndefined()
  })
})
