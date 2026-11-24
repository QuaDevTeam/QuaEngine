import type { TargetBundleNativeRendererInfo, TargetBundleNativeRuntimeInfo } from '@quajs/native-contracts'
import type { NormalizedQuaProjectConfig } from '../project'
import type { QuaProductionProgressListener } from './progress'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { platform as hostPlatform } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createTargetCoreSelection } from '@quajs/native-contracts'
import { QuackBundler } from '../core/bundler'
import { loadQuaProjectConfig } from '../project'
import { createQuaProjectNativeArtifactPlans, emitQuaProjectNativeTargetBundleManifest } from '../project-native'
import { emitQuaTargetBundleManifest } from '../project-target-bundle'
import { readQpkSummary } from '../qpk-reader'
import { WorkspaceManager } from '../workspace/workspace'
import { exportIosDeviceIpa } from './ios-export'
import { macosIcon, macosInfoPlist, signMacos } from './macos'
import { androidTools, buildAndroidApk, buildIosApp, IOS_DEPLOYMENT_TARGET } from './mobile'
import { buildRunner, productionEnvironment } from './process'
import { productionProgress } from './progress'
import { buildProductionVite } from './vite'

export interface QuaProductionBuildOptions {
  cwd: string
  target: 'web' | 'native'
  platform?: 'macos' | 'windows' | 'linux' | 'ios' | 'ios-simulator' | 'android'
  configPath?: string
  signal?: AbortSignal
  onLog?: (text: string) => void
  onProgress?: QuaProductionProgressListener
  env?: NodeJS.ProcessEnv
}
export interface QuaProductionBuildResult {
  target: 'web' | 'native'
  artifact: string
  manifest: string
  signing?: 'adhoc' | 'developer-id'
  notarized?: boolean
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Build saved project sources. Staging/rename prevents failed builds replacing a release. */
export async function buildQuaProjectProduction(options: QuaProductionBuildOptions): Promise<QuaProductionBuildResult> {
  const progress = productionProgress(options.onProgress)
  progress('prepare', 'running')
  const root = resolve(options.cwd)
  const project = await loadQuaProjectConfig({ cwd: root, configPath: options.configPath })
  const env = productionEnvironment(options.env ?? process.env)
  const log = options.onLog ?? (() => {})
  const run = buildRunner(root, env, options.signal, log)
  options.signal?.throwIfAborted()
  if (options.target === 'web') {
    if (!project.targets.web.enabled)
      throw new Error('Web target is disabled.')
    const output = resolve(root, 'dist/web-production')
    await mkdir(output, { recursive: true })
    const stage = join(output, `.build-${randomUUID()}`)
    await mkdir(stage)
    try {
      const graph = join(stage, 'graph.json')
      const artifact = join(output, `${safeName(project.version)}-${Date.now()}`)
      const files = join(stage, 'site')
      progress('prepare', 'completed')
      progress('compile', 'running')
      log('Building Web (production)…\n')
      await buildProductionVite(root, undefined, files, graph, run)
      progress('compile', 'completed')
      progress('manifest', 'running')
      const dependencies: string[] = JSON.parse(await readFile(graph, 'utf8'))
      await emitQuaTargetBundleManifest({ artifactDir: files, expectedTarget: 'web', manifest: {
        schemaVersion: 1,
        profile: 'release',
        platform: 'web',
        app: { bundleId: project.bundleId, version: project.version, buildNumber: String(Date.now()) },
        ...createTargetCoreSelection('web'),
        dependencies,
        projectGraphs: [{ id: 'web.release.post-bundle', kind: 'post-bundle', references: dependencies }],
      } })
      progress('manifest', 'completed')
      progress('publish', 'running')
      options.signal?.throwIfAborted()
      await rename(files, artifact)
      progress('publish', 'completed')
      return { target: 'web', artifact, manifest: join(artifact, 'target-bundle-manifest.json') }
    }
    finally { await rm(stage, { recursive: true, force: true }) }
  }
  if (options.target !== 'native')
    throw new Error('Expected web or native production target.')
  const os = hostPlatform()
  const hostDesktop = os === 'darwin' ? 'macos' : os === 'win32' ? 'windows' : os
  const platform = options.platform ?? hostDesktop
  if (!['macos', 'windows', 'linux', 'ios', 'ios-simulator', 'android'].includes(platform))
    throw new Error(`Unsupported native distribution platform: ${platform}`)
  const ios = platform === 'ios' || platform === 'ios-simulator'
  const android = platform === 'android'
  const portable = platform === 'windows' || platform === 'linux'
  if (portable && platform !== hostDesktop)
    throw new Error(`Build the ${platform} desktop application on a ${platform} host.`)
  if ((ios || platform === 'macos') && hostDesktop !== 'macos')
    throw new Error('Apple application distribution requires macOS with Xcode.')
  const native = project.targets.native
  const plan = createQuaProjectNativeArtifactPlans(project).find(plan => plan.platform === (ios ? 'ios' : platform) && plan.profile === 'release')
  if (!native || !plan)
    throw new Error(`Enable targets.native with platform ${ios ? 'ios' : platform} and profile release.`)
  if (ios || platform === 'macos')
    validateAppleMetadata(project)
  const sdk = android ? await androidTools(env, native.app) : undefined
  const build = native.build
  if (!build.cargoManifest || !build.viteConfig || !build.appAsset)
    throw new Error('Native production requires build.cargoManifest, build.viteConfig and build.appAsset in qua.project.yaml.')
  if (!build.cargoFeatures?.includes('native-window') || !build.cargoFeatures.includes('javascriptcore'))
    throw new Error('Native production requires cargoFeatures: [native-window, javascriptcore].')
  const icon = native.app.icon ?? project.icons.source
  if (!icon || !await stat(resolve(root, icon)).then(file => file.isFile()).catch(() => false))
    throw new Error('Native production requires a local app.icon or icons.source file.')
  const artifact = resolve(root, platform === 'ios-simulator' ? `${plan.artifactDir}-simulator` : plan.artifactDir)
  if (await stat(artifact).catch(() => undefined))
    throw new Error(`Release already exists: ${artifact}. Increase app.version/buildNumber or remove that release deliberately.`)
  await mkdir(dirname(artifact), { recursive: true })
  const lock = `${artifact}.lock`
  await mkdir(lock) // Exclusive lock also protects concurrent editor/CLI builds.
  const stage = join(dirname(artifact), `.build-${randomUUID()}`)
  try {
    await mkdir(stage)
    const appName = portable ? 'Game' : `${safeName(project.name)}.app`
    const app = join(stage, appName)
    const resources = android ? join(stage, 'apk-assets/resources') : join(app, portable ? 'resources' : ios ? 'QuaContent' : 'Contents/Resources')
    const executable = join(app, portable ? (platform === 'windows' ? 'game.exe' : 'game') : ios ? 'game' : 'Contents/MacOS/game')
    await mkdir(resources, { recursive: true })
    if (!android)
      await mkdir(dirname(executable), { recursive: true })
    const graphPath = join(stage, 'graph.json')
    progress('prepare', 'completed')
    progress('compile', 'running')
    log('Building native JavaScriptCore application (production)…\n')
    await buildProductionVite(root, resolve(root, build.viteConfig), undefined, graphPath, run)
    const dependencies: string[] = JSON.parse(await readFile(graphPath, 'utf8'))
    progress('compile', 'completed')
    progress('bundle', 'running')
    const workspace = new WorkspaceManager(root)
    await workspace.loadConfig(build.workspaceConfig ? resolve(root, build.workspaceConfig) : undefined, { projectConfig: options.configPath })
    const bundles: { file: string, sha256: string }[] = []
    let hasApp = false
    const buildOrder = workspace.getBundlesBuildOrder()
    for (const [index, bundle] of buildOrder.entries()) {
      options.signal?.throwIfAborted()
      progress('bundle', 'running', bundle.displayName || bundle.name, { completed: index, total: buildOrder.length })
      log(`Bundling ${bundle.name}…\n`)
      const directory = join(stage, `bundle-${index}`)
      await mkdir(directory)
      const config = workspace.createBundleConfig(bundle.name)
      await new QuackBundler({ ...config, output: join(directory, 'content.qpk'), format: 'qpk', assetTargets: [], assetTarget: { ...plan.assetTarget, name: `native-${plan.platform}`, platform: 'native' }, compression: { algorithm: 'none' }, encryption: { enabled: false }, versioning: { bundleVersion: 1, buildNumber: native.app.buildNumber, incrementVersion: false, versionFile: join(directory, 'version.json') } }).bundle(bundle.name)
      const files = (await readdir(directory)).filter(file => file.endsWith('.qpk'))
      if (files.length !== 1)
        throw new Error(`Expected one native QPK for ${bundle.name}.`)
      const source = join(directory, files[0])
      const summary = await readQpkSummary(source)
      if (summary.errors.length || summary.header.flags !== 0)
        throw new Error(`Native QPK is invalid: ${summary.errors.join('; ')}`)
      hasApp ||= summary.assets.some(asset => asset.path === build.appAsset)
      const file = `content-${index}.qpk`
      await copyFile(source, join(resources, file))
      bundles.push({ file, sha256: sha256(await readFile(join(resources, file))) })
      await rm(directory, { recursive: true })
      progress('bundle', 'running', bundle.displayName || bundle.name, { completed: index + 1, total: buildOrder.length })
    }
    if (!hasApp)
      throw new Error(`Native appAsset ${build.appAsset} was not emitted into any QPK.`)
    progress('bundle', 'completed')
    const compileEnv = { ...env, QUA_NATIVE_APP_NAME: project.name, QUA_NATIVE_BUNDLE_ID: native.app.bundleId, QUA_NATIVE_APP_VERSION: native.app.version, QUA_NATIVE_BUILD_NUMBER: native.app.buildNumber, ...(hostDesktop === 'macos' && { MACOSX_DEPLOYMENT_TARGET: native.distribution.macos?.minimumSystemVersion ?? '11.0' }) }
    const cargoArgs = ['build', '--release', '--manifest-path', resolve(root, build.cargoManifest), '-p', build.cargoPackage ?? 'quajs_native_app', '--features', [...new Set([...build.cargoFeatures, 'native-log-strip-release'])].join(','), '--message-format=json-render-diagnostics']
    const compile = async (environment: NodeJS.ProcessEnv, target?: string): Promise<string> => {
      const output = await run('cargo', [...cargoArgs, ...hostOrTargetArgs(target)], environment)
      const records = output.split('\n').flatMap((line) => {
        try {
          return [JSON.parse(line)]
        }
        catch { return [] }
      })
      const record = records.reverse().find(record => record.reason === 'compiler-artifact' && (target === 'aarch64-linux-android' ? record.target.name === 'quajs_native' && record.target.kind.includes('cdylib') : record.executable))
      const path = target === 'aarch64-linux-android' ? record?.filenames.find((name: string) => name.endsWith('.so')) : record?.executable
      if (typeof path !== 'string')
        throw new Error('Cargo did not emit a native executable.')
      return path
    }
    log('Compiling native release runtime…\n')
    progress('runtime', 'running')
    const probe = await compile(compileEnv)
    const hostOutput = await run(probe, ios || android ? ['--describe-mobile-distributions'] : [], compileEnv)
    const descriptorRecords = hostOutput.split('\n').flatMap((line) => {
      try {
        return [JSON.parse(line)]
      }
      catch { return [] }
    })
    const host = descriptorRecords.find(record => record.renderer && record.runtime)
    if (!host)
      throw new Error('Native executable did not report renderer/runtime metadata.')
    const mobileJsc = descriptorRecords.find(record => record.mobileJsc)?.mobileJsc
    const targetRuntime = { ...host.runtime }
    if (ios || android) {
      const distribution = mobileJsc?.[ios ? 'ios' : 'android']
      if (!distribution?.runtimeVersion || (sdk && sha256(await readFile(sdk.jscLibrary)) !== distribution.librarySha256))
        throw new Error('Mobile JavaScriptCore distribution does not match the native runtime descriptor.')
      targetRuntime.jscVersion = distribution.runtimeVersion
    }
    progress('runtime', 'completed')
    progress('manifest', 'running')
    const renderer: TargetBundleNativeRendererInfo = { ...host.renderer, capabilityIds: host.renderer.capabilities.map((item: { id: string }) => item.id) }
    // Project file paths do not belong in a relocatable manifest.
    const packagedIcon = portable ? `icons/${basename(icon)}` : android ? 'res/drawable/icon.png' : ios ? 'AppIcon' : 'AppIcon.icns'
    const emitted = await emitQuaProjectNativeTargetBundleManifest({ ...plan, app: { ...plan.app, icon: packagedIcon }, artifactDir: resources }, {
      nativeRenderer: renderer,
      nativeRuntime: targetRuntime as TargetBundleNativeRuntimeInfo,
      dependencies,
      rendererEntries: [{ specifier: '@quajs/native-renderer/builtin', target: 'native' }],
    })
    progress('manifest', 'completed')
    progress('executable', 'running')
    const launch = Buffer.from(`${JSON.stringify({ appAsset: build.appAsset, bundles, targetManifestSha256: sha256(await readFile(emitted.manifestPath)) }, null, 2)}\n`)
    await writeFile(join(resources, 'native-app.json'), launch)
    log('Pinning packaged resources into the executable…\n')
    const pinned = { ...compileEnv, QUA_NATIVE_DISTRIBUTION_SHA256: sha256(launch) }
    let result: QuaProductionBuildResult
    if (sdk) {
      const library = await compile({ ...pinned, ...sdk.compileEnv }, 'aarch64-linux-android')
      progress('executable', 'completed')
      const apk = await buildAndroidApk(project, stage, resolve(root, icon), library, sdk, run, env)
      await copyFile(emitted.manifestPath, join(stage, 'target-bundle-manifest.json'))
      await rm(dirname(resources), { recursive: true })
      result = { target: 'native', artifact: join(artifact, apk), manifest: join(artifact, 'target-bundle-manifest.json') }
    }
    else if (ios) {
      const simulator = platform === 'ios-simulator'
      const triple = simulator ? (process.arch === 'arm64' ? 'aarch64-apple-ios-sim' : 'x86_64-apple-ios') : 'aarch64-apple-ios'
      await copyFile(await compile({ ...pinned, IPHONEOS_DEPLOYMENT_TARGET: IOS_DEPLOYMENT_TARGET }, triple), executable)
      await chmod(executable, 0o755)
      progress('executable', 'completed')
      const relativeApp = await buildIosApp(project, stage, appName, resolve(root, icon), simulator, run)
      const ipa = !simulator && await exportIosDeviceIpa(stage, relativeApp, native.app.bundleId, env, run)
      result = { target: 'native', artifact: join(artifact, ipa ? 'Game.ipa' : simulator ? appName : 'Game.xcarchive'), manifest: join(artifact, relativeApp, 'QuaContent/target-bundle-manifest.json') }
    }
    else if (portable) {
      await copyFile(await compile(pinned), executable)
      await chmod(executable, 0o755)
      progress('executable', 'completed')
      progress('icon', 'running')
      await mkdir(join(resources, 'icons'))
      await copyFile(resolve(root, icon), join(resources, packagedIcon))
      progress('icon', 'completed')
      result = { target: 'native', artifact: join(artifact, appName), manifest: join(artifact, appName, 'resources/target-bundle-manifest.json') }
    }
    else {
      await copyFile(await compile(pinned), executable)
      await chmod(executable, 0o755)
      progress('executable', 'completed')
      progress('icon', 'running')
      await writeFile(join(app, 'Contents/Info.plist'), macosInfoPlist(project))
      await macosIcon(resolve(root, icon), resources, run)
      progress('icon', 'completed')
      log('Signing macOS application…\n')
      const signed = await signMacos(project, root, app, run, options.onProgress)
      await rm(join(stage, 'entitlements.plist'), { force: true })
      result = { target: 'native', artifact: join(artifact, appName), manifest: join(artifact, appName, 'Contents/Resources/target-bundle-manifest.json'), ...signed }
    }
    progress('publish', 'running')
    await rm(graphPath)
    await writeFile(join(stage, 'build-result.json'), `${JSON.stringify(result, null, 2)}\n`)
    options.signal?.throwIfAborted()
    await rename(stage, artifact)
    progress('publish', 'completed')
    log(`Application ready: ${result.artifact}\n`)
    return result
  }
  finally {
    await rm(stage, { recursive: true, force: true })
    await rm(lock, { recursive: true, force: true })
  }
}

function safeName(name: string): string {
  return basename([...name].map(character => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character).join('')).replace(/^\.+|\.+$/gu, '') || 'Game'
}

function validateAppleMetadata(project: NormalizedQuaProjectConfig): void {
  const app = project.targets.native!.app
  if (!/^[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/iu.test(app.bundleId) || !/^\d+(?:\.\d+){0,2}$/u.test(app.version) || !/^\d+(?:\.\d+){0,2}$/u.test(app.buildNumber))
    throw new Error('Apple distribution needs a reverse-DNS bundleId and numeric app.version/buildNumber (up to three components).')
}

function hostOrTargetArgs(target?: string): string[] {
  const entry = target === 'aarch64-linux-android' ? ['--lib'] : ['--bin', 'quajs_native_app']
  return target ? [...entry, '--target', target] : []
}
