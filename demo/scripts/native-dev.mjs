import { NATIVE_TARGET_BOOTSTRAP } from '@quajs/native-contracts'
import { ACHIEVEMENT_NATIVE_RENDERER_ENTRY } from '@quajs/plugin-achievement/native'
import { BACKLOG_NATIVE_RENDERER_ENTRY } from '@quajs/plugin-backlog/native'
import { GALLERY_NATIVE_RENDERER_ENTRY } from '@quajs/plugin-gallery/native'
import { SETTINGS_NATIVE_RENDERER_ENTRY } from '@quajs/plugin-settings/native'
import {
  createQuaProjectNativeArtifactPlans,
  emitQuaProjectNativeTargetBundleManifest,
  loadQuaProjectConfig,
} from '@quajs/quack/project'
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(DEMO_ROOT, '..')
const FRAME_PATH = resolve(DEMO_ROOT, 'dist/native/dev/frame.json')
const ASSET_INDEX_PATH = resolve(DEMO_ROOT, 'dist/assets/index.json')
const NATIVE_FEATURES = 'native-window,quickjs-rquickjs'
const smoke = process.argv.includes('--smoke')
const once = process.argv.includes('--once') || smoke
const requestedPanel = process.argv.find(argument => argument.startsWith('--panel='))?.slice('--panel='.length)
const panel = requestedPanel || (smoke ? 'settings' : undefined)

process.chdir(DEMO_ROOT)

let nativeWindow
let nativeSmokeOutput = ''
let rebuilding = false
let rebuildQueued = false
let stopped = false
let debounceTimer
const watchers = []

try {
  await rebuildAndLaunch()
  if (once) {
    const code = await waitForExit(nativeWindow)
    if (smoke && code === 0) {
      validateNativeSmokeOutput(nativeSmokeOutput)
    }
    process.exitCode = code
  }
  else {
    installWatchers()
    console.log('Native renderer dev is watching demo/src, demo/assets, and native renderer sources.')
    await new Promise(resolveDone => process.once('native-dev-stop', resolveDone))
  }
}
catch (error) {
  console.error(error)
  process.exitCode = 1
}
finally {
  stopped = true
  clearTimeout(debounceTimer)
  for (const watcher of watchers) {
    watcher.close()
  }
  await stopNativeWindow()
}

async function rebuildAndLaunch() {
  if (rebuilding) {
    rebuildQueued = true
    return
  }
  rebuilding = true
  try {
    await stopNativeWindow()
    console.log('Building native demo assets...')
    await run(resolveBin('quack'), ['workspace:bundle', '--all'], { cwd: DEMO_ROOT })
    console.log('Projecting QuaEngine state into a native renderer frame...')
    await run(resolveBin('vite'), [
      'build',
      '--config',
      resolve(DEMO_ROOT, 'vite.native.config.ts'),
    ], { cwd: DEMO_ROOT })
    await run(process.execPath, [
      resolve(DEMO_ROOT, 'dist/native/dev-shell/frame.mjs'),
      FRAME_PATH,
    ], {
      cwd: DEMO_ROOT,
      env: {
        ...process.env,
        ...(panel ? { QUA_NATIVE_DEMO_PANEL: panel } : {}),
      },
    })
    if (panel) {
      await validateNativeFeatureFrame(panel)
    }

    const project = await loadQuaProjectConfig({ cwd: DEMO_ROOT })
    const plan = selectNativePlan(project)
    const compileEnv = nativeCompileEnv(project, plan)
    const hostInfo = await readNativeHostInfo(compileEnv)
    const emitted = await emitQuaProjectNativeTargetBundleManifest(plan, {
      manifestPath: resolve(DEMO_ROOT, plan.artifactDir, 'target-bundle-manifest.json'),
      nativeRenderer: {
        packageName: hostInfo.renderer.packageName,
        version: hostInfo.renderer.version,
        backend: hostInfo.renderer.backend,
        ...(hostInfo.renderer.backendVersion ? { backendVersion: hostInfo.renderer.backendVersion } : {}),
        capabilityIds: hostInfo.renderer.capabilities.map(capability => capability.id),
        capabilityManifestHash: hostInfo.renderer.capabilityManifestHash,
      },
      nativeRuntime: { ...hostInfo.runtime },
      dependencies: [
        '@quajs/engine',
        '@quajs/pipeline',
        '@quajs/character',
        '@quajs/plugin-animation',
        '@quajs/plugin-achievement',
        '@quajs/plugin-audio',
        '@quajs/plugin-background',
        '@quajs/plugin-backlog',
        '@quajs/plugin-fonts',
        '@quajs/plugin-gallery',
        '@quajs/plugin-settings',
        '@quajs/story-graph',
        ...NATIVE_TARGET_BOOTSTRAP.coreAdapters,
      ],
      rendererEntries: [{
        specifier: '@quajs/native-renderer/builtin',
        target: 'native',
      }, ...[
        ACHIEVEMENT_NATIVE_RENDERER_ENTRY,
        BACKLOG_NATIVE_RENDERER_ENTRY,
        GALLERY_NATIVE_RENDERER_ENTRY,
        SETTINGS_NATIVE_RENDERER_ENTRY,
      ].map(specifier => ({ specifier, target: 'native' }))],
    })
    const qpkPath = await resolveLatestQpk(plan.platform)
    console.log(`Launching native renderer with ${qpkPath}`)
    nativeSmokeOutput = ''
    nativeWindow = spawn('cargo', cargoArgs(), {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...compileEnv,
        QUA_NATIVE_TARGET_BUNDLE_MANIFEST: emitted.manifestPath,
        QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: FRAME_PATH,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpkPath,
        ...(smoke
          ? { QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2' }
          : { QUA_NATIVE_RENDERER_WINDOW_DEV: '1' }),
      },
      stdio: smoke ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    if (smoke) {
      nativeWindow.stdout.setEncoding('utf8')
      nativeWindow.stderr.setEncoding('utf8')
      nativeWindow.stdout.on('data', (chunk) => {
        nativeSmokeOutput += chunk
        process.stdout.write(chunk)
      })
      nativeWindow.stderr.on('data', chunk => process.stderr.write(chunk))
    }
    nativeWindow.on('error', error => console.error(`Native renderer failed to start: ${error.message}`))
    if (!once) {
      nativeWindow.on('exit', (code, signal) => {
        if (!stopped && !rebuilding) {
          console.log(`Native renderer window closed (code=${code ?? 'none'}, signal=${signal ?? 'none'}). Waiting for a source change.`)
        }
      })
    }
  }
  finally {
    rebuilding = false
    if (rebuildQueued && !stopped) {
      rebuildQueued = false
      await rebuildAndLaunch()
    }
  }
}

function installWatchers() {
  for (const directory of [
    resolve(DEMO_ROOT, 'src'),
    resolve(DEMO_ROOT, 'assets'),
    resolve(REPO_ROOT, 'packages/native/engine-native/src'),
    resolve(REPO_ROOT, 'packages/native/crates/quajs_wgpu_renderer/src'),
    resolve(REPO_ROOT, 'packages/native/crates/quajs_native_app/src'),
    resolve(REPO_ROOT, 'packages/plugins/achievement/src'),
    resolve(REPO_ROOT, 'packages/plugins/backlog/src'),
    resolve(REPO_ROOT, 'packages/plugins/gallery/src'),
    resolve(REPO_ROOT, 'packages/plugins/settings/src'),
  ]) {
    watchers.push(watch(directory, { recursive: true }, (_event, filename) => {
      if (!filename || filename.includes('/dist/') || filename.endsWith('.tmp')) {
        return
      }
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        console.log(`Native dev reload: ${filename}`)
        void rebuildAndLaunch().catch(error => console.error(error))
      }, 180)
    }))
  }
  for (const file of ['qua.project.yaml', 'quack.workspace.ts']) {
    watchers.push(watch(resolve(DEMO_ROOT, file), () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void rebuildAndLaunch().catch(error => console.error(error)), 180)
    }))
  }
}

async function validateNativeFeatureFrame(panelName) {
  if (panelName === 'typewriter') {
    const frame = JSON.parse(await readFile(FRAME_PATH, 'utf8'))
    const text = frame.view?.dialogue?.text
    const fullText = 'The Tokyo uplink is down. Mara, confirm the last human signal.'
    if (typeof text !== 'string' || text.length <= 0 || text.length >= fullText.length || !fullText.startsWith(text)) {
      throw new Error('Native demo frame did not project a partial typewriter dialogue line.')
    }
    console.log(`Native demo frame validated typewriter projection (${text.length}/${fullText.length} code units).`)
    return
  }
  if (panelName === 'effects') {
    const frame = JSON.parse(await readFile(FRAME_PATH, 'utf8'))
    const effect = frame.view?.effects?.find?.(entry => entry?.id === 'demo.native.flash')
    if (effect?.type !== 'flash' || effect?.opacity !== 0.24) {
      throw new Error('Native demo frame did not project the expected engine effect.')
    }
    console.log('Native demo frame validated engine effect projection.')
    return
  }
  if (panelName === 'transition') {
    const frame = JSON.parse(await readFile(FRAME_PATH, 'utf8'))
    if (frame.view?.sceneTransition?.type !== 'wipe' || frame.view?.sceneTransition?.progress !== 0.5) {
      throw new Error('Native demo frame did not project the expected scene transition.')
    }
    console.log('Native demo frame validated scene transition projection.')
    return
  }
  const expectedSurface = {
    achievement: 'plugin-achievement/native-board',
    backlog: 'plugin-backlog/native',
    gallery: 'plugin-gallery/native',
    settings: 'plugin-settings/native',
  }[panelName]
  if (!expectedSurface) {
    throw new Error(`Unsupported native demo panel "${panelName}".`)
  }
  const frame = JSON.parse(await readFile(FRAME_PATH, 'utf8'))
  const overlays = frame.view?.ui?.overlays
  const found = Array.isArray(overlays)
    && overlays.some(overlay => overlay?.surface?.key === expectedSurface)
  if (!found) {
    throw new Error(`Native demo frame did not project expected surface "${expectedSurface}".`)
  }
  console.log(`Native demo frame validated feature surface ${expectedSurface}.`)
}

async function stopNativeWindow() {
  const child = nativeWindow
  nativeWindow = undefined
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGTERM')
  await Promise.race([
    waitForExit(child),
    new Promise(resolveDelay => setTimeout(resolveDelay, 1500)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
  }
}

async function readNativeHostInfo(compileEnv) {
  const output = await run('cargo', cargoArgs(), {
    cwd: REPO_ROOT,
    env: { ...process.env, ...compileEnv },
    capture: true,
  })
  const hostInfoLine = output.stdout
    .split(/\r?\n/)
    .find(line => line.trim().startsWith('{') && line.includes('"renderer"'))
  if (!hostInfoLine) {
    throw new Error(`Native app did not report host info. stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`)
  }
  return JSON.parse(hostInfoLine)
}

function selectNativePlan(project) {
  const platform = process.platform === 'darwin'
    ? 'macos'
    : process.platform === 'win32' ? 'windows' : 'linux'
  const plan = createQuaProjectNativeArtifactPlans(project)
    .find(candidate => candidate.profile === 'debug' && candidate.platform === platform)
  if (!plan) {
    throw new Error(`qua.project.yaml does not define a native debug plan for ${platform}.`)
  }
  return plan
}

function nativeCompileEnv(project, plan) {
  return {
    QUA_NATIVE_APP_NAME: project.name,
    QUA_NATIVE_BUNDLE_ID: plan.app.bundleId,
    QUA_NATIVE_APP_VERSION: plan.app.version,
    QUA_NATIVE_BUILD_NUMBER: plan.app.buildNumber,
  }
}

async function resolveLatestQpk(platform) {
  const index = JSON.parse(await readFile(ASSET_INDEX_PATH, 'utf8'))
  const targetName = `native-${platform}`
  const filename = index.targets?.[targetName]?.filename
  if (typeof filename !== 'string' || !filename.endsWith('.qpk')) {
    throw new Error(`Quack did not emit targets.${targetName}.filename in ${ASSET_INDEX_PATH}.`)
  }
  return resolve(DEMO_ROOT, 'dist/assets', filename)
}

function cargoArgs() {
  return [
    'run',
    '--quiet',
    '--manifest-path',
    'packages/native/Cargo.toml',
    '-p',
    'quajs_native_app',
    '--features',
    NATIVE_FEATURES,
  ]
}

function resolveBin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : ''
  return resolve(DEMO_ROOT, 'node_modules/.bin', `${name}${suffix}`)
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const capture = options.capture === true
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => stdout += chunk)
      child.stderr.on('data', chunk => stderr += chunk)
    }
    child.on('error', rejectRun)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun({ stdout, stderr })
      }
      else {
        rejectRun(new Error(`${command} exited with code=${code ?? 'none'} signal=${signal ?? 'none'}${stderr ? `\n${stderr}` : ''}`))
      }
    })
  })
}

function waitForExit(child) {
  if (!child) {
    return Promise.resolve(0)
  }
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode)
  }
  return new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
}

function validateNativeSmokeOutput(output) {
  const prefix = 'Qua native window smoke json: '
  const line = output.split(/\r?\n/).find(candidate => candidate.startsWith(prefix))
  if (!line) {
    throw new Error('Native renderer smoke did not emit its JSON report.')
  }
  const report = JSON.parse(line.slice(prefix.length))
  const failures = []
  if (report.presented !== true || report.presentStatus !== 'Presented') {
    failures.push(`surface was not presented (${report.presentStatus || 'unknown'})`)
  }
  if (report.textureUploadErrorCount !== 0) {
    failures.push(`${report.textureUploadErrorCount} texture upload error(s)`)
  }
  if (report.textureUploadUploadedCount < 1 && report.textureUploadAlreadyResidentCount < 1) {
    failures.push('no QPK texture reached the WGPU resident set')
  }
  if (report.textureShutdownReleasedCount < 1) {
    failures.push('no resident WGPU texture was released during shutdown')
  }
  if (report.passCount < 1 || report.commandCount < 1 || report.submittedCommandBufferCount < 1) {
    failures.push('the WGPU frame did not submit a non-empty render graph')
  }
  if (report.frameCaptureMimeType !== 'image/png') {
    failures.push(`frame capture returned ${report.frameCaptureMimeType || 'no MIME type'} instead of image/png`)
  }
  if (report.frameCaptureByteCount <= 8 || report.frameCapturePngSignatureValid !== true) {
    failures.push('frame capture did not return a valid encoded PNG')
  }
  if (report.frameCaptureVisiblePixelCount < 1 || report.frameCaptureColoredPixelCount < 1) {
    failures.push('frame capture contains no visible rendered scene content')
  }
  if (report.frameCaptureWidth !== report.physicalWidth
    || report.frameCaptureHeight !== report.physicalHeight) {
    failures.push('frame capture dimensions do not match the native WGPU target')
  }
  if (report.physicalWidth !== report.logicalWidth * report.devicePixelRatio
    || report.physicalHeight !== report.logicalHeight * report.devicePixelRatio) {
    failures.push('native logical/window/device-pixel coordinate projection is inconsistent')
  }
  if (failures.length > 0) {
    throw new Error(`Native renderer smoke failed: ${failures.join('; ')}.`)
  }
  console.log(`Native renderer smoke validated ${report.textureUploadAlreadyResidentCount || report.textureUploadUploadedCount} resident QPK texture(s), ${report.passCount} WGPU pass(es), and a ${report.frameCaptureWidth}x${report.frameCaptureHeight} PNG readback.`)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopped) {
      return
    }
    stopped = true
    process.emit('native-dev-stop')
  })
}
