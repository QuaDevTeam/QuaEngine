import type { EditorProject, EditorSearchRequest } from '@quajs/editor-core'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { createTree, flattenTree, fuzzyScore } from '../../ui/src/features/explorer/model.js'
import { importAssetFiles, projectPath } from '../src/project-service/asset-files.js'
import { listSourceFiles } from '../src/project-service/files.js'
import { ProjectService } from '../src/project-service/project.js'
import { ProjectSearch } from '../src/project-service/search.js'

const roots: string[] = []
const searches: ProjectSearch[] = []
afterEach(async () => {
  for (const search of searches.splice(0)) search.cancel()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function temporary() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-workbench-')))
  roots.push(root)
  return root
}
async function searchFixture() {
  const root = await temporary()
  await mkdir(join(root, 'src'))
  await mkdir(join(root, 'node_modules'))
  await writeFile(join(root, 'src', 'one.qs'), '凛😀: Hello HELLO helloWorld\nNarrator: hello\n')
  await writeFile(join(root, 'src', 'two.ts'), 'const hello = "hello"\n')
  await writeFile(join(root, 'node_modules', 'ignored.ts'), 'hello')
  await writeFile(join(root, '.hidden.ts'), 'hello')
  const sources = await listSourceFiles(root)
  const project: EditorProject = { root, name: 'test', bundleId: 'dev.test', ...sources, story: [], diagnostics: [], targets: { web: { enabled: false }, native: { enabled: false } } }
  const search = new ProjectSearch()
  searches.push(search)
  const request: EditorSearchRequest = { root, query: 'hello', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '' }
  return { root, project, search, request }
}

describe('workbench files and search', () => {
  it('indexes media and empty directories, with stable tree order and filtered ancestors', async () => {
    const root = await temporary()
    await mkdir(join(root, 'assets', 'empty'), { recursive: true })
    await writeFile(join(root, 'assets', 'portrait.PNG'), 'image')
    await writeFile(join(root, 'chapter10.qs'), 'story')
    await writeFile(join(root, 'chapter2.qs'), 'story')
    const index = await listSourceFiles(root)
    expect(index.entries.find(entry => entry.path.endsWith('.PNG'))?.kind).toBe('image')
    const tree = createTree(index.entries, ['assets', 'assets/empty'])
    expect(flattenTree(tree, new Set(), '').map(row => row.node.name)).toEqual(['assets', 'chapter2.qs', 'chapter10.qs'])
    expect(flattenTree(tree, new Set(), 'prt.PNG').map(row => row.node.path)).toEqual(['assets', 'assets/portrait.PNG'])
    expect(fuzzyScore('assets/portrait.PNG', 'portrait')).toBeGreaterThan(fuzzyScore('assets/portrait.PNG', 'prt'))
    expect(flattenTree(tree, new Set(['assets']), '').some(row => row.node.path === 'assets/empty')).toBe(true)
  })

  it('uses native search with Unicode editor columns, flags, globs and invalid-regex errors', async () => {
    const { project, search, request } = await searchFixture()
    const result = await search.search(project, request)
    expect(result.matches).toHaveLength(6)
    const first = result.matches.find(match => match.text.includes('Hello') && match.start === 5)!
    expect(first).toMatchObject({ path: 'src/one.qs', line: 1, column: 6, start: 5, end: 10 })
    expect(first.text.slice(first.start, first.end)).toBe('Hello')
    expect((await search.search(project, { ...request, wholeWord: true })).matches).toHaveLength(5)
    expect((await search.search(project, { ...request, caseSensitive: true })).matches).toHaveLength(4)
    expect((await search.search(project, { ...request, include: '**/*.qs', exclude: '**/two*' })).matches).toHaveLength(4)
    expect((await search.search(project, { ...request, include: '**/*.{qs,ts}' })).matches).toHaveLength(6)
    expect((await search.search(project, { ...request, regex: true, query: 'h.llo', caseSensitive: true, exclude: '**/*.ts' })).matches).toHaveLength(2)
    await expect(search.search(project, { ...request, regex: true, query: '[' })).rejects.toThrow('regex')
    await expect(search.search(project, { ...request, root: '/other' })).rejects.toThrow('项目已切换')
  })

  it('cancels superseded searches and bounds large result sets', async () => {
    const { root, project, search, request } = await searchFixture()
    await writeFile(join(root, 'src', 'one.qs'), 'hello\n'.repeat(1800))
    const pending = search.search(project, request)
    search.cancel()
    expect((await pending).cancelled).toBe(true)
    const result = await search.search(project, request)
    expect(result.truncated).toBe(true)
    expect(result.matches).toHaveLength(1000)
    await writeFile(join(root, 'src', 'one.qs'), `${'前'.repeat(15000)}hello${' trailing'.repeat(10000)}`)
    const longLine = (await search.search(project, { ...request, include: '**/*.qs' })).matches[0]
    expect(longLine.column).toBe(15001)
    expect(longLine.text.length).toBeLessThan(500)
    expect(longLine.text.slice(longLine.start, longLine.end)).toBe('hello')
  })

  it('imports media without overwriting and rejects symlink destinations and reads outside the root', async () => {
    const root = await temporary()
    const outside = await temporary()
    await mkdir(join(root, 'assets'))
    await writeFile(join(outside, 'sound.wav'), 'new audio')
    await writeFile(join(outside, 'script.ts'), 'source')
    await writeFile(join(root, 'assets', 'sound.wav'), 'existing audio')
    const result = await importAssetFiles(root, 'assets', [join(outside, 'sound.wav'), join(outside, 'script.ts')])
    expect(result).toEqual({ imported: [], skipped: ['sound.wav', 'script.ts'] })
    expect(await readFile(join(root, 'assets', 'sound.wav'), 'utf8')).toBe('existing audio')
    await writeFile(join(outside, 'picture.png'), 'pixels')
    expect((await importAssetFiles(root, 'assets', [join(outside, 'picture.png')])).imported).toEqual(['assets/picture.png'])
    await symlink(outside, join(root, 'escape'))
    await expect(importAssetFiles(root, 'escape', [join(outside, 'picture.png')])).rejects.toThrow('当前项目')
    await expect(projectPath(root, 'escape/picture.png')).rejects.toThrow('当前项目')
    const index = await listSourceFiles(root)
    expect(index.entries.some(entry => entry.path.startsWith('escape/'))).toBe(false)
  })

  it('rasterizes bounded previews in the project service and refuses non-images', async () => {
    const root = await temporary()
    await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'test', bundleId: 'dev.test', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
    await writeFile(join(root, 'package.json'), '{}')
    await sharp({ create: { width: 2000, height: 1000, channels: 4, background: '#abcdef' } }).png().toFile(join(root, 'image.png'))
    await sharp({ create: { width: 600, height: 400, channels: 3, background: '#abcdef' } }).jpeg().withMetadata({ orientation: 6 }).toFile(join(root, 'portrait.jpg'))
    const service = new ProjectService()
    await service.open(root)
    expect(await sharp(await service.thumbnail(root, 'image.png')).metadata()).toMatchObject({ width: 160, height: 80 })
    expect(await sharp(await service.thumbnail(root, 'image.png', true)).metadata()).toMatchObject({ width: 1280, height: 640 })
    expect(await service.imageMetadata(root, 'image.png')).toEqual({ width: 2000, height: 1000, format: 'png', hasAlpha: true })
    expect(await service.imageMetadata(root, 'portrait.jpg')).toEqual({ width: 400, height: 600, format: 'jpeg', hasAlpha: false })
    await expect(service.imageMetadata(root, 'package.json')).rejects.toThrow('图片')
    await expect(service.imageMetadata('/old-project', 'image.png')).rejects.toThrow('项目已切换')
    await expect(service.thumbnail(root, 'package.json')).rejects.toThrow('图片')
    await expect(service.thumbnail('/old-project', 'image.png')).rejects.toThrow('项目已切换')
  })
})
