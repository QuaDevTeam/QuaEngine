import type { RegistryService } from '../src/plugins/service'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pluginProject } from '../src/plugins/project-info'
import { PluginPublisher } from '../src/plugins/publisher'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture(manager = 'npm') {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'qua-publisher-')),
  )
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const root = join(directory, 'project')
  await mkdir(join(root, 'dist'), { recursive: true })
  const manifest = {
    name: 'qua-fixture-publisher',
    version: '1.0.0',
    type: 'module',
    files: ['dist'],
    packageManager: `${manager}@11.0.0`,
    scripts: {
      prepack: 'node -e "require(\'fs\').writeFileSync(\'executed.txt\',\'bad\')"',
    },
    quajs: {
      extension: {
        schemaVersion: 1,
        id: 'fixture.publisher',
        title: 'Publisher fixture',
        runtime: { entry: './dist/index.js' },
      },
    },
  }
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(manifest, null, 2),
  )
  await writeFile(join(root, 'dist/index.js'), 'export const plugin = {}')
  const service = {
    claim: async () => 'a'.repeat(64),
  } as unknown as RegistryService
  const publisher = new PluginPublisher(
    join(directory, 'profile'),
    () => root,
    service,
    () => {},
  )
  cleanups.push(async () => {
    await publisher.cancel()
    await publisher.release()
  })
  return { root, manifest, publisher, directory }
}
describe('plugin publishing', () => {
  it.each(['npm', 'pnpm'])(
    '%s recognizes standalone projects, packs real npm artifacts without lifecycle execution and guards stale publication',
    async (manager) => {
      const { root, publisher, manifest } = await fixture(manager)
      expect((await pluginProject(root))?.metadata?.id).toBe(
        'fixture.publisher',
      )
      const publication = await publisher.prepare(root)
      expect(publication.files).toEqual(['dist/index.js', 'package.json'])
      expect(publication.integrity).toMatch(/^sha512-/)
      expect(publication.registry).toBe('https://registry.npmjs.org/')
      expect(
        await stat(join(root, 'executed.txt')).catch(() => undefined),
      ).toBeUndefined()
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ ...manifest, version: '1.0.1' }),
      )
      await expect(
        publisher.publish(root, publication.artifact),
      ).rejects.toThrow('package.json 已变化')
      await expect(publisher.publish(root, 'not-prepared')).rejects.toThrow(
        '先检查',
      )
    },
    30000,
  )
  it('returns a guarded source draft for claim and refuses missing packed entries', async () => {
    const { root, publisher } = await fixture()
    const before = await readFile(join(root, 'package.json'), 'utf8')
    const edit = await publisher.claim(root)
    expect(edit?.expectedText).toBe(before)
    expect(JSON.parse(edit!.newText).quajs.registry.claim).toBe('a'.repeat(64))
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
    await rm(join(root, 'dist/index.js'))
    await expect(publisher.prepare(root)).rejects.toThrow('缺少入口')
  }, 30000)
})
