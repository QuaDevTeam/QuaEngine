import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { ProjectService } from '../src/project-service/project.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-file-operations-')))
  roots.push(root)
  await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Files', bundleId: 'dev.qua.files', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'files', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(root, 'scene.qs'), 'Rin: 原文。\n')
  const service = new ProjectService()
  await service.open(root)
  return { root, service }
}
it('creates, copies and moves literal Unicode files and nested directories without replacing existing content', async () => {
  const { root, service } = await fixture()
  await service.fileOperation(root, { kind: 'create-directory', destination: '新章节' })
  await service.fileOperation(root, { kind: 'create-file', destination: '新章节/序章.qs' })
  await service.refresh()
  await service.fileOperation(root, { kind: 'copy', path: 'scene.qs', destination: '新章节/复制.qs' })
  expect(await readFile(join(root, '新章节/复制.qs'), 'utf8')).toBe('Rin: 原文。\n')
  await expect(service.fileOperation(root, { kind: 'move', path: 'scene.qs', destination: '新章节/复制.qs' })).rejects.toThrow('已存在')
  expect(await readFile(join(root, 'scene.qs'), 'utf8')).toBe('Rin: 原文。\n')
  await service.refresh()
  await service.fileOperation(root, { kind: 'move', path: '新章节', destination: '已移动' })
  expect((await stat(join(root, '已移动/序章.qs'))).isFile()).toBe(true)
  await expect(stat(join(root, '新章节'))).rejects.toMatchObject({ code: 'ENOENT' })
  await service.refresh()
  await expect(service.fileOperation(root, { kind: 'move', path: '已移动', destination: '已移动/child' })).rejects.toThrow('自身')
  await service.fileOperation(root, { kind: 'copy', path: '已移动', destination: '目录副本' })
  expect(await readFile(join(root, '目录副本/复制.qs'), 'utf8')).toBe('Rin: 原文。\n')
  await service.fileOperation(root, { kind: 'move', path: 'scene.qs', destination: 'Scene.qs' })
  expect((await service.refresh()).files).toContain('Scene.qs')
  expect(await readFile(join(root, 'Scene.qs'), 'utf8')).toBe('Rin: 原文。\n')
})
it('rejects project-root mutation, traversal, reserved names, ignored paths and stale projects', async () => {
  const { root, service } = await fixture()
  for (const destination of ['../escape.qs', '/tmp/escape.qs', 'a/../b.qs', 'a\\b.qs', '.git/file', 'node_modules/file', 'NUL.qs', 'test:bad.qs', 'trailing.'])
    await expect(service.fileOperation(root, { kind: 'create-file', destination })).rejects.toThrow()
  await expect(service.mutationPath(root, '')).rejects.toThrow()
  await expect(service.mutationPath(root, '../')).rejects.toThrow()
  await expect(service.fileOperation('/old', { kind: 'create-file', destination: 'wrong.qs' })).rejects.toThrow('项目已切换')
  await expect(service.fileOperation(root, { kind: 'create-file', destination: 'scene.qs' })).rejects.toThrow('已存在')
})
it('rejects symlink sources/parents and copying folders containing links or protected directories', async () => {
  const { root, service } = await fixture()
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'qua-outside-')))
  roots.push(outside)
  await symlink(outside, join(root, 'link'), 'dir')
  await mkdir(join(root, 'folder'))
  await writeFile(join(root, 'folder', 'plain.txt'), 'keep')
  await service.refresh()
  await expect(service.fileOperation(root, { kind: 'create-file', destination: 'link/escape.qs' })).rejects.toThrow('符号链接')
  await expect(service.fileOperation(root, { kind: 'copy', path: 'link', destination: 'copy' })).rejects.toThrow()
  await symlink(outside, join(root, 'folder', 'link'), 'dir')
  await expect(service.fileOperation(root, { kind: 'copy', path: 'folder', destination: 'copy' })).rejects.toThrow('符号链接')
  await rm(join(root, 'folder', 'link'))
  await mkdir(join(root, 'folder', '.git'))
  await expect(service.fileOperation(root, { kind: 'move', path: 'folder', destination: 'moved' })).rejects.toThrow('仓库')
  expect(await readFile(join(root, 'folder', 'plain.txt'), 'utf8')).toBe('keep')
})
it('keeps the file index usable after a project manifest is renamed', async () => {
  const { root, service } = await fixture()
  await service.fileOperation(root, { kind: 'move', path: 'qua.project.json', destination: 'project-backup.json' })
  const project = await service.refresh()
  expect(project.files).toContain('project-backup.json')
  expect(project.files).not.toContain('qua.project.json')
  expect(project.targets.web.enabled).toBe(false)
  await service.fileOperation(root, { kind: 'move', path: 'project-backup.json', destination: 'qua.project.json' })
  expect((await service.refresh()).targets.web.enabled).toBe(true)
})
