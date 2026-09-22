import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pluginFixture } from '../scripts/plugin-fixture.mjs'
import { packageFile } from '../src/plugins/installed'
import { installArguments, packageManager } from '../src/plugins/installer'
import { PluginManager } from '../src/plugins/manager'
import {
  catalogEntries,
  catalogUrl,
  PluginRegistry,
} from '../src/plugins/registry'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qua-market-test-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const root = join(directory, 'project')
  await mkdir(root)
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: 'npm@11.0.0',
    }),
  )
  const registry = await pluginFixture(join(directory, 'registry'))
  cleanups.push(registry.close)
  const manager = new PluginManager(
    join(directory, 'profile'),
    new PluginRegistry(undefined, registry.base),
  )
  manager.setProject(root)
  return { directory, root, manager, registry }
}

describe('marketplace installation and loading', () => {
  it('installs real npm tarballs with correct dependency placement, skips lifecycle scripts and scopes activation to a project/version', async () => {
    const { root, manager, directory } = await fixture()
    for (const kind of ['devtools', 'runtime', 'combined']) {
      const name = `qua-fixture-${kind}`
      await manager.install(root, name, '1.0.0')
      const manifest = JSON.parse(
        await readFile(join(root, 'package.json'), 'utf8'),
      )
      expect(
        manifest[kind === 'devtools' ? 'devDependencies' : 'dependencies'][
          name
        ],
      ).toBe('1.0.0')
      expect(
        await stat(join(root, 'node_modules', name, 'executed.txt')).catch(
          () => undefined,
        ),
      ).toBeUndefined()
    }
    expect(
      JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
        .lockfileVersion,
    ).toBeGreaterThan(0)
    const active = await manager.active(root)
    expect(active.devtools).toHaveLength(2)
    expect(active.indexers).toHaveLength(2)
    const descriptor = active.devtools.find(
      plugin => plugin.name === 'qua-fixture-devtools',
    )!
    expect(await (await manager.resource(descriptor.url)).text()).toContain(
      'editorPlugin',
    )
    expect(
      (
        await manager.resource(
          descriptor.url.replace(
            '/dist/editor.js',
            '/%2e%2e/%2e%2e/outside.js',
          ),
        )
      ).status,
    ).toBe(404)
    expect(
      (await manager.marketplace(root, 'qua-fixture-devtools')).catalog[0].name,
    ).toBe('qua-fixture-devtools')
    await manager.enable(root, descriptor.name, false)
    expect((await manager.active(root)).devtools).toHaveLength(1)
    expect((await manager.resource(descriptor.url)).status).toBe(404)
    await manager.enable(root, descriptor.name, true)
    const installedManifest = join(
      root,
      'node_modules',
      descriptor.name,
      'package.json',
    )
    const metadata = JSON.parse(await readFile(installedManifest, 'utf8'))
    await writeFile(
      installedManifest,
      JSON.stringify({ ...metadata, version: '2.0.0' }),
    )
    expect((await manager.active(root)).devtools).toHaveLength(1)
    await writeFile(join(directory, 'outside.js'), 'secret')
    await symlink(
      join(directory, 'outside.js'),
      join(root, 'node_modules', descriptor.name, 'escape.js'),
    )
    await expect(
      packageFile(join(root, 'node_modules', descriptor.name), './escape.js'),
    ).rejects.toThrow('超出包目录')
    manager.setProject(join(directory, 'other'))
    await expect(manager.marketplace(root)).rejects.toThrow('项目已切换')
    expect((await manager.resource(descriptor.url)).status).toBe(404)
  }, 60000)

  it('isolates broken enabled entrypoints and preserves useful project discovery', async () => {
    const { root, manager } = await fixture()
    await manager.install(root, 'qua-fixture-devtools', '1.0.0')
    await rm(join(root, 'node_modules/qua-fixture-devtools/dist/editor.js'))
    expect((await manager.active(root)).devtools).toEqual([])
    expect(
      (await manager.marketplace(root)).installed.find(
        item => item.name === 'qua-fixture-devtools',
      )?.error,
    ).toBeTruthy()
  }, 30000)

  it('rejects invalid catalogs and identities before installation', async () => {
    expect(() => catalogUrl('http://example.com/catalog.json')).toThrow(
      'HTTPS',
    )
    expect(() =>
      catalogEntries({
        schemaVersion: 1,
        plugins: [{ name: 'a' }, { name: 'a' }],
      }),
    ).toThrow('重复')
    const registry = new PluginRegistry(async () => ({
      name: 'wrong',
      version: '1.0.0',
    }))
    await expect(registry.details('qua-plugin')).rejects.toThrow('标识不匹配')
    const other = new PluginRegistry(async () => ({
      name: 'qua-plugin',
      version: '1.0.0',
      quajs: {
        extension: {
          schemaVersion: 1,
          id: 'plugin',
          title: 'Plugin',
          devtools: { apiVersion: 9, entry: './editor.js' },
        },
      },
      dist: { integrity: 'sha512-AAAA' },
    }))
    expect((await other.details('qua-plugin')).installable).toBe(false)
    expect(() =>
      installArguments(
        'npm',
        '--global',
        '1.0.0',
        true,
        'https://registry.npmjs.org',
      ),
    ).toThrow()
  })

  it('detects pnpm workspaces and keeps install arguments exact without bypassing trust checks', async () => {
    const { directory, root } = await fixture()
    await writeFile(join(root, 'package.json'), '{}')
    await writeFile(join(directory, 'pnpm-lock.yaml'), '')
    expect(await packageManager(root)).toBe('pnpm')
    expect(
      installArguments(
        'pnpm',
        '@acme/qua-plugin',
        '1.2.3',
        false,
        'https://registry.npmjs.org',
      ),
    ).toEqual([
      'add',
      '--save-exact',
      '--ignore-scripts',
      '--save-prod',
      '--registry=https://registry.npmjs.org/',
      '--@acme:registry=https://registry.npmjs.org/',
      '@acme/qua-plugin@1.2.3',
    ])
  })
})
