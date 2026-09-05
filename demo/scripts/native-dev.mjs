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
import { readFileSync, watch } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(DEMO_ROOT, '..')
const CAPTURE_PATH = resolve(DEMO_ROOT, 'dist/native/dev/e2e-final.png')
const QUICKJS_APP_ASSET = 'assets/scripts/native-app.mjs'
const GENERATED_QUICKJS_APP_WATCH_PATH = 'scripts/native-app.mjs'
const ASSET_INDEX_PATH = resolve(DEMO_ROOT, 'dist/assets/index.json')
const NATIVE_FEATURES = 'native-window,native-audio-rodio,quickjs-rquickjs'
const e2e = process.argv.includes('--e2e')
const unsupportedArguments = process.argv.slice(2).filter(argument => argument !== '--e2e')

if (unsupportedArguments.length > 0) {
  throw new Error(`Unsupported native demo argument(s): ${unsupportedArguments.join(', ')}`)
}

process.chdir(DEMO_ROOT)

let nativeWindow
let nativeOutput = ''
let rebuilding = false
let rebuildQueued = false
let stopped = false
let debounceTimer
const watchers = []

try {
  await rebuildAndLaunch()
  if (e2e) {
    const code = await waitForExit(nativeWindow)
    if (code === 0) {
      await validateNativeE2eOutput(nativeOutput)
    }
    process.exitCode = code
  }
  else {
    installWatchers()
    console.log('Native demo is running and watching demo/src, demo/assets, and native renderer sources.')
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
    console.log('Building native TypeScript renderer contracts...')
    await buildNativeTypeScriptPackages()
    console.log('Bundling the complete native demo engine for QuickJS...')
    await run(resolveBin('vite'), [
      'build',
      '--config',
      resolve(DEMO_ROOT, 'vite.native-quickjs.config.ts'),
    ], { cwd: DEMO_ROOT })
    console.log('Building native demo assets and resident QuickJS app QPK...')
    await run(resolveBin('quack'), ['workspace:bundle', '--all'], { cwd: DEMO_ROOT })

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
    console.log(`Launching complete native demo from ${qpkPath}`)
    nativeOutput = ''
    if (e2e) {
      await rm(CAPTURE_PATH, { force: true })
    }
    nativeWindow = spawn('cargo', cargoArgs(), {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...compileEnv,
        // Native logs go to stderr, so they never interfere with the host-info
        // JSON this script parses from stdout. Override with QUA_NATIVE_LOG,
        // e.g. `QUA_NATIVE_LOG=trace` or `QUA_NATIVE_LOG=info,quajs_native_app::frame=trace`.
        QUA_NATIVE_LOG: process.env.QUA_NATIVE_LOG ?? 'debug',
        QUA_NATIVE_TARGET_BUNDLE_MANIFEST: emitted.manifestPath,
        QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
        QUA_NATIVE_RENDERER_WINDOW_DEV_QPK: qpkPath,
        QUA_NATIVE_RENDERER_WINDOW_DEV_QUICKJS_APP_ASSET: QUICKJS_APP_ASSET,
        ...(e2e
          ? {
              QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH: CAPTURE_PATH,
              QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E: '1',
            }
          : {
              QUA_NATIVE_RENDERER_WINDOW_DEV: '1',
              // CDP debug endpoint for external tooling (see scripts/native-control.mjs).
              QUA_NATIVE_RENDERER_CONTROL:
                process.env.QUA_NATIVE_RENDERER_CONTROL ?? '127.0.0.1:4789',
            }),
      },
      stdio: e2e ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    if (e2e) {
      nativeWindow.stdout.setEncoding('utf8')
      nativeWindow.stderr.setEncoding('utf8')
      nativeWindow.stdout.on('data', (chunk) => {
        nativeOutput += chunk
        process.stdout.write(chunk)
      })
      nativeWindow.stderr.on('data', chunk => process.stderr.write(chunk))
    }
    nativeWindow.on('error', error => console.error(`Native demo failed to start: ${error.message}`))
    if (!e2e) {
      console.log(`Native CDP endpoint: http://${process.env.QUA_NATIVE_RENDERER_CONTROL ?? '127.0.0.1:4789'}/json/version`)
      nativeWindow.on('exit', (code, signal) => {
        if (!stopped && !rebuilding) {
          console.log(`Native demo window closed (code=${code ?? 'none'}, signal=${signal ?? 'none'}). Waiting for a source change.`)
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
    resolve(REPO_ROOT, 'packages/native/ui-compiler/src'),
    resolve(REPO_ROOT, 'packages/native/crates/quajs_wgpu_renderer/src'),
    resolve(REPO_ROOT, 'packages/native/crates/quajs_native_app/src'),
    resolve(REPO_ROOT, 'packages/plugins/achievement/src'),
    resolve(REPO_ROOT, 'packages/plugins/backlog/src'),
    resolve(REPO_ROOT, 'packages/plugins/gallery/src'),
    resolve(REPO_ROOT, 'packages/plugins/settings/src'),
  ]) {
    watchers.push(watch(directory, { recursive: true }, (_event, filename) => {
      if (rebuilding || shouldIgnoreNativeDevWatchEvent(filename)) {
        return
      }
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        console.log(`Native demo reload: ${filename}`)
        void rebuildAndLaunch().catch(error => console.error(error))
      }, 180)
    }))
  }
  for (const file of ['qua.project.yaml', 'quack.workspace.ts']) {
    let contents = readFileSync(resolve(DEMO_ROOT, file), 'utf8')
    watchers.push(watch(resolve(DEMO_ROOT, file), () => {
      const next = readFileSync(resolve(DEMO_ROOT, file), 'utf8')
      if (next === contents) return
      contents = next
      if (rebuilding || stopped) {
        return
      }
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void rebuildAndLaunch().catch(error => console.error(error)), 180)
    }))
  }
}

function shouldIgnoreNativeDevWatchEvent(filename) {
  if (!filename) {
    return true
  }
  const normalized = filename.replaceAll('\\', '/')
  return normalized === GENERATED_QUICKJS_APP_WATCH_PATH
    || normalized.includes('/dist/')
    || normalized.endsWith('.tmp')
    || normalized.endsWith('.qpk')
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

async function buildNativeTypeScriptPackages() {
  for (const packageName of [
    '@quajs/native-ui',
    '@quajs/native-ui-compiler',
    '@quajs/plugin-achievement',
    '@quajs/plugin-backlog',
    '@quajs/plugin-gallery',
    '@quajs/plugin-settings',
    '@quajs/engine-native',
  ]) {
    const command = process.env.npm_execpath ? process.execPath : 'pnpm'
    const args = process.env.npm_execpath
      ? [process.env.npm_execpath, '--filter', packageName, 'build']
      : ['--filter', packageName, 'build']
    await run(command, args, { cwd: REPO_ROOT })
  }
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

async function validateNativeE2eOutput(output) {
  const e2ePrefix = 'Qua native demo e2e json: '
  const e2eLine = output.split(/\r?\n/).find(candidate => candidate.startsWith(e2ePrefix))
  if (!e2eLine) {
    throw new Error('Native demo E2E did not emit its complete-flow JSON report.')
  }
  const e2eReport = JSON.parse(e2eLine.slice(e2ePrefix.length))
  const windowPrefix = 'Qua native window smoke json: '
  const windowLine = output.split(/\r?\n/).find(candidate => candidate.startsWith(windowPrefix))
  if (!windowLine) {
    throw new Error('Native demo E2E did not emit its native window JSON report.')
  }
  const report = JSON.parse(windowLine.slice(windowPrefix.length))
  const failures = []
  const expectedSteps = [
    'title-menu',
    'story-main',
    'story-choice',
    'story-branch',
    'game-menu',
    'title-confirmation',
    'title-return',
    'settings',
    'settings-return',
    'gallery',
    'gallery-return',
  ]
  if (e2eReport.completed !== true) {
    failures.push('the complete demo flow did not finish')
  }
  if (JSON.stringify(e2eReport.steps) !== JSON.stringify(expectedSteps)) {
    failures.push(`unexpected E2E step order: ${JSON.stringify(e2eReport.steps)}`)
  }
  if (e2eReport.dialogueLineCount < 2 || e2eReport.dialogueAdvanceCount < 1) {
    failures.push('the story did not advance through real dialogue lines')
  }
  if (e2eReport.skipUsed !== true) {
    failures.push('the story did not reach its first choice through the real HUD skip control')
  }
  if (e2eReport.selectedChoiceId !== 'stealth') {
    failures.push(`the story choice was not selected through native input (${e2eReport.selectedChoiceId || 'none'})`)
  }
  if (e2eReport.settingsVisited !== true || e2eReport.galleryVisited !== true) {
    failures.push('settings and gallery were not both visited through the title menu')
  }
  // A panel that merely exists in the render graph can still be fully covered by
  // the app shell. Assert it actually reached the top of the UI overlay stack.
  if (e2eReport.settingsTopmost !== true) {
    failures.push('the settings panel was occluded instead of being the topmost UI overlay')
  }
  if (e2eReport.galleryTopmost !== true) {
    failures.push('the gallery panel was occluded instead of being the topmost UI overlay')
  }
  if (report.pointerProbeCount < expectedSteps.length || report.pointerIntentEmitCount < expectedSteps.length) {
    failures.push('the native render-command clicks did not all emit through the renderer intent bridge')
  }
  const occludedWithValidCapture = report.presentStatus === 'OccludedAfterRetry'
    && report.frameCapturePngSignatureValid === true
    && report.frameCaptureVisiblePixelCount > 0
  if ((report.presented !== true || report.presentStatus !== 'Presented') && !occludedWithValidCapture) {
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
  if (report.fontAtlasUploadedCount < 1 || report.fontAtlasTextDrawCount < 1) {
    failures.push('the demo did not render through the high-resolution font atlas')
  }
  if (report.fontAtlasErrorCount !== 0 || report.textureShutdownFontAtlasErrorCount !== 0) {
    failures.push('the native font atlas lifecycle reported an error')
  }
  if (report.shapedTextDrawCount < 1 || report.bitmapTextDrawCount !== 0) {
    failures.push('the final title frame did not use native OpenType shaping exclusively')
  }
  if (!report.fontAtlasResourceIds?.some(id => id === 'fonts:Noto Sans' || id.startsWith('fonts:Noto Sans@'))) {
    failures.push('the final title frame did not bind fonts:Noto Sans')
  }
  if (report.linearSampledTextureBindGroupCount < 1 || report.nearestSampledTextureBindGroupCount !== 0) {
    failures.push('the final title texture sampling was not exclusively linear')
  }
  if (report.audioBackendAppliedPlanCount < 1
    || report.audioBackendAppliedCommandCount < 2
    || report.audioBackendPeakActiveTrackCount < 1) {
    failures.push('the native audio backend did not project and play the demo BGM')
  }
  if (report.audioBackendActiveTrackCount !== 0) {
    failures.push('the native audio backend retained an active track after shutdown')
  }
  if (report.passCount < 1 || report.commandCount < 1 || report.submittedCommandBufferCount < 1) {
    failures.push('the final WGPU frame did not submit a non-empty render graph')
  }
  if (report.frameCaptureMimeType !== 'image/png'
    || report.frameCaptureByteCount <= 8
    || report.frameCapturePngSignatureValid !== true
    || report.frameCaptureVisiblePixelCount < 1
    || report.frameCaptureColoredPixelCount < 1) {
    failures.push('the final title frame capture is not a valid visible PNG')
  }
  if (report.frameCaptureWidth !== report.physicalWidth
    || report.frameCaptureHeight !== report.physicalHeight) {
    failures.push('frame capture dimensions do not match the native WGPU target')
  }
  if (report.physicalWidth !== report.logicalWidth * report.devicePixelRatio
    || report.physicalHeight !== report.logicalHeight * report.devicePixelRatio) {
    failures.push('native logical/window/device-pixel coordinate projection is inconsistent')
  }
  const captureBytes = await readFile(CAPTURE_PATH).catch(() => undefined)
  if (!captureBytes || captureBytes.length !== report.frameCaptureByteCount) {
    failures.push('the final native frame capture artifact is missing or has an unexpected byte count')
  }
  else if (!captureBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    failures.push('the final native frame capture artifact does not have a valid PNG signature')
  }
  if (failures.length > 0) {
    throw new Error(`Native demo E2E failed: ${failures.join('; ')}.`)
  }
  console.log(`Native demo E2E validated ${e2eReport.dialogueLineCount} dialogue lines, choice ${e2eReport.selectedChoiceId}, settings, gallery, ${report.passCount} WGPU pass(es), and a ${report.frameCaptureWidth}x${report.frameCaptureHeight} PNG readback.`)
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
