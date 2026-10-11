import type { TargetBundleManifest } from '@quajs/native-contracts'
import type { NormalizedQuaProjectConfig } from './project'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from '@babel/parser'
import traverseImport from '@babel/traverse'
import { assertTargetBundleManifest, createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from './core/bundler'
import { AssetPipelinePlugin } from './plugins/asset-pipeline'
import { createQuaProjectAssetTargets, loadQuaProjectConfig, syncQuaProjectCocos } from './project'
import { emitQuaTargetBundleManifest } from './project-target-bundle'
import { readQpkSummary } from './qpk-reader'
import { WorkspaceManager } from './workspace/workspace'

export interface QuaCocosWorkspaceBuildOptions {
  cwd: string
  configPath?: string
  workspaceConfig?: string
  signal?: AbortSignal
}
export interface QuaCocosWorkspaceBuildResult {
  target: 'cocos'
  artifact: string
  manifest: string
}

function uuid(name: string) {
  const hex = createHash('sha256').update(`qua-cocos:${name}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** An active-target artifact is built first. The Creator shell only consumes that artifact. */
export async function buildQuaProjectCocosWorkspace(options: QuaCocosWorkspaceBuildOptions): Promise<QuaCocosWorkspaceBuildResult> {
  const root = resolve(options.cwd)
  const project = await loadQuaProjectConfig({ cwd: root, configPath: options.configPath })
  const target = project.targets.cocos
  if (!target?.enabled || !target.build?.entry)
    throw new Error('Cocos workspace generation requires targets.cocos.build.entry.')
  const destination = resolve(root, target.projectDir)
  if (root === destination || root.startsWith(destination + sep))
    throw new Error('Cocos workspace must not replace the project source directory or its parents.')
  let existing: string[] = []
  try {
    existing = await readdir(destination)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
  if (existing.length) {
    let generated = false
    try {
      generated = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).name === 'qua-generated-cocos'
    }
    catch {}
    if (!generated)
      throw new Error('Cocos workspace destination contains an authored project. Choose a separate generated projectDir.')
  }
  const stage = `${destination}.build-${randomUUID()}`
  const backup = `${destination}.previous-${randomUUID()}`
  // Bundle identities are immutable across installed workspace rebuilds.
  const buildNumber = `cocos-${randomUUID()}`
  await mkdir(stage, { recursive: true })
  let replaced = false
  try {
    options.signal?.throwIfAborted()
    const workspace = new WorkspaceManager(root)
    await workspace.loadConfig(options.workspaceConfig, { projectConfig: options.configPath })
    const assetTarget = createQuaProjectAssetTargets(project).find(value => value.platform === 'cocos')!
    const bundles = []
    for (const definition of workspace.getBundlesBuildOrder()) {
      const output = join(stage, `${definition.name}.qpk`)
      const bundler = new QuackBundler(workspace.createBundleConfig(definition.name, {
        output,
        format: 'qpk',
        assetTargets: [],
        assetTarget,
        plugins: [new AssetPipelinePlugin()],
        ignore: ['**/native-app.mjs'],
        compression: { algorithm: 'none' },
        encryption: { enabled: false, algorithm: 'none' },
        versioning: { bundleVersion: 1, buildNumber, incrementVersion: false },
      }))
      await bundler.bundle(definition.name)
      const file = (await readdir(stage)).find(name => name.startsWith(`${definition.name}.`) && name.endsWith('.qpk'))
      if (!file)
        throw new Error(`Missing Cocos QPK: ${definition.name}`)
      const summary = await readQpkSummary(join(stage, file))
      if (!summary.manifest || summary.errors.length)
        throw new Error(`Invalid Cocos QPK: ${definition.name}`)
      const resource = `qua/${definition.name}`
      await mkdir(join(stage, 'assets/resources/qua'), { recursive: true })
      // .bin is Creator's compiled CCON format. QPK is opaque BufferAsset data.
      await rename(join(stage, file), join(stage, `assets/resources/${resource}.binary`))
      bundles.push({ resource, identity: { name: summary.manifest.name, version: summary.manifest.bundleVersion, buildNumber: summary.manifest.buildNumber, target: summary.manifest.assetTarget?.name, hash: createHash('sha256').update(await readFile(join(stage, `assets/resources/${resource}.binary`))).digest('hex') } })
    }
    // Keep source resource identities (.webp) in QPK. Creator imports the actual PNG
    // suffix; its extension-free resource key remains the same.
    await renamePngAssets(join(stage, 'assets'))
    await renameCreatorFonts(join(stage, 'assets'))
    const dependencies = await compileRuntime(root, stage, project, bundles)
    const manifest: TargetBundleManifest = {
      schemaVersion: 1,
      profile: 'debug',
      platform: 'cocos',
      app: { bundleId: project.bundleId, version: project.version, buildNumber },
      ...createTargetCoreSelection('cocos'),
      dependencies,
      projectGraphs: [{ id: 'cocos.workspace.post-bundle', kind: 'post-bundle', references: dependencies }],
    }
    await emitQuaTargetBundleManifest({ artifactDir: stage, expectedTarget: 'cocos', manifest })
    await generateCreatorShell(stage, root, project, manifest)
    options.signal?.throwIfAborted()
    try {
      await rename(destination, backup)
      replaced = true
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
    try {
      await rename(stage, destination)
    }
    catch (error) {
      if (replaced)
        await rename(backup, destination)
      throw error
    }
    if (replaced)
      await rm(backup, { recursive: true, force: true })
    return { target: 'cocos', artifact: destination, manifest: join(destination, 'target-bundle-manifest.json') }
  }
  finally {
    await rm(stage, { recursive: true, force: true })
  }
}

async function compileRuntime(root: string, stage: string, project: NormalizedQuaProjectConfig, bundles: unknown[]): Promise<string[]> {
  const require = createRequire(join(root, 'package.json'))
  const vite = await import(pathToFileURL(require.resolve('vite')).href)
  const dependencies = new Set<string>()
  const retainedModules: { specifier: string, packageName?: string, renderedLength: number }[] = []
  const packageNames = new Map<string, string | undefined>()
  const projectPackageName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
  const packageName = async (id: string): Promise<string | undefined> => {
    let dir = dirname(id.split('?')[0])
    if (!isAbsolute(dir))
      return undefined
    const visited = []
    let name: string | undefined
    while (dir !== dirname(dir)) {
      if (packageNames.has(dir)) {
        name = packageNames.get(dir)
        break
      }
      visited.push(dir)
      try {
        name = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).name
        break
      }
      catch {
        dir = dirname(dir)
      }
    }
    for (const path of visited)
      packageNames.set(path, name)
    return name
  }
  await vite.build({
    root,
    configFile: project.targets.cocos!.build!.viteConfig ? resolve(root, project.targets.cocos!.build!.viteConfig!) : false,
    publicDir: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.SSR': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.VITE_QUA_EDITOR_PREVIEW': '"0"' },
    plugins: [{
      name: 'cocos-core-resolver',
      resolveId(id: string) {
        if (id === 'virtual:cocos-core-resolver')
          return '\0cocos-core-resolver'
      },
      load(id: string) {
        if (id !== '\0cocos-core-resolver')
          return
        return `
import * as cc from 'cc';
import { createCocosCreatorRuntimeHost } from '@quajs/cocos-host/creator-runtime';
import { createCreatorPreviewFileBridge } from '@quajs/cocos-host/creator-preview-storage';
import { createCocosAssets, createCocosAssetsAdapter } from '@quajs/assets-cocos';
import { createCocosStoreStorage } from '@quajs/store-cocos';
import { createCocosStaticOnlyTrustPolicy, createUnsupportedCocosRuntimeModuleLoader } from '@quajs/security-cocos';
import { QuaCocosRendererController, createVisualNovelCocosRendererPlugins } from '@quajs/renderer-cocos';
import { createQuiCocosRendererPlugin } from '@quajs/renderer-cocos/qui';
import { createDialogueCocosRendererPlugin } from '@quajs/renderer-cocos/plugins/dialogue';
import { createChoicesCocosRendererPlugin } from '@quajs/renderer-cocos/plugins/choices';
import { bootstrap } from ${JSON.stringify(resolve(root, project.targets.cocos!.build!.entry))};
export async function start(rootNode) {
  cc.profiler?.hideStats();
  const projectionEffect = await new Promise((resolve, reject) => cc.resources.load('qua/projection', cc.EffectAsset, (error, asset) => error ? reject(error) : resolve(asset)));
  const host = createCocosCreatorRuntimeHost({ cc, rootNode, projectionEffect, namespace: ${JSON.stringify(project.bundleId)}, native: cc.native, audioProcessor: cc.sys.isNative ? globalThis.__quaCreatorAudio : undefined, videoDecoder: cc.sys.isNative ? globalThis.__quaCreatorVideo : undefined, previewFiles: cc.sys.isNative ? undefined : createCreatorPreviewFileBridge({ indexedDB: globalThis.indexedDB, namespace: ${JSON.stringify(project.bundleId)} }) });
  const adapter = createCocosAssetsAdapter({ host });
  const assets = createCocosAssets({ adapter, cacheSize: 256 * 1024 * 1024 });
  await assets.initialize();
  for (const bundle of ${JSON.stringify(bundles)}) await assets.loadBundle('assets/resources/' + bundle.resource + '.binary', { expected: bundle.identity });
  const app = await bootstrap({ host, assets, adapter, review: ${JSON.stringify(project.targets.cocos!.buildOptions.debug === true)}, store: createCocosStoreStorage({ host }), project: ${JSON.stringify({ name: project.name, bundleId: project.bundleId, version: project.version })}, trustPolicy: createCocosStaticOnlyTrustPolicy(), runtimeModuleLoader: createUnsupportedCocosRuntimeModuleLoader() });
  const plugins = createVisualNovelCocosRendererPlugins({ ui: false, character: { boxSize: app.characterBoxSize } }).filter(plugin => !['settings','backlog','gallery','achievement','dialogue','choices'].some(name => plugin.name.endsWith('/' + name)));
  plugins.push(createDialogueCocosRendererPlugin({ render: app.renderDialogue }), createChoicesCocosRendererPlugin({ render: app.renderChoices }), createQuiCocosRendererPlugin({ features: app.features, surfaceKeys: app.surfaceKeys }));
  const renderer = new QuaCocosRendererController({ host, assets, pipeline: app.engine.getPipeline(), initialView: app.engine.getViewState(), plugins });
  await renderer.start();
  const quit = () => cc.game.end();
  app.engine.getPipeline().on('app/quit', quit);
  if (${JSON.stringify(project.targets.cocos!.buildOptions.debug === true)}) globalThis.__QUA_COCOS__ = { view: () => app.engine.getViewState(), point: () => app.engine.getStoryPoint(), diagnostics: () => app.getDiagnostics(), renderer, host, media: app.mediaReview };
  return { async destroy() { app.engine.getPipeline().off('app/quit', quit); await renderer.destroy(); await app.destroy(); delete globalThis.__QUA_COCOS__; } };
}`
      },
      async generateBundle(_options: unknown, output: Record<string, any>) {
        for (const chunk of Object.values(output)) {
          if (chunk.type !== 'chunk')
            continue
          for (const [id, info] of Object.entries(chunk.modules) as [string, { renderedLength: number }][]) {
            if (!info.renderedLength)
              continue
            const name = await packageName(id)
            if (name && name !== projectPackageName)
              dependencies.add(name)
            const normalized = id.replace(/\\/g, '/')
            if (name?.startsWith('@quajs/') && !normalized.includes('/dist/'))
              throw new Error(`Cocos runtime must consume public built package entries: ${name}`)
            const dist = normalized.lastIndexOf('/dist/')
            retainedModules.push({ specifier: name && dist >= 0 ? `${name}${normalized.slice(dist)}` : isAbsolute(id) ? relative(root, id).replace(/\\/g, '/') : id.replace(/^\0/, ''), packageName: name, renderedLength: info.renderedLength })
          }
          for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
            if (id !== 'cc' && !id.startsWith('.') && !Object.hasOwn(output, id))
              throw new Error(`Unbundled Cocos runtime import: ${id}`)
          }
          assertCocosRuntimeCode(chunk.code)
          chunk.code = protectCocosIterableSpreads(chunk.code).replace(/^\/\/#(?:end)?region.*$/gm, '')
        }
      },
    }],
    build: { outDir: join(stage, 'assets/qua-runtime'), emptyOutDir: false, minify: false, target: 'es2020', lib: { entry: 'virtual:cocos-core-resolver', formats: ['es'], fileName: () => 'runtime.js' }, rollupOptions: { input: 'virtual:cocos-core-resolver', external: ['cc'], output: { codeSplitting: false } } },
  })
  await writeFile(join(stage, 'retained-module-graph.json'), json({ schemaVersion: 1, target: 'cocos', modules: retainedModules }))
  return [...dependencies].sort()
}

export function assertCocosRuntimeCode(code: string): void {
  const traverse = (traverseImport as unknown as { default?: typeof traverseImport }).default || traverseImport
  traverse(parse(code, { sourceType: 'module' }), {
    ReferencedIdentifier(path) {
      if (['document', 'window', 'Blob', 'Worker', 'require', '__dirname', '__filename'].includes(path.node.name) && !path.scope.hasBinding(path.node.name))
        throw new Error(`Cocos runtime retained browser global ${path.node.name} at line ${path.node.loc?.start.line}: ${code.slice(Math.max(0, (path.node.start ?? 0) - 120), (path.node.end ?? 0) + 120)}`)
    },
    MemberExpression(path) {
      const object = path.node.object
      const property = path.node.property
      const name = property.type === 'Identifier' && !path.node.computed ? property.name : property.type === 'StringLiteral' ? property.value : ''
      if (object.type === 'Identifier' && object.name === 'globalThis' && ['document', 'window', 'Blob', 'Worker'].includes(name))
        throw new Error(`Cocos runtime retained browser global ${name}`)
    },
  })
}

/**
 * Creator's loose Babel spread assumes arrays. Materialize arbitrary iterables
 * before that pass, preserving Map/Set/generator semantics across all packages.
 */
export function protectCocosIterableSpreads(code: string): string {
  const traverse = (traverseImport as unknown as { default?: typeof traverseImport }).default || traverseImport
  const insertions: [number, string][] = []
  traverse(parse(code, { sourceType: 'module' }), {
    SpreadElement(path) {
      if (path.parentPath.isObjectExpression())
        return
      if (path.scope.getBinding('Array'))
        throw new Error('Cocos runtime shadows Array at an iterable spread.')
      insertions.push([path.node.argument.start!, 'Array.from('], [path.node.argument.end!, ')'])
    },
  })
  for (const [position, text] of insertions.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, position) + text + code.slice(position)
  return code
}

async function renamePngAssets(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await renamePngAssets(path)
    }
    else
      if (/\.(?:webp|avif|jpe?g)$/i.test(path)) {
        const bytes = await readFile(path)
        if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
          await renameWithoutCollision(path, `${path.slice(0, -extname(path).length)}.png`)
      }
  }
}

async function renameCreatorFonts(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory())
      await renameCreatorFonts(path)
    // Creator 3.8's ttf-font importer selects by suffix; FreeType accepts the
    // original OpenType bytes. QPK retains the logical .otf name and hash.
    else
      if (extname(path) === '.otf')
        await renameWithoutCollision(path, `${path.slice(0, -4)}.ttf`)
  }
}

async function renameWithoutCollision(source: string, destination: string): Promise<void> {
  let exists = false
  try {
    await access(destination)
    exists = true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
  if (exists)
    throw new Error(`Creator import filename collision: ${destination}`)
  await rename(source, destination)
}

/** No core import list lives in the generated scene or startup component. */
async function generateCreatorShell(stage: string, root: string, project: NormalizedQuaProjectConfig, manifest: TargetBundleManifest): Promise<void> {
  assertTargetBundleManifest(manifest, { expectedTarget: 'cocos' })
  if (!manifest.dependencies?.includes('@quajs/cocos-host'))
    throw new Error('Creator shell requires the host selected by the emitted target manifest.')
  const sceneUuid = uuid('main.scene')
  const require = createRequire(join(root, 'package.json'))
  // require.resolve selects CommonJS conditions, while this package exposes ESM only.
  let effectEntry: string | undefined
  let nativeProductsEntry: string | undefined
  for (const searchPath of require.resolve.paths('@quajs/cocos-host') || []) {
    const packageDir = join(searchPath, '@quajs/cocos-host')
    let metadata
    try {
      metadata = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
    }
    catch {
      continue
    }
    const entry = metadata.exports?.['./creator-effect']?.import
    if (typeof entry !== 'string' || !entry.startsWith('./dist/'))
      throw new Error('Cocos host must expose the built ./creator-effect ESM entry.')
    effectEntry = join(packageDir, entry)
    const nativeEntry = metadata.exports?.['./creator-native-products']?.import
    if (typeof nativeEntry !== 'string' || !nativeEntry.startsWith('./dist/'))
      throw new Error('Cocos host must expose built native host products.')
    nativeProductsEntry = join(packageDir, nativeEntry)
    break
  }
  if (!effectEntry)
    throw new Error('Install @quajs/cocos-host in the Cocos project before generating its workspace.')
  const { CREATOR_PROJECTION_EFFECT } = await import(pathToFileURL(effectEntry).href)
  const { CREATOR_MAC_VIDEO_SOURCE, CREATOR_MAC_AUDIO_SOURCE } = await import(pathToFileURL(nativeProductsEntry!).href)
  const scriptUuid = uuid('QuaBootstrap.js')
  const write = async (path: string, value: unknown) => {
    await mkdir(dirname(join(stage, path)), { recursive: true })
    await writeFile(join(stage, path), typeof value === 'string' ? value : json(value))
  }
  await write('assets/resources/qua/projection.effect', CREATOR_PROJECTION_EFFECT)
  await write('native/engine/common/Classes/QuaCreatorVideo.mm', CREATOR_MAC_VIDEO_SOURCE)
  await write('native/engine/common/Classes/QuaCreatorAudio.mm', CREATOR_MAC_AUDIO_SOURCE)
  await write('package.json', { name: 'qua-generated-cocos', uuid: uuid('project'), type: 'module', version: project.version, creator: { version: project.targets.cocos!.creatorVersion || '3.8.8' } })
  await write('tsconfig.json', { extends: './temp/tsconfig.cocos.json', compilerOptions: { strict: true } })
  // Creator web-desktop forces exactFitScreen=false. A percentage-sized subframe
  // then never changes its inline dimensions, so PAL emits no resize event.
  // Configure the generated standalone shell before screen subsystem startup.
  // SDK VideoPlayer stays below Canvas; transparency must be enabled before
  // graphics initialization or decoding succeeds behind an opaque framebuffer.
  await write('build-templates/web-desktop/index.js.ejs', `import { Application } from '<%= applicationJS %>';\nconst application = new Application();\nSystem.import('cc').then(engine => {\n application.showFPS = false;\n application.onPostInitBase = () => { engine.settings.overrideSettings('engine', 'macros', { ...engine.settings.querySettings('engine', 'macros'), ENABLE_TRANSPARENT_CANVAS: true }); engine.settings.overrideSettings('screen', 'exactFitScreen', true); engine.settings.overrideSettings('splashScreen', 'totalTime', 0); };\n return application.init(engine);\n}).then(() => application.start()).catch(error => console.error(error));\n`)
  // Creator's macOS game.end() posts SDL_QUIT, which Engine ignores. Complete
  // both script-requested quit and native window-close through the platform loop.
  await write('native/engine/common/Classes/Game.h', `#pragma once\n#include "cocos/cocos.h"\nclass Game : public cc::BaseGame {\npublic:\n int init() override;\n void onClose() override;\n void close() override;\n};\n`)
  await write('native/engine/common/Classes/Game.cpp', `#include "Game.h"\n#include "platform/BasePlatform.h"\n#if CC_PLATFORM == CC_PLATFORM_MACOS\n#include "bindings/jswrapper/SeApi.h"\nbool registerQuaCreatorVideo(se::Object*);\nbool registerQuaCreatorAudio(se::Object*);\n#endif\nint Game::init() {\n _windowInfo.title = ${JSON.stringify(project.name)};\n#if CC_DEBUG\n _debuggerInfo.enabled = true;\n#else\n _debuggerInfo.enabled = false;\n#endif\n _debuggerInfo.port = 6086;\n _debuggerInfo.address = "127.0.0.1";\n _debuggerInfo.pauseOnStart = false;\n#ifdef SCRIPT_XXTEAKEY\n _xxteaKey = SCRIPT_XXTEAKEY;\n#endif\n#if CC_PLATFORM == CC_PLATFORM_MACOS\n se::ScriptEngine::getInstance()->addRegisterCallback(registerQuaCreatorVideo);\n se::ScriptEngine::getInstance()->addRegisterCallback(registerQuaCreatorAudio);\n#endif\n return cc::BaseGame::init();\n}\nvoid Game::onClose() {\n cc::BaseGame::onClose();\n#if CC_PLATFORM == CC_PLATFORM_MACOS\n cc::BasePlatform::getPlatform()->exit();\n#endif\n}\nvoid Game::close() {\n#if CC_PLATFORM == CC_PLATFORM_MACOS\n onClose();\n#else\n cc::BaseGame::close();\n#endif\n}\nCC_REGISTER_APPLICATION(Game);\n`)
  await write('build-templates/web-desktop/index.ejs', `<!doctype html><html><head><meta charset="utf-8"><title><%= projectName %></title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#GameDiv,#Cocos3dGameContainer{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#000}#Cocos3dGameContainer{position:relative;isolation:isolate}#GameCanvas{display:block;width:100%;height:100%;outline:none}</style></head><body><div id="GameDiv" cc_exact_fit_screen="true"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="1920" height="1080" tabindex="0"></canvas></div></div><%- include(cocosTemplate, {}) %></body></html>\n`)
  const macOSDeploymentTarget = project.targets.cocos!.build?.macOSDeploymentTarget
  if (macOSDeploymentTarget) {
    if (!/^\d+\.\d+(?:\.\d+)?$/.test(macOSDeploymentTarget))
      throw new Error('Invalid Cocos macOSDeploymentTarget.')
  }
  await write('native/engine/common/localCfg.cmake', `# Static QuaEngine host products; all paths are workspace-relative.\n${macOSDeploymentTarget ? `set(TARGET_OSX_VERSION "${macOSDeploymentTarget}")\n` : ''}if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")\n list(APPEND CC_COMMON_SOURCES "\${CMAKE_CURRENT_LIST_DIR}/Classes/QuaCreatorVideo.mm" "\${CMAKE_CURRENT_LIST_DIR}/Classes/QuaCreatorAudio.mm")\n link_libraries("-framework AVFoundation" "-framework CoreVideo" "-framework CoreMedia")\nendif()\n`)
  await write('assets/qua-runtime/QuaBootstrap.ts', `import { Component, _decorator } from 'cc';\nimport { start } from './runtime.js';\nconst { ccclass } = _decorator;\n@ccclass('${compressUuid(scriptUuid)}')\nexport class QuaBootstrap extends Component {\n private app: { destroy(): Promise<void> } | undefined;\n async start() { try { this.app = await start(this.node); console.info('QUA_COCOS_READY'); } catch (error) { console.error('QUA_COCOS_START_FAILED', error); } }\n onDestroy() { void this.app?.destroy(); }\n}\n`)
  const node = { __type__: 'cc.Node', _name: 'QuaCanvas', _parent: { __id__: 1 }, _children: [{ __id__: 6 }], _active: true, _components: [{ __id__: 3 }, { __id__: 4 }, { __id__: 5 }], _lpos: { __type__: 'cc.Vec3', x: 960, y: 540, z: 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _layer: 33554432 }
  await write('assets/main.scene', [
    { __type__: 'cc.SceneAsset', _name: 'main', scene: { __id__: 1 } },
    { __type__: 'cc.Scene', _name: 'main', _children: [{ __id__: 2 }], _active: true, _components: [], autoReleaseAssets: false, _id: sceneUuid },
    node,
    { __type__: 'cc.UITransform', node: { __id__: 2 }, _enabled: true, _contentSize: { __type__: 'cc.Size', width: 1920, height: 1080 }, _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 } },
    { __type__: 'cc.Canvas', node: { __id__: 2 }, _enabled: true, _cameraComponent: { __id__: 7 }, _alignCanvasWithScreen: true },
    { __type__: compressUuid(scriptUuid), node: { __id__: 2 }, _enabled: true },
    { ...node, _name: 'Camera', _parent: { __id__: 2 }, _children: [], _components: [{ __id__: 7 }], _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 1000 } },
    { __type__: 'cc.Camera', node: { __id__: 6 }, _enabled: true, _projection: 0, _orthoHeight: 540, _near: 1, _far: 2000, _clearFlags: 7, _color: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 }, _visibility: 33554432, _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 } },
  ])
  await write('settings/v2/packages/project.json', { __version__: '1.0.0', general: { designResolution: { width: 1920, height: 1080, fitWidth: false, fitHeight: true } } })
  const modules = ['base', '2d', 'ui', 'graphics', 'mask', 'rich-text', 'audio', 'video', 'gfx-webgl', 'gfx-webgl2', 'tween', 'websocket', '3d', 'primitive', 'custom-pipeline']
  const disabledModules = ['profiler', 'gfx-webgpu', 'animation', 'skeletal-animation', '3d', 'meshopt', 'sorting-2d', 'ui-skew', 'affine-transform', 'particle', 'physics', 'physics-ammo', 'physics-cannon', 'physics-physx', 'physics-builtin', 'physics-2d', 'physics-2d-box2d', 'physics-2d-box2d-wasm', 'physics-2d-builtin', 'physics-2d-box2d-jsb', 'intersection-2d', 'primitive', 'occlusion-query', 'geometry-renderer', 'debug-renderer', 'particle-2d', 'video', 'webview', 'websocket-server', 'terrain', 'light-probe', 'tiled-map', 'vendor-google', 'spine', 'spine-3.8', 'spine-4.2', 'dragon-bones', 'marionette', 'procedural-animation', 'custom-pipeline-post-process', 'custom-pipeline', 'xr']
  // Emit the actual 3.8.8 profile schema; a broken migration otherwise resets
  // the authored subset to Creator's default full engine/custom pipeline.
  await write('settings/v2/packages/engine.json', { __version__: '1.0.12', modules: { configs: { defaultConfig: { name: 'Default Config', includeModules: modules, cache: { ...Object.fromEntries(disabledModules.map(key => [key, { _value: false }])), ...Object.fromEntries(modules.map(key => [key, { _value: true }])), 'render-pipeline': { _value: true, _option: 'custom-pipeline' } } } }, globalConfigKey: 'defaultConfig' } })
  await syncQuaProjectCocos({ ...project, targets: { ...project.targets, cocos: { ...project.targets.cocos!, projectDir: stage } } }, { cwd: root })
  for (const platform of project.targets.cocos!.platforms) {
    const path = `qua-build/${platform}.build.json`
    const config = JSON.parse(await readFile(join(stage, path), 'utf8'))
    await write(path, { ...config, customPipeline: true, startScene: sceneUuid, scenes: [{ url: 'db://assets/main.scene', uuid: sceneUuid }], outputName: platform, buildPath: 'project://build' })
  }
  await write('README.md', `# Generated QuaEngine Cocos workspace\n\nOpen this directory in Creator ${project.targets.cocos!.creatorVersion}. All game code and resources are built artifacts. Rebuild from the QuaEngine project to change content.\n\nThis directory can be copied outside the source repository. It contains no source links and needs no QuaEngine development server. The startup scene consumes the active-target bundle manifest.\n\nFrom this directory, run your Creator executable with \`--project "$PWD" --build "configPath=$PWD/qua-build/web-desktop.build.json;stage=build"\`. For macOS use \`mac.build.json\`, first \`stage=build\` and then \`stage=make\`. Creator success exits with code 36. Launch \`build/mac/proj/Debug/CocosGame.app\` after make.\n\nIf a cold CLI import omits the start scene despite exit 36, open this workspace in the full Creator Editor, wait for asset import, close it, and retry the CLI build. The source demo builder automates this bounded recovery and rejects missing scenes. qua-import-meta.json records the authored import types and stable UUIDs. For repeatable CLI automation, build each platform from a fresh copy of this raw workspace: Creator 3.8.8 can invalidate importer types in a reused database. The demo helper creates private imports and atomically publishes only validated platform outputs.\n\nAudio uses Creator SDK processing in Web preview and the bundled static macOS AVAudioEngine PCM host product for gain, EQ and playback rate.\n\nVideo backgrounds use SDK VideoPlayer on Creator Web and the bundled AVFoundation native host product on macOS. The Web shell enables transparent Canvas and isolates its stacking context. Serve published Web assets with HTTP Range for seeking. Use explicitly tagged SDR media for cross-decoder color consistency. GPU-only captures exclude the SDK Web video layer.\n\nNative saves live under the Creator writable directory; preview saves use an independent byte-file database. Debug macOS builds expose the Creator local debugging service. GPU capture and native input binding checks do not replace OS-level interaction checks.\n`)
  await writeMetaFiles(stage, scriptUuid, sceneUuid)
}

function compressUuid(value: string): string {
  const hex = value.replace(/-/g, '')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  // Creator's script class IDs retain five hex digits (its non-minified UUID form).
  let result = hex.slice(0, 5)
  for (let i = 5; i < 32; i += 3) {
    const number = Number.parseInt(hex.slice(i, i + 3), 16)
    result += alphabet[number >> 6] + alphabet[number & 63]
  }
  return result
}

async function writeMetaFiles(stage: string, scriptUuid: string, sceneUuid: string): Promise<void> {
  const files: Record<string, unknown> = {}
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const rel = relative(stage, path).replace(/\\/g, '/')
      const extension = extname(path)
      const id = rel.endsWith('QuaBootstrap.ts') ? scriptUuid : extension === '.scene' ? sceneUuid : uuid(rel)
      if (entry.isDirectory()) {
        await writeFile(`${path}.meta`, json({ ver: '1.2.0', importer: 'directory', imported: true, uuid: id, files: [], subMetas: {}, userData: {} }))
        await walk(path)
      }
      else {
        const importer = extension === '.ts' ? 'typescript' : extension === '.js' ? 'javascript' : extension === '.scene' ? 'scene' : extension === '.png' ? 'image' : extension === '.binary' ? '*' : extension === '.ttf' ? 'ttf-font' : extension === '.effect' ? 'effect' : ['.wav', '.mp3', '.ogg'].includes(extension) ? 'audio-clip' : extension === '.mp4' ? 'video-clip' : undefined
        if (!importer)
          continue
        await writeFile(`${path}.meta`, json({ ver: ['.js', '.ts'].includes(extension) ? '4.0.24' : extension === '.scene' ? '1.1.50' : extension === '.png' ? '1.0.27' : extension === '.binary' ? '0.0.1' : '1.0.0', importer, imported: false, uuid: id, files: [], subMetas: {}, userData: extension === '.png' ? { type: 'sprite-frame', hasAlpha: true, trimType: 'none' } : {} }))
      }
      files[`${rel}.meta`] = JSON.parse(await readFile(`${path}.meta`, 'utf8'))
    }
  }
  await walk(join(stage, 'assets'))
  await writeFile(join(stage, 'qua-import-meta.json'), json({ schemaVersion: 1, files }))
}
