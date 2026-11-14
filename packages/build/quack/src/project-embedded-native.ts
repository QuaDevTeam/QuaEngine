import type { NormalizedQuaProjectConfig } from './project'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from './core/bundler'
import { AssetPipelinePlugin } from './plugins/asset-pipeline'
import { createQuaProjectAssetTargets } from './project'
import { createNativeEmbeddedEntry } from './project-native-entry'
import { buildSceneScriptBundle } from './project-scene-bundle'
import { emitQuaTargetBundleManifest } from './project-target-bundle'
import { readQpkSummary } from './qpk-reader'
import { WorkspaceManager } from './workspace/workspace'

export async function buildEmbeddedNative(root: string, output: string, project: NormalizedQuaProjectConfig, options: {
  configPath?: string
  workspaceConfig?: string
  signal?: AbortSignal
  onLog?: (text: string) => void
}) {
  if (process.platform !== 'darwin')
    throw new Error('Native library export currently builds macOS desktop libraries only; Windows/Linux/iOS/Android SDK delivery is not implemented.')
  const native = project.targets.native
  const config = native?.build
  if (!native?.enabled || !config?.embeddedEntry || !config.cargoManifest)
    throw new Error('Native library export requires targets.native.build.embeddedEntry and cargoManifest pointing to the QuaEngine native workspace.')
  if (!native.platforms.includes('macos') || !native.profiles.includes('release'))
    throw new Error('Native library export requires enabled macos/release in targets.native.platforms/profiles.')
  const icon = native.app.icon ?? project.icons.source
  if (!icon)
    throw new Error('Native target identity requires targets.native.app.icon or icons.source (module metadata only; the parent keeps its application icon).')
  const moduleIcon = `module-icon${extname(icon)}`
  await cp(resolve(root, icon), join(output, moduleIcon))
  const run = (command: string, args: string[]) => new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, signal: options.signal, env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '11.0' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (data) => {
      output += data
      if (output.length > 32 * 1024 * 1024)
        child.kill()
    })
    child.stderr.on('data', data => options.onLog?.(String(data)))
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolvePromise(output) : reject(new Error(`${command} exited ${code}: ${output.slice(-4000)}`)))
  })
  const manifestPath = resolve(root, config.cargoManifest)
  const metadata = JSON.parse(await run('cargo', ['metadata', '--locked', '--no-deps', '--format-version', '1', '--manifest-path', manifestPath]))
  const sdk = join(metadata.workspace_root, 'sdk')
  await cp(resolve(metadata.workspace_root, '../../LICENSE'), join(output, 'LICENSE'))
  options.onLog?.('Building host-driven JavaScriptCore/wgpu native library…\n')
  const cargo = await run('cargo', ['build', '--locked', '--release', '--lib', '--manifest-path', manifestPath, '-p', 'quajs_native_app', '--features', 'embedded-sdk', '--message-format=json-render-diagnostics'])
  const records = cargo.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)]
    }
    catch { return [] }
  })
  const artifact = records.find(record => record.reason === 'compiler-artifact' && record.target?.name === 'quajs_native')
  if (!artifact)
    throw new Error('Cargo did not emit the Native SDK library.')
  await mkdir(join(output, 'lib'), { recursive: true })
  for (const extension of ['.dylib', '.a']) {
    const file = artifact.filenames.find((name: string) => name.endsWith(extension))
    if (!file)
      throw new Error(`Missing Native SDK ${extension}`)
    await cp(file, join(output, 'lib', `libquajs_native${extension}`))
  }
  await run('install_name_tool', ['-id', '@rpath/libquajs_native.dylib', join(output, 'lib/libquajs_native.dylib')])
  await run('codesign', ['--force', '--sign', '-', join(output, 'lib/libquajs_native.dylib')])
  await cp(join(sdk, 'README.md'), join(output, 'native-sdk.md'))
  await cp(join(sdk, 'qua-native.cmake'), join(output, 'qua-native.cmake'))
  await cp(join(sdk, 'include'), join(output, 'include'), { recursive: true })
  await cp(join(sdk, 'examples'), join(output, 'examples'), { recursive: true })
  const probe = join(output, '.describe')
  await run('cc', [join(sdk, 'examples/describe.c'), '-I', join(output, 'include'), '-L', join(output, 'lib'), '-lquajs_native', `-Wl,-rpath,${join(output, 'lib')}`, '-o', probe])
  const host = JSON.parse(await run(probe, []))
  await rm(probe)
  const workspace = new WorkspaceManager(root)
  await workspace.loadConfig(options.workspaceConfig ?? config.workspaceConfig, { projectConfig: options.configPath })
  const buildNumber = `embedded-native-${randomUUID()}`
  const bundles: string[] = []
  await mkdir(join(output, 'qua'))
  for (const definition of workspace.getBundlesBuildOrder()) {
    options.signal?.throwIfAborted()
    await new QuackBundler(workspace.createBundleConfig(definition.name, { output: join(output, 'qua', `${definition.name}.qpk`), format: 'qpk', assetTargets: [], assetTarget: createQuaProjectAssetTargets(project).find(target => target.platform === 'native'), plugins: [new AssetPipelinePlugin()], compression: { algorithm: 'none' }, encryption: { enabled: false, algorithm: 'none' }, versioning: { bundleVersion: 1, buildNumber, incrementVersion: false } })).bundle(definition.name)
    const file = (await readdir(join(output, 'qua'))).find(file => file.startsWith(`${definition.name}.`) && file.endsWith('.qpk'))
    if (!file)
      throw new Error('Missing Native library QPK')
    const summary = await readQpkSummary(join(output, 'qua', file))
    if (summary.errors.length || summary.header.flags !== 0)
      throw new Error('Native library requires validated uncompressed, unencrypted QPKs')
    bundles.push(`qua/${file}`)
  }
  const dependencies = await buildSceneScriptBundle({ root, artifactDir: output, outputDir: output, target: 'native', entry: createNativeEmbeddedEntry(resolve(root, config.embeddedEntry), bundles, { name: project.name, bundleId: project.bundleId, version: project.version }, native.layout), viteConfig: config.embeddedViteConfig ? resolve(root, config.embeddedViteConfig) : undefined })
  await emitQuaTargetBundleManifest({ artifactDir: output, expectedTarget: 'native', manifest: { schemaVersion: 1, platform: 'macos', profile: 'release', app: { bundleId: project.bundleId, version: project.version, buildNumber, icon: moduleIcon }, ...createTargetCoreSelection('native'), nativeRenderer: { ...host.renderer, capabilityIds: host.renderer.capabilities.map((value: { id: string }) => value.id) }, nativeRuntime: host.runtime, rendererEntries: [{ specifier: '@quajs/native-renderer/builtin', target: 'native' }], dependencies, projectGraphs: [{ id: 'native.embedded.post-bundle', kind: 'post-bundle', references: dependencies }] } })
  await writeFile(join(output, 'native-module.json'), `${JSON.stringify({ schemaVersion: 1, bundles, buildNumber })}\n`)
  await writeFile(join(output, 'qua-host-compatibility.json'), `${JSON.stringify({ schemaVersion: 1, target: 'native', sdk: { name: 'Qua Native C ABI', version: 1, minimumMacOS: '11.0' }, host: { platform: process.platform, arch: process.arch }, runtime: 'JavaScriptCore', renderer: 'wgpu/Metal', embedding: { ownsApplicationExit: false, ownsEventLoop: false, parentOwnedSurface: 'CAMetalLayer', isolatedVmPerHandle: true, storage: 'atomic file records; exclusive module/account namespace' }, unsupported: ['Windows/Linux SDK delivery', 'iOS/Android', 'universal binary', 'IME/wheel/gamepad', 'dynamic runtime modules'], sdkRuntimeValidation: 'required-on-consumer-host' }, null, 2)}\n`)
  return { library: 'lib/libquajs_native.dylib', staticLibrary: 'lib/libquajs_native.a', header: 'include/qua_native.h', config: 'native-module.json', open: 'qua_native_open', cancel: 'qua_native_cancel', tick: 'qua_native_tick', events: 'qua_native_poll', close: 'qua_native_close', destroy: 'qua_native_destroy', forceEviction: 'qua_native_abort', surface: 'qua_native_attach_metal_layer', example: 'examples/macos-parent.m' }
}
