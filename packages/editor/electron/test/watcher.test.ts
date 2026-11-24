import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { listSourceFiles } from '../src/project-service/files.js'
import { ProjectWatcher } from '../src/project-service/watcher.js'

it('observes atomic replacements and new directories, excludes generated/dependency/symlink trees, and disposes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qua-editor-watch-'))
  const outside = await mkdtemp(join(tmpdir(), 'qua-editor-unwatched-'))
  const changes: string[][] = []
  const watcher = new ProjectWatcher(root, paths => changes.push(paths))
  const covers = (path: string, since: number) => changes.slice(since).flat().some(changed =>
    !changed || changed === path || path.startsWith(`${changed}/`),
  )
  try {
    for (const name of ['src', 'node_modules', '.generated'])
      await mkdir(join(root, name))
    await symlink(outside, join(root, 'linked'), 'dir')
    await writeFile(join(root, 'src', 'scene.qs'), 'hello')
    const sources = await listSourceFiles(root)
    expect(sources.directories).toHaveLength(2)
    expect(watcher.update(sources.directories)).toEqual([])
    await writeFile(join(root, 'src', 'replace.tmp'), 'updated')
    await rename(join(root, 'src', 'replace.tmp'), join(root, 'src', 'scene.qs'))
    // Consumers rescan when a directory is invalidated during native watcher startup.
    await expect.poll(() => covers('src/scene.qs', 0), { timeout: 3000 }).toBe(true)
    const beforeDirectory = changes.length
    await mkdir(join(root, 'src', 'chapters'))
    await expect.poll(() => covers('src/chapters', beforeDirectory), { timeout: 3000 }).toBe(true)
    const beforeFile = changes.length
    watcher.update((await listSourceFiles(root)).directories)
    await writeFile(join(root, 'src', 'chapters', 'new.qs'), 'new')
    await expect.poll(() => covers('src/chapters/new.qs', beforeFile), { timeout: 3000 }).toBe(true)
    expect((await listSourceFiles(root)).files).toContain('src/chapters/new.qs')
    // A later ordinary write still has to reach us via the live subscription.
    const beforeEdit = changes.length
    await writeFile(join(root, 'src', 'chapters', 'new.qs'), 'edited')
    await expect.poll(() => changes.slice(beforeEdit).flat(), { timeout: 3000 }).toContain('src/chapters/new.qs')
    await writeFile(join(root, 'node_modules', 'ignored.qs'), 'ignored')
    await writeFile(join(root, '.generated', 'ignored.qs'), 'ignored')
    await writeFile(join(outside, 'ignored.qs'), 'ignored')
    await delay(500)
    expect(changes.flat().some(path => path.includes('ignored'))).toBe(false)
    await writeFile(join(root, '.eslintrc.json'), '{"rules":{}}')
    await writeFile(join(root, '.eslintignore'), 'generated.ts\n')
    await expect.poll(() => changes.flat(), { timeout: 3000 }).toContain('.eslintrc.json')
    await expect.poll(() => changes.flat(), { timeout: 3000 }).toContain('.eslintignore')
    watcher.close()
    const count = changes.length
    await writeFile(join(root, 'src', 'scene.qs'), 'after-close')
    await delay(500)
    expect(changes).toHaveLength(count)
  }
  finally {
    watcher.close()
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
}, 12000)
