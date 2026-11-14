import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { validateOrdinaryPluginListTargetIsolation, validateTargetBootstrap } from '@quajs/native-contracts'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { generateProjectAtomically } from '../src/generated-project'
import { normalizeQuaProjectConfig } from '../src/project'
import { createQuaHostCompatibility } from '../src/project-host-compatibility'
import { buildQuaProjectUnityWorkspace } from '../src/project-unity'

describe('unity target', () => {
  it('declares an exact Editor version in the supported LTS series and reports every inactive core', () => {
    const base = { schemaVersion: 1, name: 'Fixture', bundleId: 'dev.quajs.fixture', version: '0.1.0', icons: { source: 'icon.png' } }
    const config = normalizeQuaProjectConfig({ ...base, targets: { unity: { build: { entry: 'game.ts' } } } })
    expect(config.targets.unity?.editorVersion).toBe('6000.3.28f1')
    for (const editorVersion of ['2022.3.40f1', '6000.4.0f1', '6000.3.0b1', '../6000.3.28f1'])
      expect(() => normalizeQuaProjectConfig({ ...base, targets: { unity: { editorVersion, build: { entry: 'game.ts' } } } })).toThrow('stable Unity 6.3 LTS')
    const cores = { web: ['@quajs/assets-web', '@quajs/renderer-web'], cocos: ['@quajs/cocos-host', '@quajs/assets-cocos', '@quajs/renderer-cocos'], godot: ['@quajs/godot-host', '@quajs/renderer-godot'], unity: ['@quajs/unity-host', '@quajs/renderer-unity'], native: ['@quajs/engine-native', '@quajs/assets-native', '@quajs/store-native', '@quajs/native-contracts'] } as const
    for (const [target, active] of Object.entries(cores)) {
      for (const [other, inactive] of Object.entries(cores)) {
        if (other === target)
          continue
        const result = validateTargetBootstrap(target as keyof typeof cores, [...active, `${inactive[0]}/subentry`])
        expect(result.ok).toBe(false)
        expect(result.forbidden).toContain(inactive[0])
      }
    }
    expect(validateOrdinaryPluginListTargetIsolation(['@quajs/unity-host/assets']).ok).toBe(false)
    expect(createQuaHostCompatibility('unity', '6000.3.28f1').sdkRuntimeValidation).toBe('required-on-consumer-host')
  })

  it('protects authored projects, source aliases, failed rebuilds and cancelled generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-unity-atomic-'))
    try {
      await symlink(root, join(root, 'alias'), 'dir')
      const build = async (stage: string) => {
        await writeFile(join(stage, 'partial'), 'partial')
        throw new Error('fixture failure')
      }
      await expect(generateProjectAtomically({ root, destination: join(root, 'alias'), target: 'unity', bundleId: 'dev.quajs.fixture', build })).rejects.toThrow('symbolic link')
      const destination = join(root, 'generated')
      await mkdir(destination)
      await writeFile(join(destination, 'authored.unity'), 'author work')
      await expect(generateProjectAtomically({ root, destination, target: 'unity', bundleId: 'dev.quajs.fixture', build })).rejects.toThrow('authored project')
      await writeFile(join(destination, '.qua-generated.json'), JSON.stringify({ schemaVersion: 1, target: 'unity', bundleId: 'dev.quajs.fixture' }))
      await expect(generateProjectAtomically({ root, destination, target: 'unity', bundleId: 'dev.quajs.fixture', build })).rejects.toThrow('fixture failure')
      const controller = new AbortController()
      controller.abort(new Error('fixture cancellation'))
      await expect(generateProjectAtomically({ root, destination, target: 'unity', bundleId: 'dev.quajs.fixture', signal: controller.signal, build })).rejects.toThrow('fixture cancellation')
      expect(await readFile(join(destination, 'authored.unity'), 'utf8')).toBe('author work')
      expect((await readdir(root)).filter(name => name.startsWith('generated.'))).toEqual([])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('generates a portable Unity project, native plugin and scoped UPM package with exact QPK identities', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-unity-project-'))
    try {
      await symlink(resolve(import.meta.dirname, '../../../../demo/node_modules'), join(root, 'node_modules'), 'dir')
      await mkdir(join(root, 'assets/images'), { recursive: true })
      await sharp({ create: { width: 2, height: 2, channels: 4, background: '#55aa77' } }).png().toFile(join(root, 'assets/images/pixel.png'))
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
      await writeFile(join(root, 'entry.js'), `import { QuaEngine } from '@quajs/engine';
export async function bootstrap(services) {
  const engine=QuaEngine.getInstance({ assets:{adapter:services.adapter,provider:services.assets.getProvider(),enableCache:false},store:{storage:services.store},project:services.project,trustPolicy:services.trustPolicy,runtimeModuleLoader:services.runtimeModuleLoader });
  await engine.init(); await engine.showDialogue({text:'Unity fixture',visible:true});
  return {engine,async destroy(){await engine.destroy();QuaEngine.resetInstance();}};
}`)
      await writeFile(join(root, 'quack.workspace.json'), JSON.stringify({ name: 'fixture', version: '0.1.0', bundles: [{ name: 'main', source: './assets', format: 'qpk' }], output: './dist/assets' }))
      await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Fixture', bundleId: 'dev.quajs.fixture', version: '0.1.0', targets: { web: { enabled: false }, unity: { projectDir: 'workspace', build: { entry: 'entry.js' } } } }))
      const result = await buildQuaProjectUnityWorkspace({ cwd: root })
      const manifest = JSON.parse(await readFile(result.manifest, 'utf8'))
      expect(manifest.targetCoreResolver).toBe('unity-core-resolver')
      expect(manifest.dependencies).not.toContain('@quajs/godot-host')
      expect(await readFile(join(result.artifact, 'ProjectSettings/ProjectVersion.txt'), 'utf8')).toContain('6000.3.28f1')
      const packageJson = JSON.parse(await readFile(join(result.embeddedPackage, 'package.json'), 'utf8'))
      expect(packageJson.unity).toBe('6000.3')
      const content = join(result.embeddedPackage, 'Runtime/Resources', result.contentPrefix)
      const session = JSON.parse(await readFile(join(content, 'session.json.txt'), 'utf8'))
      expect(session.runtimeHash).toMatch(/^[a-f0-9]{64}$/)
      const script = await readFile(join(content, 'qua/runtime.js.txt'), 'utf8')
      expect(script).toContain('QUA_UNITY_READY')
      expect(script).not.toContain(root)
      expect(script).not.toContain('@quajs/godot-host')
      const native = await promisify(execFile)('cargo', ['run', '--locked', '--manifest-path', resolve(import.meta.dirname, '../../../platform/unity-host/runtime/Cargo.toml'), '--example', 'protocol-smoke', '--', join(content, 'qua/runtime.js.txt'), content], { timeout: 90_000, maxBuffer: 1024 * 1024 })
      expect(native.stdout).toContain('QUA_UNITY_PROTOCOL_SMOKE_OK')
      const binaries = await readdir(join(result.embeddedPackage, 'Runtime/Plugins'))
      expect(binaries).toHaveLength(1)
      expect((await readdir(join(content, 'qua'))).some(name => name.endsWith('.qpk.bytes'))).toBe(true)
      const host = await readFile(join(result.embeddedPackage, 'Runtime/QuaEngineHost.cs'), 'utf8')
      expect(host).not.toContain('Application.Quit(')
      const setup = await readFile(join(result.embeddedPackage, 'Editor/GeneratedProject.cs'), 'utf8')
      expect(setup).toContain('.qua-generated.json')
      const meta = await readFile(join(result.embeddedPackage, 'Runtime/QuaEngineHost.cs.meta'), 'utf8')
      await buildQuaProjectUnityWorkspace({ cwd: root })
      expect(await readFile(join(result.embeddedPackage, 'Runtime/QuaEngineHost.cs.meta'), 'utf8')).toBe(meta)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  }, 120_000)
})
