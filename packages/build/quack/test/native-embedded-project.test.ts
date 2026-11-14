import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildQuaProjectEmbeddedModule } from '../src/project-embedded'

const run = promisify(execFile)
describe.skipIf(process.platform !== 'darwin')('native library delivery', () => {
  it('exports a pinned C ABI module and runs a separate Cocoa/Metal parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-native-library-'))
    try {
      await symlink(resolve(import.meta.dirname, '../../../../demo/node_modules'), join(root, 'node_modules'), 'dir')
      await mkdir(join(root, 'assets/images'), { recursive: true })
      await sharp({ create: { width: 8, height: 8, channels: 4, background: '#246a91' } }).png().toFile(join(root, 'assets/images/pixel.png'))
      // Exceed a bulk-transfer chunk: validates actual byte assembly and streaming SHA-256.
      await sharp(randomBytes(256 * 256 * 4), { raw: { width: 256, height: 256, channels: 4 } }).png().toFile(join(root, 'assets/images/noise.png'))
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'native-library-fixture', type: 'module' }))
      await writeFile(join(root, 'entry.js'), `import {QuaEngine} from '@quajs/engine';
export async function bootstrap(services){
 const engine=QuaEngine.getInstance({assets:{adapter:services.adapter,provider:services.assets.getProvider(),enableCache:false},store:{storage:services.store},project:services.project,trustPolicy:services.trustPolicy,runtimeModuleLoader:services.runtimeModuleLoader});
 await engine.init();await engine.showDialogue({text:'Native library in a parent application',visible:true});
 return {engine,async destroy(){await engine.destroy();},async beforeEmbeddedResult(outcome){if(services.embedding.parameters.failPersistence)throw new Error('fixture persistence failed');if(outcome.status==='completed')await this.engine.saveToSlot('embedded-native',{}, {preview:{mode:'disabled'}});},async onEmbeddedOpen(context){if(context.parameters.wait)return;if(context.parameters.awaitAdvance)await engine.waitFor('user/advance');const before=await services.host.readStorage('fixture-probe');const prior=before?Number(new TextDecoder().decode(before)):0;await services.host.writeStorage('fixture-probe',new TextEncoder().encode(String(prior+1)));await context.complete({quest:context.parameters.quest,prior,unicode:'存档完成 🌙'});}};
}`)
      await writeFile(join(root, 'quack.workspace.json'), JSON.stringify({ name: 'fixture', version: '0.1.0', bundles: [{ name: 'main', source: './assets', format: 'qpk' }], output: './dist/assets' }))
      await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Native library fixture', bundleId: 'dev.quajs.native.library.fixture', version: '0.1.0', icons: { source: 'assets/images/pixel.png' }, targets: { web: false, native: { enabled: true, platforms: ['macos'], profiles: ['release'], build: { embeddedEntry: 'entry.js', cargoManifest: resolve(import.meta.dirname, '../../../native/Cargo.toml') } } } }))
      const result = await buildQuaProjectEmbeddedModule({ cwd: root, target: 'native' })
      const manifest = JSON.parse(await readFile(result.manifest, 'utf8'))
      expect(manifest.targetCoreResolver).toBe('native-core-resolver')
      expect(manifest.dependencies).toContain('@quajs/engine-native')
      const moduleBytes = await readFile(result.module)
      const module = JSON.parse(moduleBytes.toString())
      for (const file of module.files)
        expect(createHash('sha256').update(await readFile(join(result.artifact, file.path))).digest('hex')).toBe(file.sha256)
      expect(module.files.some((file: any) => /\.app\/|native-app\.json|ProjectSettings|package\.json$/.test(file.path))).toBe(false)
      const pin = createHash('sha256').update(moduleBytes).digest('hex')
      const executable = join(root, 'protocol')
      await run('clang', [join(result.artifact, 'examples/protocol.c'), '-I', join(result.artifact, 'include'), '-L', join(result.artifact, 'lib'), '-lquajs_native', `-Wl,-rpath,${join(result.artifact, 'lib')}`, '-o', executable])
      for (const [mode, parameters, status, prior] of [
        ['test', { quest: 42 }, 'completed', 0],
        ['test', { quest: 43 }, 'completed', 1],
        ['advance', { quest: 47, awaitAdvance: true }, 'completed', 2],
        ['cancel', { wait: true }, 'cancelled'],
        ['close-before-ready', { wait: true }, 'cancelled'],
        ['test', { failPersistence: true, quest: 44 }, 'error'],
      ] as const) {
        const output = await run(executable, [result.artifact, pin, join(root, 'storage'), JSON.stringify(parameters), mode], { timeout: 30000, maxBuffer: 1024 * 1024 })
        expect(output.stdout).toContain('QUA_NATIVE_PARENT_OK')
        const messages = output.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
        expect(messages.filter(message => message.type === 'result')).toHaveLength(1)
        expect(messages.find(message => message.type === 'result').outcome.status, output.stdout).toBe(status)
        expect(messages.at(-1).type).toBe('closed')
        if (prior !== undefined) {
          expect(messages.find(message => message.type === 'result').outcome.value.prior).toBe(prior)
          expect(messages.find(message => message.type === 'result').outcome.value.unicode).toBe('存档完成 🌙')
        }
      }
      const otherAccount = await run(executable, [result.artifact, pin, join(root, 'storage'), '{"quest":46}', 'test', 'other-account'])
      expect(otherAccount.stdout).toContain('"prior":0')
      await expect(run(executable, [result.artifact, '0'.repeat(64), join(root, 'storage'), '{}', 'test'])).rejects.toMatchObject({ code: 1 })
      const runtime = await readFile(join(result.artifact, 'runtime.mjs'))
      await writeFile(join(result.artifact, 'runtime.mjs'), Buffer.concat([runtime, Buffer.from('\n')]))
      await expect(run(executable, [result.artifact, pin, join(root, 'storage'), '{}', 'test'])).rejects.toMatchObject({ code: 1 })
      await writeFile(join(result.artifact, 'runtime.mjs'), runtime)
      if (process.env.QUA_NATIVE_VISUAL_SMOKE === '1') {
        const parent = join(root, 'parent')
        await run('clang', ['-fobjc-arc', join(result.artifact, 'examples/macos-parent.m'), '-I', join(result.artifact, 'include'), '-L', join(result.artifact, 'lib'), '-lquajs_native', '-framework', 'Cocoa', '-framework', 'QuartzCore', `-Wl,-rpath,${join(result.artifact, 'lib')}`, '-o', parent])
        for (const [mode, parameters] of [['cancel', { wait: true }], ['test', { quest: 45 }], ['advance', { quest: 48, awaitAdvance: true }], ['pointer', { quest: 49, awaitAdvance: true }], ['close-before-ready', { wait: true }]] as const) {
          const output = await run(parent, [result.artifact, pin, join(root, 'visual-storage'), JSON.stringify(parameters), mode], { timeout: 30000 }).catch((error) => {
            throw new Error(`${error.message}\n${error.stdout}\n${error.stderr}`)
          })
          expect(output.stdout).toContain('QUA_NATIVE_PARENT_OK')
        }
      }
    }
    finally {
      if (process.env.QUA_KEEP_EMBEDDED_FIXTURE === '1') {
        await mkdir(resolve(import.meta.dirname, '../../../../.local'), { recursive: true })
        await writeFile(resolve(import.meta.dirname, '../../../../.local/native-library-fixture-root.txt'), root)
        process.stdout.write(`NATIVE_LIBRARY_FIXTURE_ROOT=${root}\n`)
      }
      else { await rm(root, { recursive: true, force: true }) }
    }
  }, 600000)
})
