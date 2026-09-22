import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProjectDocument } from '../src/project-service/documents.js'
import { ProjectService } from '../src/project-service/project.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture(files: Record<string, string>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-languages-')))
  roots.push(root)
  await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'languages', bundleId: 'dev.test.languages', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(root, 'package.json'), '{}')
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, allowJs: true, checkJs: true, skipLibCheck: true, types: [], module: 'esnext', moduleResolution: 'bundler' }, include: ['*.ts', '*.js'] }))
  for (const [path, text] of Object.entries(files)) await writeFile(join(root, path), text)
  const service = new ProjectService()
  await service.open(root)
  return { root, service }
}
function request(path: string, text: string, needle: string) {
  const offset = text.lastIndexOf(needle) + needle.length
  const lines = text.slice(0, offset).split('\n')
  return { path, text, position: { line: lines.length, column: lines.at(-1)!.length + 1 } }
}

describe('ordinary source languages', () => {
  it('uses project TypeScript imports and live inactive drafts, and releases closed drafts', async () => {
    const text = 'import { title } from "./helper"\nconst n: number = title\ntitle.toUpperCase()\n'
    const { root, service } = await fixture({ 'helper.ts': 'export const title = "rain"\n', 'app.ts': text, 'app.js': 'const text = "hello"\ntext.\n' })
    expect((await service.analyze('app.ts', text)).diagnostics.some(item => item.code === 'TS_2322')).toBe(true)
    expect((await service.complete(request('app.ts', text.replace('title.toUpperCase()', 'title.'), 'title.'))).some(item => item.label === 'toUpperCase')).toBe(true)
    expect((await service.hover(request('app.ts', text, 'number = tit')))?.contents).toContain('title')
    expect(await service.define(request('app.ts', text, 'number = tit'))).toContainEqual(expect.objectContaining({ path: join(root, 'helper.ts') }))
    expect((await service.complete(request('app.js', 'const text = "hello"\ntext.\n', 'text.'))).some(item => item.label === 'toUpperCase')).toBe(true)
    await service.syncDocuments(root, [{ path: 'helper.ts', text: 'export const title = 3\n' }, { path: 'app.ts', text }])
    expect((await service.analyze('app.ts', text)).diagnostics.some(item => item.code === 'TS_2322')).toBe(false)
    expect((await service.analyze('app.ts', text)).diagnostics.some(item => item.code === 'TS_2339')).toBe(true)
    await service.syncDocuments(root, [{ path: 'app.ts', text }])
    expect((await service.analyze('app.ts', text)).diagnostics.some(item => item.code === 'TS_2322')).toBe(true)
    expect(await service.format('app.js', 'const n={a:1,b:2}', { tabSize: 4, insertSpaces: true })).not.toEqual([])
    await rm(join(root, 'helper.ts'))
    await expect(service.syncDocuments(root, [{ path: 'helper.ts', text: 'export const title = 3\n' }, { path: 'app.ts', text }])).resolves.toBeUndefined()
    expect((await service.analyze('app.ts', text)).diagnostics.some(item => item.code === 'TS_2307')).toBe(true)
  })

  it('validates JSON/YAML and supplies schema completions, hover, precise edits and YAML anchors', async () => {
    const schema = { type: 'object', properties: { title: { type: 'string', description: 'Project title' }, theme: { enum: ['dark', 'light'] } } }
    const { service } = await fixture({ 'schema.json': JSON.stringify(schema), 'data.json': '{}', 'data.yaml': 'title: Rain\n', 'tsconfig.extra.json': '{}' })
    const json = '{"$schema":"./schema.json", "title": 3}'
    expect((await service.analyze('data.json', json)).diagnostics.some(item => item.message.includes('string'))).toBe(true)
    expect((await service.complete(request('data.json', '{"$schema":"./schema.json", "th"}', 'th'))).some(item => item.label === 'theme' && item.range)).toBe(true)
    expect((await service.hover(request('data.json', json, 'tit')))?.contents).toContain('Project title')
    expect((await service.analyze('data.json', '{"a": }')).diagnostics.length).toBeGreaterThan(0)
    const yaml = '# yaml-language-server: $schema=./schema.json\ntitle: 3\n'
    expect((await service.analyze('data.yaml', yaml)).diagnostics.some(item => item.message.includes('string'))).toBe(true)
    expect((await service.complete(request('data.yaml', '# yaml-language-server: $schema=./schema.json\nth', 'th'))).some(item => item.label === 'theme')).toBe(true)
    const anchors = 'default: &defaults\n  title: Rain\nnext: *defaults\n'
    expect((await service.define(request('data.yaml', anchors, '*def'))).length).toBe(1)
    expect((await service.analyze('data.yaml', 'a: [1\n')).diagnostics.length).toBeGreaterThan(0)
    expect(await service.format('data.json', '{"a":1}')).not.toEqual([])
    expect(await service.format('data.yaml', 'a:    1\n')).not.toEqual([])
    expect((await service.analyze('tsconfig.extra.json', '{\n// comment\n"compilerOptions": {}\n}')).diagnostics).toEqual([])
  })

  it('provides Markdown heading completions, link definitions, invalid-link diagnostics and formatting', async () => {
    const text = '# Rain\n\n[return](#rain)\n\n[broken](#missing)\n'
    const { root, service } = await fixture({ 'notes.md': text })
    expect((await service.complete(request('notes.md', '# Rain\n\n[return](#ra)', '#ra'))).some(item => item.label.toLowerCase().includes('rain'))).toBe(true)
    expect(await service.define(request('notes.md', text, '#rai'))).toContainEqual(expect.objectContaining({ path: join(root, 'notes.md'), range: expect.objectContaining({ start: expect.objectContaining({ line: 1 }) }) }))
    expect((await service.analyze('notes.md', text)).diagnostics.length).toBe(1)
    expect(await service.format('notes.md', '# Rain\n\n\n\nHello\n')).not.toEqual([])
  })

  it('keeps fast reads and every language request inside the editable project boundary', async () => {
    const { root, service } = await fixture({ 'app.ts': 'const a = 1', 'data.json': '{}' })
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'qua-outside-')))
    roots.push(outside)
    await writeFile(join(outside, 'secret.ts'), 'secret')
    await symlink(join(outside, 'secret.ts'), join(root, 'escape.ts'))
    await expect(readProjectDocument(root, 'escape.ts')).rejects.toThrow('当前项目')
    await expect(service.complete(request('escape.ts', 'const a = 1', 'a'))).rejects.toThrow('当前项目')
    await expect(service.syncDocuments(root, [{ path: 'escape.ts', text: 'secret' }])).rejects.toThrow('当前项目')
    await expect(service.analyze('app.ts', 'x'.repeat(2 * 1024 * 1024 + 1))).rejects.toThrow('2 MB')
    await expect(service.syncDocuments('/old', [])).rejects.toThrow('项目已切换')
    expect(await readProjectDocument(root, 'app.ts')).toMatchObject({ text: 'const a = 1', path: join(root, 'app.ts') })
  })
})
