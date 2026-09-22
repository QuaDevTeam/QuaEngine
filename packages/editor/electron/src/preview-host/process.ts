import type { PreviewStart } from '@quajs/editor-core'
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { packageManager } from '../plugins/installer.js'
import { ProcessLogDecoder } from '../runtime/output.js'
import { toolInvocation } from '../runtime/process.js'

export async function freePort(): Promise<number> {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string')
        return reject(new Error('Cannot allocate local preview port.'))
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}
export async function startProjectProcess(request: PreviewStart, args: string[], env: NodeJS.ProcessEnv = {}) {
  const manager = await packageManager(request.projectRoot)
  const environment = { ...process.env, ...env }
  delete environment.NODE_OPTIONS
  delete environment.ELECTRON_RUN_AS_NODE
  const invocation = await toolInvocation(process.platform === 'win32' ? `${manager}.cmd` : manager, ['run', request.script, ...(manager === 'npm' && args.length ? ['--'] : []), ...args], environment)
  request.signal.throwIfAborted()
  const child = spawn(invocation.command, invocation.args, {
    cwd: request.projectRoot,
    env: environment,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  let stopping = false
  let failure: Error | undefined
  let errorOutput = ''
  const closed = new Promise<void>((resolve) => {
    child.once('close', (code, signal) => {
      if (!stopping) {
        failure ??= new Error(`预览进程退出（${code ?? signal}）。${errorOutput ? `\n${errorOutput}` : '请查看运行日志。'}`)
        request.failed(failure)
      }
      resolve()
    })
  })
  child.on('error', (error) => {
    failure = error
    request.failed(error)
  })
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new ProcessLogDecoder()
    stream?.setEncoding('utf8')
    // Decode before transport slicing; ANSI and UTF-8 can span pipe chunks.
    stream?.on('data', (data: string) => {
      const text = decoder.append(data)
      if (stream === child.stderr)
        errorOutput = (errorOutput + text).slice(-8000)
      for (let offset = 0; offset < text.length; offset += 16000)
        request.log(text.slice(offset, offset + 16000))
    })
  }
  let stopPromise: Promise<void> | undefined
  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      stopping = true
      request.signal.removeEventListener('abort', onAbort)
      if (!child.pid)
        return
      if (process.platform === 'win32') {
        await new Promise<void>((resolve, reject) => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
          killer.once('error', reject)
          killer.once('close', () => resolve())
        })
      }
      else {
        await signalGroup(child.pid, 'SIGTERM')
        await Promise.race([closed, delay(1500)])
        // The script can exit before descendants; always finish the owned group.
        await signalGroup(child.pid, 'SIGKILL')
      }
      await Promise.race([closed, delay(2000).then(() => {
        throw new Error('预览进程未确认退出。')
      })])
    })().catch((error) => {
      // Failed teardown retains process ownership, but must permit a real retry.
      stopPromise = undefined
      throw error
    })
    return stopPromise
  }
  function onAbort(): void {
    void stop().catch(error => request.log(String(error)))
  }
  request.signal.addEventListener('abort', onAbort, { once: true })
  return { stop, assertRunning: () => {
    if (failure)
      throw failure
    request.signal.throwIfAborted()
  } }
}
async function signalGroup(pid: number, signal: NodeJS.Signals): Promise<void> {
  try {
    process.kill(-pid, signal)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH')
      return
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      // macOS can retain a reaped group's identity briefly. Only forgive an
      // already-empty/zombie group; a live owned process must still report failure.
      const { stdout } = await promisify(execFile)('ps', ['-axo', 'pgid=,stat='], { timeout: 2000, maxBuffer: 1024 * 1024 })
      const alive = stdout.split('\n').some((line) => {
        const [group, state] = line.trim().split(/\s+/u)
        return Number(group) === pid && state && !state.startsWith('Z')
      })
      if (!alive)
        return
    }
    throw error
  }
}
export async function waitForEndpoint(url: string, signal: AbortSignal, assertRunning: () => void, headers?: Record<string, string>): Promise<void> {
  const deadline = Date.now() + 15 * 60000
  while (Date.now() < deadline) {
    assertRunning()
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) })
      await response.body?.cancel()
      if (response.ok)
        return
      if (response.status === 404 || response.status === 401)
        throw new Error(`预览协议不可用（HTTP ${response.status}）：${url}`)
    }
    catch (error) {
      signal.throwIfAborted()
      if (error instanceof Error && error.message.startsWith('预览协议'))
        throw error
    }
    await delay(300, undefined, { signal })
  }
  throw new Error('等待预览启动超时，请查看构建日志。')
}
