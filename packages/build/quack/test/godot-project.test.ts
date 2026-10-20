import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertGodotOutputPath, buildQuaProjectGodotWorkspace } from '../src/project-godot'
import { normalizeGodotTarget } from '../src/project-godot-config'
import { assertStandaloneRuntimeCode } from '../src/standalone-runtime-validation'
import { assertQuackPluginReferencesTargetIsolation } from '../src/target-plugin-isolation'

describe('godot project packaging', () => {
  it('normalizes a portable desktop target and rejects incompatible configuration', () => {
    const issues: string[] = []
    expect(normalizeGodotTarget({ build: { entry: 'src/targets/godot/main.ts' } }, issues)).toEqual({ enabled: true, projectDir: 'dist/godot/workspace', layout: 'landscape', assetTarget: undefined, build: { entry: 'src/targets/godot/main.ts', viteConfig: undefined, profile: 'debug' } })
    expect(issues).toEqual([])
    normalizeGodotTarget({ enabled: 'yes', layout: 'fill', build: { profile: 'web' }, assetTarget: { platform: 'cocos', cocos: { hybrid: { enabled: true } } } }, issues)
    expect(issues).toHaveLength(6)
  })

  it('protects source aliases and authored projects before running asset or native builds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-godot-path-'))
    try {
      await symlink(root, join(root, 'alias'), 'dir')
      await expect(assertGodotOutputPath(root, join(root, 'alias'))).rejects.toThrow('symbolic link')
      await expect(assertGodotOutputPath(root, join(root, 'alias/sub/..'))).rejects.toThrow()
      await expect(assertGodotOutputPath(root, root)).rejects.toThrow('source directories')
      await expect(assertGodotOutputPath(root, join(root, 'dist/godot'))).resolves.toBeUndefined()
      await mkdir(join(root, 'authored'))
      await writeFile(join(root, 'authored/project.godot'), 'authored')
      await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Fixture', bundleId: 'dev.quajs.fixture', version: '0.1.0', targets: { web: { enabled: false }, godot: { projectDir: 'authored', build: { entry: 'game.ts' } } } }))
      await expect(buildQuaProjectGodotWorkspace({ cwd: root })).rejects.toThrow('authored project')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects target core subentries in ordinary plugins symmetrically', () => {
    for (const target of ['web', 'cocos', 'native', 'godot'] as const) {
      for (const root of ['@quajs/godot-host/store', '@quajs/renderer-godot/plugins/ui', '@quajs/renderer-web/audio', '@quajs/cocos-host/runtime', '@quajs/engine-native']) {
        expect(() => assertQuackPluginReferencesTargetIsolation([{ specifier: 'feature', packageName: root }], { target })).toThrow('target core adapters')
      }
    }
    expect(() => assertStandaloneRuntimeCode('window.alert("bad")', 'Godot')).toThrow('Godot runtime retained browser global')
    expect(() => assertStandaloneRuntimeCode('function local(window) { return window }', 'Godot')).not.toThrow()
  })

  it('preserves the last generated project and removes staging after failure or cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-godot-atomic-'))
    try {
      const destination = join(root, 'generated')
      await mkdir(destination)
      await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Fixture', bundleId: 'dev.quajs.fixture', version: '0.1.0', targets: { web: { enabled: false }, godot: { projectDir: 'generated', build: { entry: 'game.ts' } } } }))
      await writeFile(join(destination, '.qua-generated.json'), JSON.stringify({ schemaVersion: 1, target: 'godot', bundleId: 'dev.quajs.fixture' }))
      await writeFile(join(destination, 'project.godot'), 'last working project')
      // Missing workspace configuration must retain the previous successful output.
      await expect(buildQuaProjectGodotWorkspace({ cwd: root })).rejects.toThrow('No workspace configuration')
      const abort = new AbortController()
      abort.abort(new Error('cancel fixture'))
      await expect(buildQuaProjectGodotWorkspace({ cwd: root, signal: abort.signal })).rejects.toThrow('cancel fixture')
      expect(await readFile(join(destination, 'project.godot'), 'utf8')).toBe('last working project')
      expect((await readdir(root)).filter(name => name.startsWith('generated.'))).toEqual([])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })
})
