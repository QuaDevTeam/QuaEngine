import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { assertCocosRuntimeCode, buildQuaProjectCocosWorkspace, protectCocosIterableSpreads } from '../src/project-cocos'
import { readQpkSummary } from '../src/qpk-reader'

describe('creator artifact contracts', () => {
  it('preserves Map, Set, strings, generators and call spreads before Creator loose transpilation', () => {
    const code = `const values = [...new Map([['a',1]]).values()]; const set = [...new Set([2,3])]; const text = [...'你好']; function* g(){yield 4;yield 5} const result = Math.max(...g()); const nested = [...[...new Set([6])]]; const object = {...{x: 1}}; return {values,set,text,result,nested,object}`
    const transformed = protectCocosIterableSpreads(`function run(){${code}}`)
    // Creator loose spread uses concat/apply; all their operands now are real arrays.
    const value = runInNewContext(`${transformed}; run()`)
    expect(value).toEqual({ values: [1], set: [2, 3], text: ['你', '好'], result: 5, nested: [6], object: { x: 1 } })
    expect(transformed).toContain('Math.max(...Array.from(g()))')
    expect(transformed).toContain('const object = {...{x: 1}}')
  })

  it('rejects browser globals in the retained artifact while accepting locally bound names', () => {
    expect(() => assertCocosRuntimeCode('export const x = document.createElement("div")')).toThrow('browser global document')
    expect(() => assertCocosRuntimeCode('export const x = new Blob([])')).toThrow('browser global Blob')
    expect(() => assertCocosRuntimeCode('export const x = globalThis.document')).toThrow('browser global document')
    expect(() => assertCocosRuntimeCode('export const x = new Worker("x")')).toThrow('browser global Worker')
    expect(() => assertCocosRuntimeCode('export function x(document) { return document }')).not.toThrow()
  })

  it('generates portable Creator files, retains structural QPK content and preserves the old workspace on a failed rebuild', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-cocos-generator-'))
    try {
      await symlink(resolve(import.meta.dirname, '../../../../demo/node_modules'), join(root, 'node_modules'), 'dir')
      await mkdir(join(root, 'assets/images'), { recursive: true })
      const pixels = Buffer.from([1, 23, 254, 17])
      await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(join(root, 'assets/images/hero.webp'))
      await writeFile(join(root, 'assets/images/catalog.json'), '{"entry":"hero.webp"}')
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
      await writeFile(join(root, 'entry.js'), 'export async function bootstrap() { return {} }')
      await writeFile(join(root, 'quack.workspace.json'), JSON.stringify({ name: 'fixture', version: '0.1.0', bundles: [{ name: 'main', source: './assets', format: 'qpk' }], output: './dist/assets' }))
      const config = { schemaVersion: 1, name: 'Fixture', bundleId: 'dev.quajs.fixture', version: '0.1.0', targets: { web: { enabled: false }, cocos: { enabled: true, creatorVersion: '3.8.8', projectDir: 'workspace', platforms: ['web-desktop', 'mac'], build: { entry: 'entry.js' }, assetTarget: { name: 'cocos-fixture', platform: 'cocos', pipeline: { images: { format: 'png', rewriteExtension: false, optimize: false } }, cocos: { hybrid: { enabled: true, resourceRoot: 'assets', assetBundle: 'resources', domains: { images: 'cocos-bundle' } } } } } } }
      await writeFile(join(root, 'qua.project.json'), JSON.stringify(config))
      const built = await buildQuaProjectCocosWorkspace({ cwd: root })
      const projectIdentity = JSON.parse(await readFile(join(built.artifact, 'package.json'), 'utf8')).uuid
      expect(projectIdentity).toMatch(/^[0-9a-f-]{36}$/)
      const manifest = JSON.parse(await readFile(built.manifest, 'utf8'))
      expect(manifest.targetCoreResolver).toBe('cocos-core-resolver')
      expect(manifest.dependencies).not.toContain('@quajs/assets-web')
      const code = await readFile(join(built.artifact, 'assets/qua-runtime/runtime.js'), 'utf8')
      expect(code).not.toContain(root)
      expect(code).not.toContain('localhost:5173')
      const previewShell = await readFile(join(built.artifact, 'build-templates/web-desktop/index.js.ejs'), 'utf8')
      expect(previewShell).toContain('overrideSettings(\'screen\', \'exactFitScreen\', true)')
      expect(previewShell).toContain('ENABLE_TRANSPARENT_CANVAS: true')
      const previewHtml = await readFile(join(built.artifact, 'build-templates/web-desktop/index.ejs'), 'utf8')
      expect(previewHtml).toContain('#Cocos3dGameContainer{position:relative;isolation:isolate}')
      expect(previewShell).not.toContain('@quajs/')
      const nativeShell = await readFile(join(built.artifact, 'native/engine/common/Classes/Game.cpp'), 'utf8')
      expect(nativeShell).toContain('cc::BasePlatform::getPlatform()->exit()')
      expect(nativeShell).toContain('void Game::close()')
      expect(nativeShell).toContain('"127.0.0.1"')
      expect(nativeShell).toContain('addRegisterCallback(registerQuaCreatorVideo)')
      expect(nativeShell).toContain('addRegisterCallback(registerQuaCreatorAudio)')
      const nativeAudio = await readFile(join(built.artifact, 'native/engine/common/Classes/QuaCreatorAudio.mm'), 'utf8')
      expect(nativeAudio).toContain('AVAudioSourceNode')
      expect(nativeAudio).toContain('decodedBytes+bytes>maxBytes')
      expect(nativeAudio).not.toContain(root)
      const nativeVideo = await readFile(join(built.artifact, 'native/engine/common/Classes/QuaCreatorVideo.mm'), 'utf8')
      expect(nativeVideo).toContain('AVPlayerItemVideoOutput')
      expect(nativeVideo).not.toContain(root)
      const localConfig = await readFile(join(built.artifact, 'native/engine/common/localCfg.cmake'), 'utf8')
      expect(localConfig).toContain('CMAKE_CURRENT_LIST_DIR')
      expect(localConfig).toContain('/Classes/QuaCreatorVideo.mm')
      expect(localConfig).toContain('/Classes/QuaCreatorAudio.mm')
      expect(localConfig).toContain('-framework AVFoundation')
      const bootstrap = await readFile(join(built.artifact, 'assets/qua-runtime/QuaBootstrap.ts'), 'utf8')
      const scene = JSON.parse(await readFile(join(built.artifact, 'assets/main.scene'), 'utf8'))
      expect(bootstrap).toContain(`@ccclass('${scene[5].__type__}')`)
      const graph = JSON.parse(await readFile(join(built.artifact, 'retained-module-graph.json'), 'utf8'))
      expect(graph.modules.some((module: { specifier: string }) => module.specifier.startsWith('@quajs/renderer-cocos/dist/'))).toBe(true)
      const summary = await readQpkSummary(join(built.artifact, 'assets/resources/qua/main.binary'))
      const opaqueMeta = JSON.parse(await readFile(join(built.artifact, 'assets/resources/qua/main.binary.meta'), 'utf8'))
      const importMetadata = JSON.parse(await readFile(join(built.artifact, 'qua-import-meta.json'), 'utf8'))
      expect(importMetadata.schemaVersion).toBe(1)
      expect(importMetadata.files['assets/main.scene.meta'].importer).toBe('scene')
      expect(importMetadata.files['assets/resources/qua/main.binary.meta']).toEqual(opaqueMeta)
      expect(opaqueMeta.importer).toBe('*')
      const engineProfile = JSON.parse(await readFile(join(built.artifact, 'settings/v2/packages/engine.json'), 'utf8'))
      expect(engineProfile.__version__).toBe('1.0.12')
      expect(engineProfile.modules.configs.defaultConfig.includeModules).toContain('custom-pipeline')
      expect(engineProfile.modules.configs.defaultConfig.includeModules).toContain('video')
      expect(engineProfile.modules.configs.defaultConfig.cache['custom-pipeline']._value).toBe(true)
      expect(engineProfile.modules.configs.defaultConfig.cache.profiler._value).toBe(false)
      const creatorBuild = JSON.parse(await readFile(join(built.artifact, 'qua-build/web-desktop.build.json'), 'utf8'))
      expect(creatorBuild.customPipeline).toBe(true)
      expect(summary.errors).toEqual([])
      const images = Object.values(summary.manifest!.assets.images!) as { name: string, path: string }[]
      expect(images.find(image => image.name === 'catalog.json')?.path).not.toMatch(/^\//)
      const nativeDir = join(built.artifact, 'assets/resources/images')
      const files = await readdir(nativeDir)
      expect(files).toContain('hero.png')
      expect(files).not.toContain('catalog.json')
      expect(await sharp(join(nativeDir, 'hero.png')).raw().toBuffer()).toEqual(pixels)
      await buildQuaProjectCocosWorkspace({ cwd: root })
      expect(JSON.parse(await readFile(join(built.artifact, 'package.json'), 'utf8')).uuid).toBe(projectIdentity)
      await writeFile(join(built.artifact, 'keep.txt'), 'previous usable workspace')
      config.targets.cocos.build.entry = 'missing.js'
      await writeFile(join(root, 'qua.project.json'), JSON.stringify(config))
      await expect(buildQuaProjectCocosWorkspace({ cwd: root })).rejects.toThrow()
      expect(await readFile(join(built.artifact, 'keep.txt'), 'utf8')).toBe('previous usable workspace')
      expect((await readdir(root)).filter(name => name.startsWith('workspace.build-') || name.startsWith('workspace.previous-'))).toEqual([])
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
