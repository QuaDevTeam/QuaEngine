import { spawn } from 'node:child_process'

export type BuildRunner = (command: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>

export function productionEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, NODE_ENV: 'production' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('QUA_NATIVE_') || key.startsWith('QUA_EDITOR_') || key.startsWith('VITE_QUA_EDITOR_') || ['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'].includes(key))
      delete env[key]
  }
  return env
}

export function buildRunner(cwd: string, environment: NodeJS.ProcessEnv, signal?: AbortSignal, log: (text: string) => void = () => {}): BuildRunner {
  return async (command, args, env = environment) => {
    signal?.throwIfAborted()
    const child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let tail = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const kill = (force: boolean): void => {
      if (!child.pid)
        return
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).on('error', () => {})
      }
      else {
        try {
          process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
        }
        catch { /* Already reaped. */ }
      }
    }
    const abort = (): void => {
      kill(false)
      timer ??= setTimeout(kill, 1200, true)
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted)
      abort()
    for (const stream of [child.stdout, child.stderr]) {
      let pendingLog = ''
      const reportLine = (line: string): void => {
        try {
          const record = JSON.parse(line)
          if (command === 'cargo' && typeof record.reason === 'string') {
            if (record.reason === 'compiler-message' && record.message?.rendered)
              log(record.message.rendered)
            return
          }
          if (record.renderer && record.runtime) {
            log(`Native runtime: ${record.runtime.nativeRuntimeVersion} (${record.renderer.backend})\n`)
            return
          }
        }
        catch { /* Ordinary build output. */ }
        log(`${line}\n`)
      }
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => {
        if (stream === child.stdout)
          output = (output + chunk).slice(-8 * 1024 * 1024)
        tail = (tail + chunk).slice(-4000)
        pendingLog += chunk
        const lines = pendingLog.split('\n')
        pendingLog = lines.pop()!
        for (const line of lines) reportLine(line)
        if (pendingLog.length > 256000) {
          log(pendingLog)
          pendingLog = ''
        }
      })
      stream.on('end', () => {
        if (pendingLog)
          reportLine(pendingLog)
      })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited (${code}).\n${tail}`)))
      })
      signal?.throwIfAborted()
      return output
    }
    finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted)
        kill(true)
    }
  }
}
