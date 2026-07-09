import type {
  NativeHostApiRequest,
  NativeHostApiResponse,
  QuaNativeHostApi,
  QuaNativeHostInfo,
  TargetBundleManifest,
} from '@quajs/native-contracts'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createNativeHostApiFromBridge } from '@quajs/native-contracts'

interface PendingBridgeRequest {
  reject: (error: Error) => void
  resolve: (response: NativeHostApiResponse) => void
}

export interface RealNativeQuickJsBridge {
  close: () => Promise<void>
  host: QuaNativeHostApi
  requests: NativeHostApiRequest[]
  startupHostInfo: QuaNativeHostInfo
}

export interface CreateRealNativeQuickJsBridgeOptions {
  targetBundleManifest?: TargetBundleManifest
}

const CURRENT_DIR = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(CURRENT_DIR, '../../../../..')
const NATIVE_CARGO_ARGS = [
  'run',
  '--quiet',
  '--manifest-path',
  'packages/native/Cargo.toml',
  '-p',
  'quajs_native_app',
  '--features',
  'quickjs-rquickjs',
]
const RENDERER_SMOKE_JSON_PREFIX = 'Qua native renderer smoke json: '

export async function createRealNativeQuickJsBridge(
  options: CreateRealNativeQuickJsBridgeOptions = {},
): Promise<RealNativeQuickJsBridge> {
  const manifestPath = options.targetBundleManifest
    ? await writeNativeTargetBundleManifest(options.targetBundleManifest)
    : undefined
  const child = spawnNativeApp({
    QUA_NATIVE_QUICKJS_BRIDGE: '1',
    ...(manifestPath ? { QUA_NATIVE_TARGET_BUNDLE_MANIFEST: manifestPath } : {}),
  })
  const stderr: string[] = []
  const pending: PendingBridgeRequest[] = []
  const requests: NativeHostApiRequest[] = []
  let closed = false

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => stderr.push(chunk))
  child.on('error', (error) => {
    closed = true
    rejectPending(pending, new Error(`Native QuickJS bridge failed to start: ${error.message}`))
  })

  const stdout = createInterface({ input: child.stdout })
  stdout.on('line', (line) => {
    const next = pending.shift()
    if (!next)
      return
    try {
      next.resolve(JSON.parse(line) as NativeHostApiResponse)
    }
    catch (error) {
      next.reject(new Error(`Native QuickJS bridge returned invalid JSON: ${String(error)}. Line: ${line}`))
    }
  })

  child.on('exit', (code, signal) => {
    closed = true
    const error = new Error(`Native QuickJS bridge exited before replying: code=${code ?? 'none'} signal=${signal ?? 'none'} stderr=${stderr.join('').trim()}`)
    rejectPending(pending, error)
  })

  const dispatch = (request: NativeHostApiRequest): Promise<NativeHostApiResponse> => {
    if (closed) {
      return Promise.reject(new Error(`Native QuickJS bridge is closed. stderr=${stderr.join('').trim()}`))
    }
    requests.push(request)
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject })
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error)
          return
        const index = pending.findIndex(entry => entry.resolve === resolve)
        if (index >= 0)
          pending.splice(index, 1)
        reject(error)
      })
    })
  }

  const host = createNativeHostApiFromBridge(dispatch)
  try {
    const startupHostInfo = await host.getHostInfo()
    return {
      host,
      requests,
      startupHostInfo,
      async close() {
        stdout.close()
        try {
          if (!closed) {
            child.stdin.end()
            await waitForExitOrKill(child)
          }
        }
        finally {
          await cleanupNativeTargetBundleManifest(manifestPath)
        }
      },
    }
  }
  catch (error) {
    child.stdin.end()
    child.kill('SIGKILL')
    await cleanupNativeTargetBundleManifest(manifestPath)
    throw error
  }
}

export async function runNativeRendererSmokeFrame(frame: unknown): Promise<Record<string, unknown>> {
  const framePath = join(
    tmpdir(),
    `quajs-engine-native-product-smoke-frame-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )
  await writeFile(framePath, JSON.stringify(frame), 'utf8')
  try {
    const result = await runNativeApp({ QUA_NATIVE_RENDERER_SMOKE_FRAME: framePath })
    const summaryLine = result.stdout
      .split(/\r?\n/)
      .find(line => line.startsWith(RENDERER_SMOKE_JSON_PREFIX))
    if (!summaryLine) {
      throw new Error(`Native renderer smoke did not produce a JSON summary. stdout=${result.stdout.trim()} stderr=${result.stderr.trim()}`)
    }
    return JSON.parse(summaryLine.slice(RENDERER_SMOKE_JSON_PREFIX.length)) as Record<string, unknown>
  }
  finally {
    await rm(framePath, { force: true })
  }
}

function spawnNativeApp(extraEnv: Record<string, string>): ChildProcessWithoutNullStreams {
  const env = nativeAppEnv(extraEnv)
  return spawn('cargo', NATIVE_CARGO_ARGS, {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function runNativeApp(extraEnv: Record<string, string>): Promise<{ stdout: string, stderr: string }> {
  const child = spawnNativeApp(extraEnv)
  const stdout: string[] = []
  const stderr: string[] = []
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      const output = {
        stdout: stdout.join(''),
        stderr: stderr.join(''),
      }
      if (code === 0) {
        resolve(output)
        return
      }
      reject(new Error(`Native app exited with code=${code ?? 'none'} signal=${signal ?? 'none'} stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`))
    })
  })
}

function rejectPending(pending: PendingBridgeRequest[], error: Error): void {
  while (pending.length > 0) {
    pending.shift()!.reject(error)
  }
}

function nativeAppEnv(extraEnv: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
  }
  if (!('QUA_NATIVE_TARGET_BUNDLE_MANIFEST' in extraEnv)) {
    delete env.QUA_NATIVE_TARGET_BUNDLE_MANIFEST
  }
  return env
}

async function writeNativeTargetBundleManifest(manifest: TargetBundleManifest): Promise<string> {
  const manifestPath = join(
    tmpdir(),
    `quajs-engine-native-target-bundle-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')
  return manifestPath
}

async function cleanupNativeTargetBundleManifest(manifestPath: string | undefined): Promise<void> {
  if (manifestPath) {
    await rm(manifestPath, { force: true })
  }
}

async function waitForExitOrKill(child: ChildProcessWithoutNullStreams): Promise<void> {
  const timeout = new Promise<'timeout'>(resolve => setTimeout(resolve, 2_000, 'timeout'))
  const exit = once(child, 'exit').then(() => 'exit' as const)
  if (await Promise.race([exit, timeout]) === 'timeout') {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}
