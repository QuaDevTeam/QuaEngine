import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTargetBundleNativeRendererInfo, createTargetBundleNativeRuntimeInfo, NATIVE_TARGET_BOOTSTRAP } from '@quajs/native-contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { buildQuaProjectProduction } from '../src/production/build'
import * as processTools from '../src/production/process'
import * as vite from '../src/production/vite'

vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), platform: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

it.each([['win32', 'windows', 'game.exe'], ['linux', 'linux', 'game']] as const)('stages a relocatable pinned desktop release on %s', async (host, target, executable) => {
  vi.mocked(platform).mockReturnValue(host)
  const root = await mkdtemp(join(tmpdir(), 'qua-desktop-release-'))
  try {
    const compilerOutput = join(root, 'runtime')
    await mkdir(join(root, 'assets/scripts'), { recursive: true })
    await writeFile(join(root, 'assets/scripts/main.mjs'), 'export default 1')
    await writeFile(join(root, 'icon.png'), 'project icon')
    await writeFile(join(root, 'quack.workspace.json'), JSON.stringify({ name: 'test', version: '1.0.0', bundles: [{ name: 'main', source: 'assets', format: 'qpk' }] }))
    await writeFile(join(root, 'qua.project.json'), JSON.stringify({
      schemaVersion: 1,
      name: 'CON',
      version: '1.0.0',
      bundleId: 'dev.qua.demo',
      icons: { source: 'icon.png' },
      targets: { native: { platforms: [target], profiles: ['release'], build: { cargoManifest: 'Cargo.toml', viteConfig: 'vite.ts', appAsset: 'assets/scripts/main.mjs', cargoFeatures: ['native-window', 'javascriptcore'] } } },
    }))
    vi.spyOn(vite, 'buildProductionVite').mockImplementation(async (_root, _config, _out, graph) => {
      await writeFile(graph, JSON.stringify(NATIVE_TARGET_BOOTSTRAP.coreAdapters))
    })
    const version = '1.0.0'
    vi.spyOn(processTools, 'buildRunner').mockReturnValue(async (command, _args, env) => {
      if (command === compilerOutput) {
        const capabilities = [{
          id: 'native-wgpu.ui.surface@1',
          version,
          target: 'native',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['view.ui.overlays'],
          quiComponents: ['Box'],
          qssFeatures: [],
          fallback: 'reject-package',
        }] as const
        const renderer = createTargetBundleNativeRendererInfo({ version, backendVersion: 'test', capabilities }, input => digest(Buffer.from(input)))
        const runtime = createTargetBundleNativeRuntimeInfo({ jscVersion: version, nativeRuntimeVersion: version, assetAdapterVersion: version, storeAdapterVersion: version })
        return JSON.stringify({ renderer: { ...renderer, capabilities }, runtime })
      }
      expect(command).toBe('cargo')
      await writeFile(compilerOutput, env?.QUA_NATIVE_DISTRIBUTION_SHA256 ?? 'descriptor probe')
      return JSON.stringify({ reason: 'compiler-artifact', target: { name: 'quajs_native_app' }, executable: compilerOutput })
    })

    const result = await buildQuaProjectProduction({ cwd: root, target: 'native' })
    const moved = join(root, 'moved')
    await rename(result.artifact, moved)
    const resources = join(moved, 'resources')
    const startup = await readFile(join(resources, 'native-app.json'))
    const launch = JSON.parse(startup.toString())
    expect(await readFile(join(moved, executable), 'utf8')).toBe(digest(startup))
    const manifest = await readFile(join(resources, 'target-bundle-manifest.json'))
    expect(launch.targetManifestSha256).toBe(digest(manifest))
    expect(launch.bundles[0].sha256).toBe(digest(await readFile(join(resources, launch.bundles[0].file))))
    expect(JSON.parse(manifest.toString())).toMatchObject({ platform: target, app: { icon: 'icons/icon.png' } })
    expect(await readFile(join(resources, 'icons/icon.png'), 'utf8')).toBe('project icon')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
