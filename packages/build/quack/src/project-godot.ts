import type { TargetBundleManifest } from '@quajs/native-contracts'
import type { NormalizedQuaProjectConfig } from './project'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { arch, platform } from 'node:process'
import { pathToFileURL } from 'node:url'
import { assertTargetBundleManifest, createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from './core/bundler'
import { AssetPipelinePlugin } from './plugins/asset-pipeline'
import { createQuaProjectAssetTargets, loadQuaProjectConfig } from './project'
import { emitQuaTargetBundleManifest } from './project-target-bundle'
import { readQpkSummary } from './qpk-reader'
import { assertStandaloneRuntimeCode } from './standalone-runtime-validation'
import { WorkspaceManager } from './workspace/workspace'

export interface QuaGodotWorkspaceBuildOptions {
  cwd: string
  configPath?: string
  workspaceConfig?: string
  signal?: AbortSignal
  onLog?: (text: string) => void
}

export interface QuaGodotWorkspaceBuildResult {
  target: 'godot'
  artifact: string
  manifest: string
  hostPlatform: string
}

interface GodotBundle {
  path: string
  identity: { name: string, version: number, buildNumber?: string, target?: string, hash: string }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** Builds an atomic, relocatable Godot project from the active resolver and QPK graph. */
export async function buildQuaProjectGodotWorkspace(options: QuaGodotWorkspaceBuildOptions): Promise<QuaGodotWorkspaceBuildResult> {
  const root = await realpath(resolve(options.cwd))
  const project = await loadQuaProjectConfig({ cwd: root, configPath: options.configPath })
  const target = project.targets.godot
  if (!target?.enabled)
    throw new Error('Godot project generation requires targets.godot.build.entry.')
  const destination = resolve(root, target.projectDir)
  await assertGodotOutputPath(root, destination)
  if (destination === root || root.startsWith(destination + sep))
    throw new Error('Godot output must not replace source directories or their parents.')
  const marker = '.qua-generated.json'
  try {
    const files = await readdir(destination)
    if (files.length) {
      const previous = JSON.parse(await readFile(join(destination, marker), 'utf8'))
      if (previous.target !== 'godot' || previous.bundleId !== project.bundleId || previous.schemaVersion !== 1)
        throw new Error('Godot output contains an authored project or belongs to another project.')
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
    // A directory without the marker must never be replaced, including a missing-marker ENOENT.
    const existing = await readdir(destination).catch(() => [])
    if (existing.length)
      throw new Error('Godot output contains an authored project. Choose a separate projectDir.')
  }
  const stage = `${destination}.build-${randomUUID()}`
  const backup = `${destination}.previous-${randomUUID()}`
  await mkdir(join(stage, 'qua'), { recursive: true })
  const require = createRequire(join(root, 'package.json'))
  const buildNumber = `godot-${randomUUID()}`
  try {
    options.signal?.throwIfAborted()
    const hostPackage = dirname(require.resolve('@quajs/godot-host/package.json'))
    const workspace = new WorkspaceManager(root)
    await workspace.loadConfig(options.workspaceConfig, { projectConfig: options.configPath })
    const assetTarget = createQuaProjectAssetTargets(project).find(value => value.platform === 'godot')!
    const bundles: GodotBundle[] = []
    for (const definition of workspace.getBundlesBuildOrder()) {
      options.signal?.throwIfAborted()
      const bundler = new QuackBundler(workspace.createBundleConfig(definition.name, {
        output: join(stage, 'qua', `${definition.name}.qpk`),
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
      const file = (await readdir(join(stage, 'qua'))).find(name => name.startsWith(`${definition.name}.`) && name.endsWith('.qpk'))
      if (!file)
        throw new Error(`Missing Godot QPK: ${definition.name}`)
      const path = join(stage, 'qua', file)
      const summary = await readQpkSummary(path)
      if (!summary.manifest || summary.errors.length)
        throw new Error(`Invalid Godot QPK: ${definition.name}`)
      bundles.push({ path: `qua/${file}`, identity: { name: summary.manifest.name, version: summary.manifest.bundleVersion, buildNumber: summary.manifest.buildNumber, target: summary.manifest.assetTarget?.name, hash: createHash('sha256').update(await readFile(path)).digest('hex') } })
    }
    const dependencies = await compileGodotRuntime(root, stage, project, bundles)
    const manifest: TargetBundleManifest = {
      schemaVersion: 1,
      profile: target.build.profile,
      platform: 'godot',
      app: { bundleId: project.bundleId, version: project.version, buildNumber },
      ...createTargetCoreSelection('godot'),
      dependencies,
      projectGraphs: [{ id: 'godot.workspace.post-bundle', kind: 'post-bundle', references: dependencies }],
    }
    await emitQuaTargetBundleManifest({ artifactDir: stage, expectedTarget: 'godot', manifest })
    await generateGodotShell(stage, hostPackage, project, manifest, options)
    await writeFile(join(stage, marker), json({ schemaVersion: 1, target: 'godot', bundleId: project.bundleId }))
    options.signal?.throwIfAborted()
    let replaced = false
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
    return { target: 'godot', artifact: destination, manifest: join(destination, 'target-bundle-manifest.json'), hostPlatform: `${platform}-${arch}` }
  }
  finally {
    await rm(stage, { recursive: true, force: true })
  }
}

async function compileGodotRuntime(root: string, stage: string, project: NormalizedQuaProjectConfig, bundles: GodotBundle[]): Promise<string[]> {
  const require = createRequire(join(root, 'package.json'))
  const vite = await import(pathToFileURL(require.resolve('vite')).href)
  const target = project.targets.godot!
  const dependencies = new Set<string>()
  const retained: { specifier: string, packageName?: string, renderedLength: number }[] = []
  const packageNames = new Map<string, string | undefined>()
  const projectName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
  async function packageName(id: string): Promise<string | undefined> {
    let dir = dirname(id.split('?')[0])
    if (!isAbsolute(dir))
      return undefined
    const visited: string[] = []
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
      catch { dir = dirname(dir) }
    }
    for (const path of visited)
      packageNames.set(path, name)
    return name
  }
  const entry = `
import { installGodotGlobals } from '@quajs/godot-host/globals';
import { createGodotHost } from '@quajs/godot-host';
import { createGodotAssets, createGodotAssetsAdapter } from '@quajs/godot-host/assets';
import { createGodotStoreStorage } from '@quajs/godot-host/store';
import { createGodotStaticOnlyTrustPolicy, createUnsupportedGodotRuntimeModuleLoader } from '@quajs/godot-host/security';
import { QuaGodotRendererController, createVisualNovelGodotRendererPlugins } from '@quajs/renderer-godot';
import { createQuiGodotRendererPlugin } from '@quajs/renderer-godot/qui';
import { createDialogueGodotRendererPlugin } from '@quajs/renderer-godot/plugins/dialogue';
import { createChoicesGodotRendererPlugin } from '@quajs/renderer-godot/plugins/choices';
import { bootstrap } from ${JSON.stringify(resolve(root, target.build.entry))};
installGodotGlobals();
async function start() {
  const host = createGodotHost();
  const adapter = createGodotAssetsAdapter();
  const assets = createGodotAssets({ adapter, cacheSize: 256 * 1024 * 1024 });
  await assets.initialize();
  for (const bundle of ${JSON.stringify(bundles)}) await assets.loadBundle(bundle.path, { expected: bundle.identity });
  const app = await bootstrap({ host, assets, adapter, store: createGodotStoreStorage({ host }), project: ${JSON.stringify({ name: project.name, bundleId: project.bundleId, version: project.version })}, layout: ${JSON.stringify(target.layout)}, trustPolicy: createGodotStaticOnlyTrustPolicy(), runtimeModuleLoader: createUnsupportedGodotRuntimeModuleLoader() });
  const plugins = createVisualNovelGodotRendererPlugins({ ui: app.surfaceKeys ? false : undefined, character: { boxSize: app.characterBoxSize } }).filter(plugin => !app.surfaceKeys || !['settings','backlog','gallery','achievement','dialogue','choices'].some(name => plugin.name.endsWith('/' + name)));
  if (app.surfaceKeys) plugins.push(createDialogueGodotRendererPlugin({ render: app.renderDialogue }), createChoicesGodotRendererPlugin({ render: app.renderChoices }), createQuiGodotRendererPlugin({ features: app.features, surfaceKeys: app.surfaceKeys }));
  const renderer = new QuaGodotRendererController({ host, assets, pipeline: app.engine.getPipeline(), initialView: app.engine.getViewState(), plugins });
  await renderer.start();
  const quit = async () => { await renderer.destroy();
await app.destroy();
host.destroy();
globalThis.__quaCall('quit', '{}');
};
  app.engine.getPipeline().on('app/quit', quit);
  ${target.build.profile === 'debug' ? 'globalThis.__quaInspect = () => ({ view: app.engine.getViewState(), point: app.engine.getStoryPoint(), diagnostics: app.getDiagnostics?.() });' : ''}
  console.info('QUA_GODOT_READY');
}
start().catch(error => { const message = String(error) + (error?.stack ? '\\n' + error.stack : '');
console.error(message);
globalThis.__quaCall('startup_error', JSON.stringify({ message }));
});
`
  await vite.build({
    root,
    configFile: target.build.viteConfig ? resolve(root, target.build.viteConfig) : false,
    publicDir: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.SSR': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.VITE_QUA_EDITOR_PREVIEW': '"0"' },
    plugins: [{
      name: 'godot-core-resolver',
      resolveId(id: string) {
        if (id === 'virtual:godot-core-resolver')
          return '\0godot-core-resolver'
      },
      load(id: string) {
        if (id === '\0godot-core-resolver')
          return entry
      },
      async generateBundle(_options: unknown, output: Record<string, any>) {
        for (const chunk of Object.values(output)) {
          if (chunk.type !== 'chunk')
            continue
          for (const [id, info] of Object.entries(chunk.modules) as [string, { renderedLength: number }][]) {
            if (!info.renderedLength)
              continue
            const name = await packageName(id)
            if (name && name !== projectName)
              dependencies.add(name)
            const normalized = id.replace(/\\/g, '/')
            if (name?.startsWith('@quajs/') && !normalized.includes('/dist/'))
              throw new Error(`Godot must consume built package entries: ${name}`)
            const dist = normalized.lastIndexOf('/dist/')
            retained.push({ specifier: name && dist >= 0 ? `${name}${normalized.slice(dist)}` : isAbsolute(id) ? relative(root, id).replace(/\\/g, '/') : id.replace(/^\0/, ''), packageName: name, renderedLength: info.renderedLength })
          }
          if ([...chunk.imports, ...chunk.dynamicImports].some(id => id !== chunk.fileName))
            throw new Error(`Godot runtime must be a self-contained JS bundle: ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`)
          assertStandaloneRuntimeCode(chunk.code, 'Godot')
        }
      },
    }],
    build: { outDir: join(stage, 'qua'), emptyOutDir: false, minify: false, target: 'es2022', lib: { entry: 'virtual:godot-core-resolver', formats: ['iife'], name: 'QuaGodot', fileName: () => 'runtime.js' }, rollupOptions: { input: 'virtual:godot-core-resolver', external: [], output: { codeSplitting: false } } },
  })
  await writeFile(join(stage, 'retained-module-graph.json'), json({ schemaVersion: 1, target: 'godot', modules: retained }))
  return [...dependencies].sort()
}

async function generateGodotShell(stage: string, hostPackage: string, project: NormalizedQuaProjectConfig, manifest: TargetBundleManifest, options: QuaGodotWorkspaceBuildOptions): Promise<void> {
  assertTargetBundleManifest(manifest, { expectedTarget: 'godot' })
  const target = project.targets.godot!
  const addon = join(stage, 'addons/quaengine')
  await cp(join(hostPackage, 'addon'), addon, { recursive: true })
  for (const file of ['Cargo.toml', 'Cargo.lock', 'src'])
    await cp(join(hostPackage, 'runtime', file), join(addon, 'runtime', file), { recursive: true })
  await writeFile(join(addon, 'runtime/.gdignore'), '')
  const release = target.build.profile === 'release'
  const cargoTarget = join(resolve(options.cwd), 'node_modules/.cache/qua-godot-runtime')
  await new Promise<void>((resolve, reject) => {
    const child = spawn('cargo', ['build', '--locked', '--manifest-path', join(hostPackage, 'runtime/Cargo.toml'), ...(release ? ['--release'] : [])], { signal: options.signal, env: { ...process.env, CARGO_TARGET_DIR: cargoTarget }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (bytes) => {
        const text = bytes.toString()
        output = (output + text).slice(-16000)
        options.onLog?.(text)
      })
    }
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Godot GDExtension build failed (${code}):\n${output}`)))
  })
  const library = platform === 'darwin' ? 'libquajs_godot_runtime.dylib' : platform === 'win32' ? 'quajs_godot_runtime.dll' : 'libquajs_godot_runtime.so'
  const godotPlatform = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'
  const godotArch = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x86_64' : arch
  await mkdir(join(addon, 'bin'), { recursive: true })
  await cp(join(cargoTarget, release ? 'release' : 'debug', library), join(addon, 'bin', library))
  await writeFile(join(addon, 'quaengine.gdextension'), `[configuration]\nentry_symbol = "gdext_rust_init"\ncompatibility_minimum = "4.7"\nreloadable = false\n\n[libraries]\n${godotPlatform}.${godotArch} = "res://addons/quaengine/bin/${library}"\n`)
  const portrait = target.layout === 'portrait'
  await writeFile(join(stage, 'project.godot'), `config_version=5\n\n[application]\nconfig/name=${JSON.stringify(project.home.title || project.name)}\nrun/main_scene="res://main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir_name=${JSON.stringify(project.bundleId)}\n\n[display]\nwindow/size/viewport_width=${portrait ? 540 : 1280}\nwindow/size/viewport_height=${portrait ? 1170 : 720}\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0, 0, 0, 1)\n`)
  await writeFile(join(stage, 'main.tscn'), `[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://addons/quaengine/host.gd" id="1"]\n\n[node name="QuaEngine" type="Control"]\nlayout_mode=3\nanchors_preset=15\nanchor_right=1.0\nanchor_bottom=1.0\ngrow_horizontal=2\ngrow_vertical=2\nscript=ExtResource("1")\n`)
  await writeFile(join(stage, 'export_presets.cfg'), `[preset.0]\nname="${godotPlatform}"\nplatform="${godotPlatform === 'macos' ? 'macOS' : godotPlatform === 'windows' ? 'Windows Desktop' : 'Linux'}"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="qua/*.js,qua/*.qpk,target-bundle-manifest.json"\nexclude_filter="addons/quaengine/runtime/*,retained-module-graph.json"\nexport_path="build/${project.bundleId}.${godotPlatform === 'macos' ? 'zip' : godotPlatform === 'windows' ? 'exe' : 'x86_64'}"\n\n[preset.0.options]\napplication/bundle_identifier=${JSON.stringify(project.bundleId)}\napplication/short_version=${JSON.stringify(project.version)}\napplication/version=${JSON.stringify(project.version)}\n`)
  await writeFile(join(stage, 'README.md'), `# ${project.name}: Godot\n\nOpen project.godot with Godot 4.7 or newer. This project contains the current host (${godotPlatform}/${godotArch}) GDExtension, bundled JavaScript, QPK assets, and source for rebuilding the extension. No Node server or repository checkout is required at runtime.\n\nThe generated directory is disposable. Edit QuaEngine source and regenerate with quack project build --target godot --all. To rebuild the native extension, run cargo build --locked --manifest-path addons/quaengine/runtime/Cargo.toml and copy its library into addons/quaengine/bin. For another desktop OS, build on that OS and update quaengine.gdextension with its platform and architecture.\n\nThe current host export preset includes raw QPK/JS files. Install the matching Godot export templates before exporting. User state lives under the Godot user directory named ${project.bundleId}.\n`)
}

/** Resolve existing ancestors too, so a source alias cannot bypass output protection. */
export async function assertGodotOutputPath(root: string, destination: string): Promise<void> {
  root = await realpath(root)
  let ancestor = destination
  while (true) {
    try {
      const stat = await lstat(ancestor)
      if (ancestor === destination && stat.isSymbolicLink())
        throw new Error('Godot output must not be a symbolic link.')
      const canonical = resolve(await realpath(ancestor), relative(ancestor, destination))
      if (canonical === root || root.startsWith(canonical + sep))
        throw new Error('Godot output must not replace source directories or their parents.')
      return
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
      const parent = dirname(ancestor)
      if (parent === ancestor)
        throw error
      ancestor = parent
    }
  }
}
