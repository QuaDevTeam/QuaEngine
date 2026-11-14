import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildQuaProjectEmbeddedModule } from '../src/project-embedded'

const run = promisify(execFile)
const keepFixture = process.env.QUA_KEEP_EMBEDDED_FIXTURE === '1'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'qua-embedded-'))
  await symlink(resolve(import.meta.dirname, '../../../../demo/node_modules'), join(root, 'node_modules'), 'dir')
  await mkdir(join(root, 'assets/images'), { recursive: true })
  await sharp({ create: { width: 2, height: 2, channels: 4, background: '#55aa77' } }).png().toFile(join(root, 'assets/images/pixel.png'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'embedded-fixture', type: 'module' }))
  await writeFile(join(root, 'entry.js'), `import {QuaEngine} from '@quajs/engine';
export async function bootstrap(services){
 const engine=QuaEngine.getInstance({assets:{adapter:services.adapter,provider:services.assets.getProvider(),enableCache:false},store:{storage:services.store},project:services.project,trustPolicy:services.trustPolicy,runtimeModuleLoader:services.runtimeModuleLoader});
 await engine.init();await engine.showDialogue({text:'Unity fixture',visible:true});
 return {engine,async destroy(){await engine.destroy();},async beforeEmbeddedResult(outcome){if(services.embedding.parameters.hangPersistence)await new Promise(()=>{});if(services.embedding.parameters.failPersistence)throw new Error('fixture persistence failed');if(outcome.status==='completed')await this.engine.saveToSlot('embedded-fixture',{}, {preview:{mode:'disabled'}});},async onEmbeddedOpen(context){if(context.parameters.wait)return;await context.complete({quest:context.parameters.quest});}};
}`)
  await writeFile(join(root, 'entry-web.js'), 'import \'./story.css\';export {bootstrap} from \'./entry.js\';')
  await writeFile(join(root, 'story.css'), '.qua-dialogue-box{position:absolute;left:120px;top:700px;width:1680px;height:200px;color:white;font-size:42px}')
  await writeFile(join(root, 'quack.workspace.json'), JSON.stringify({ name: 'fixture', version: '0.1.0', bundles: [{ name: 'main', source: './assets', format: 'qpk' }], output: './dist/assets' }))
  await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Embedded fixture', bundleId: 'dev.quajs.embedded.fixture', version: '0.1.0', icons: { source: 'assets/images/pixel.png' }, targets: { web: { build: { embeddedEntry: 'entry-web.js', embeddedOrigins: ['http://127.0.0.1:4189'] } }, cocos: { enabled: true, platforms: ['web-desktop'], creatorVersion: '3.8.8', build: { entry: 'entry.js' } }, godot: { build: { entry: 'entry.js' } }, unity: { build: { entry: 'entry.js' } } } }))
  return root
}
describe('embedded module delivery', () => {
  it('delivers four single-target modules with hashes, no application shell and a real native business-result consumer', async () => {
    const root = await fixture()
    try {
      for (const target of ['web', 'godot', 'cocos', 'unity'] as const) {
        const result = await buildQuaProjectEmbeddedModule({ cwd: root, target })
        const module = JSON.parse(await readFile(result.module, 'utf8'))
        expect(module.target).toBe(target)
        expect(module.protocol.commands).toEqual(['open', 'cancel'])
        const manifest = JSON.parse(await readFile(result.manifest, 'utf8'))
        expect(manifest.target).toBe(target)
        expect(manifest.targetCoreResolver).toBe(`${target}-core-resolver`)
        for (const file of module.files) {
          expect(file.path).not.toMatch(/\.workspace|\.build-|\.previous-/)
          expect(createHash('sha256').update(await readFile(join(result.artifact, file.path))).digest('hex')).toBe(file.sha256)
        }
        expect(await readdir(result.artifact)).not.toContain('.workspace')
        if (target === 'godot') {
          expect(module.entry.scene).toMatch(/^res:\/\/qua_modules\//)
          expect(await readFile(join(result.artifact, 'export-filter.txt'), 'utf8')).toContain('/content/qua/*')
          expect(module.files.some((file: any) => file.path.endsWith('/project.godot'))).toBe(false)
        }
        if (target === 'cocos') {
          expect(module.files.some((file: any) => file.path.endsWith('QuaBootstrap.ts') || file.path.endsWith('Game.cpp'))).toBe(false)
          expect(await readFile(join(result.artifact, 'project-files/assets/qua-runtime/runtime.js'), 'utf8')).toContain('Embedded Creator modules require an open request')
        }
        if (target === 'unity') {
          expect(module.files.some((file: any) => file.path.includes('ProjectSettings') || file.path.endsWith('GeneratedProject.cs'))).toBe(false)
          const content = join(result.artifact, module.entry.package, 'Runtime/Resources', module.entry.contentPrefix)
          const native = await run('cargo', ['run', '--locked', '--manifest-path', resolve(import.meta.dirname, '../../../platform/unity-host/runtime/Cargo.toml'), '--example', 'protocol-smoke', '--', join(content, 'qua/runtime.js.txt'), content, '--embedded'], { timeout: 90000, maxBuffer: 1024 * 1024 })
          expect(native.stdout).toContain('QUA_UNITY_PROTOCOL_SMOKE_OK')
        }
        if (target === 'web') {
          expect(await readFile(join(result.artifact, 'client.js'), 'utf8')).toContain('mountEmbeddedFrame')
          expect(await readFile(join(result.artifact, 'runtime.js'), 'utf8')).not.toContain(root)
        }
      }
    }
    finally {
      if (keepFixture) {
        const marker = resolve(import.meta.dirname, '../../../../.local/embedded-fixture-root.txt')
        await mkdir(resolve(import.meta.dirname, '../../../../.local'), { recursive: true })
        await writeFile(marker, root)
        process.stdout.write(`EMBEDDED_FIXTURE_ROOT=${root}\n`)
      }
      else {
        await rm(root, { recursive: true, force: true })
      }
    }
  }, 180000)
})
