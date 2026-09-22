import type { EditorStoryNode } from '@quajs/editor-core'
/* eslint-disable no-template-curly-in-string -- Fixture text contains QuaScript interpolation. */
import { mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectService } from '../src/project-service/project.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'qua-editor-'))
  roots.push(root)
  await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Editor test', bundleId: 'dev.qua.test', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(root, 'scene.qs'), 'Narrator: hello\n')
  const service = new ProjectService()
  const project = await service.open(root)
  return { root, service, project }
}
describe('editor project files', () => {
  it('uses project target declarations and performs a versioned atomic save', async () => {
    const { root, service, project } = await fixture()
    expect(project.targets.web.enabled).toBe(true)
    expect(project.targets.native.enabled).toBe(false)
    const document = await service.read('scene.qs')
    const saved = await service.save({ ...document, text: 'Narrator: updated\n' })
    expect(saved.revision).not.toBe(document.revision)
    expect(await readFile(join(root, 'scene.qs'), 'utf8')).toBe(saved.text)
  })
  it('preserves external edits instead of overwriting them', async () => {
    const { root, service } = await fixture()
    const document = await service.read('scene.qs')
    await writeFile(join(root, 'scene.qs'), 'Narrator: external\n')
    await expect(service.save({ ...document, text: 'Narrator: local\n' })).rejects.toThrow('外部修改')
    expect(await readFile(join(root, 'scene.qs'), 'utf8')).toBe('Narrator: external\n')
  })
  it('rejects symlinks that escape the project', async () => {
    const { root, service } = await fixture()
    const outside = await mkdtemp(join(tmpdir(), 'qua-editor-outside-'))
    roots.push(outside)
    await writeFile(join(outside, 'private.qs'), 'secret')
    await symlink(join(outside, 'private.qs'), join(root, 'link.qs'))
    await expect(service.read('link.qs')).rejects.toThrow('当前项目')
  })
  it('refreshes story locations and files, and disables targets while the manifest is invalid', async () => {
    const { root, service } = await fixture()
    await writeFile(join(root, 'next.qs'), '@Scene("test")\n@Node("second", { title: "Second" })\nNarrator: hello\n')
    let project = await service.refresh()
    expect(project.files).toContain('next.qs')
    expect(flattenStory(project.story).find(node => node.id === 'second')).toMatchObject({ title: 'Second', line: 2 })
    await rename(join(root, 'next.qs'), join(root, 'renamed.qs'))
    project = await service.refresh()
    expect(project.files).toContain('renamed.qs')
    expect(project.files).not.toContain('next.qs')
    const manifest = await readFile(join(root, 'qua.project.json'), 'utf8')
    await writeFile(join(root, 'qua.project.json'), '{')
    expect((await service.refresh()).targets.web.enabled).toBe(false)
    await writeFile(join(root, 'qua.project.json'), manifest)
    expect((await service.refresh()).targets.web.enabled).toBe(true)
    await rm(join(root, 'renamed.qs'))
    expect(flattenStory((await service.refresh()).story).some(node => node.id === 'second')).toBe(false)
  })
  it('uses unsaved QuaScript text and converts virtual TypeScript locations to editor coordinates', async () => {
    const { service } = await fixture()
    const text = '<script setup lang="ts">\nconst message = "hello"\n</script>\nNarrator: ${message}'
    const request = { path: 'scene.qs', text, position: { line: 4, column: 16 } }
    expect((await service.hover(request))?.contents).toContain('message')
    expect((await service.define(request))[0]?.range.start).toEqual({ line: 2, column: 7 })
    const incomplete = text.replace('${message}', '${mess')
    expect((await service.complete({ ...request, text: incomplete, position: { line: 4, column: 17 } })).some(item => item.label === 'message')).toBe(true)
    const { diagnostics } = await service.analyze('scene.qs', text.replace('${message}', '${missing}'))
    expect(diagnostics.find(item => item.code === 'TS_2304')).toMatchObject({ line: 4, column: 13 })
  })
  it('adapts decorator replacement ranges, signatures and unsaved definitions to the editor', async () => {
    const { root, service } = await fixture()
    const items = await service.complete({ path: 'scene.qs', text: '  @Cho', position: { line: 1, column: 7 } })
    expect(items.find(item => item.label === 'Choice')?.range).toEqual({ start: { line: 1, column: 4 }, end: { line: 1, column: 7 } })
    const help = await service.signature({ path: 'scene.qs', text: '@Choice("Stay", ', position: { line: 1, column: 17 } })
    expect(help?.activeParameter).toBe(1)
    expect(help?.signatures[0].label).toBe('@Choice(text, target?, options?)')
    await expect(service.signature({ path: '../escape.qs', text: '@Choice(', position: { line: 1, column: 9 } })).rejects.toThrow()
    await writeFile(join(root, 'helper.ts'), 'export function custom() {}')
    await writeFile(join(root, 'quascript.config.json'), JSON.stringify({ decorators: { mappings: { Draft: { function: 'custom', module: './helper' } } } }))
    await service.refresh()
    await service.syncDocuments(await realpath(root), [{ path: join(root, 'helper.ts'), text: '\n\nexport function custom() {}' }])
    expect((await service.define({ path: 'scene.qs', text: '@Draft', position: { line: 1, column: 3 } }))[0]?.range.start).toEqual({ line: 3, column: 17 })
  })
  it('honors project decorator and formatting configuration', async () => {
    const { root, service } = await fixture()
    await writeFile(join(root, 'quascript.config.json'), JSON.stringify({ decorators: { autoCollect: false, mappings: { EditorTest: { function: 'custom', module: './helpers' } } }, format: { enable: false } }))
    const items = await service.complete({ path: 'scene.qs', text: '@', position: { line: 1, column: 2 } })
    expect(items.some(item => item.label === 'EditorTest')).toBe(true)
    expect(items.some(item => item.label === 'SetBackground')).toBe(false)
    expect(await service.format('scene.qs', 'Narrator: hello  \n\n\n')).toEqual([])
    await expect(service.complete({ path: 'scene.qs', text: '@', position: { line: 0, column: 1 } })).rejects.toThrow('文档位置')
  })
  it('keeps definition navigation inside the editable project boundary', async () => {
    const { root, service } = await fixture()
    await writeFile(join(root, 'helper.ts'), 'export const greeting = "hello"\n')
    const text = '<script lang="ts">\nimport { greeting } from "./helper"\n</script>\nNarrator: ${greeting}'
    const definitions = await service.define({ path: 'scene.qs', text, position: { line: 4, column: 16 } })
    expect(definitions[0]?.path).toBe(await realpath(join(root, 'helper.ts')))
    const outside = await mkdtemp(join(tmpdir(), 'qua-editor-definition-'))
    roots.push(outside)
    await writeFile(join(outside, 'outside.ts'), 'export const greeting = "outside"\n')
    await symlink(join(outside, 'outside.ts'), join(root, 'outside.ts'))
    expect(await service.define({ path: 'scene.qs', text: text.replace('./helper', './outside'), position: { line: 4, column: 16 } })).toEqual([])
  })
})

function flattenStory(nodes: EditorStoryNode[]): EditorStoryNode[] {
  return nodes.flatMap(node => [node, ...flattenStory(node.children)])
}
