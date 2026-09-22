import type { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { ProcessLogDecoder } from './output.js'

export interface RuntimeOperation {
  signal: AbortSignal
  env: NodeJS.ProcessEnv
  report: (message: string) => void
  /** Optional dedicated fd 3 channel, separate from lossy/ANSI-decoded log tails. */
  reportEvent?: (chunk: string) => void
}

/** Run Windows package-manager JS entrypoints directly, avoiding cmd interpolation. */
export async function toolInvocation(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ command: string, args: string[] }> {
  if (process.platform !== 'win32' || !command.endsWith('.cmd'))
    return { command, args }
  const manager = command.slice(0, -4)
  if (manager !== 'npm' && manager !== 'pnpm')
    throw new Error('不支持的工具启动入口。')
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    const entries = manager === 'npm'
      ? ['node_modules/npm/bin/npm-cli.js', '../npm/bin/npm-cli.js']
      : ['node_modules/pnpm/bin/pnpm.cjs', '../pnpm/bin/pnpm.cjs', 'node_modules/corepack/dist/pnpm.js']
    for (const entry of entries) {
      const path = join(directory, entry)
      if ((await stat(path).catch(() => undefined))?.isFile())
        return { command: 'node', args: [path, ...args] }
    }
  }
  throw new Error(`找不到 ${manager} 的 JavaScript 启动入口。请重试运行环境安装。`)
}

/** Commands/arguments are host-owned. Kill descendants before settling cancellation. */
export async function runTool(command: string, args: string[], cwd: string, operation: RuntimeOperation, timeout = 15 * 60_000): Promise<string> {
  operation.signal.throwIfAborted()
  const invocation = await toolInvocation(command, args, operation.env)
  operation.signal.throwIfAborted()
  const child = spawn(invocation.command, invocation.args, { cwd, env: operation.env, stdio: operation.reportEvent ? ['ignore', 'pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', shell: false })
  if (operation.reportEvent) {
    const events = child.stdio[3] as Readable
    events.setEncoding('utf8')
    events.on('data', (chunk: string) => operation.reportEvent?.(chunk))
  }
  let tail = ''
  let killed = false
  let killer: ReturnType<typeof setTimeout> | undefined
  const kill = () => {
    killed = true
    if (!child.pid)
      return
    if (process.platform === 'win32') {
      const task = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      task.on('error', () => {})
    }
    else {
      const signal = (value: NodeJS.Signals) => {
        try {
          process.kill(-child.pid!, value)
        }
        catch { /* Already exited. */ }
      }
      signal('SIGTERM')
      killer ??= setTimeout(signal, 1200, 'SIGKILL')
    }
  }
  const timer = setTimeout(kill, timeout)
  operation.signal.addEventListener('abort', kill, { once: true })
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new ProcessLogDecoder()
    stream?.setEncoding('utf8')
    stream?.on('data', (chunk: string) => {
      const text = decoder.append(chunk).slice(-8000)
      tail = (tail + text).slice(-16000)
      if (text && !operation.signal.aborted)
        operation.report(text)
    })
  }
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', code => code === 0 && !killed ? resolve() : reject(new Error(killed ? '安装已取消或超时。' : `${command} 退出（${code}）。\n${tail}`)))
    })
    operation.signal.throwIfAborted()
    return tail
  }
  finally {
    clearTimeout(timer)
    clearTimeout(killer)
    operation.signal.removeEventListener('abort', kill)
    if (killed && child.pid && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGKILL')
      }
      catch { /* Reaped. */ }
    }
  }
}
