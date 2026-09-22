import type { NovelProject } from '$lib/types'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serviceSignal } from './lifecycle'
import { isPathInside } from './paths'
import { appendEvent, resolveSandboxRoots } from './store'

export interface SandboxExecRequest {
  command: string
  cwd?: string
  timeoutMs?: number
}

export interface SandboxExecResult {
  command: string
  cwd: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

const commands = new Map<() => void, Promise<void>>()
export const activeSandboxCount = (): number => commands.size
export async function stopSandboxCommands(): Promise<void> {
  const finished = [...commands.values()]
  for (const stop of commands.keys()) stop()
  await Promise.allSettled(finished)
}

export class SandboxProvider {
  async exec(project: NovelProject, request: SandboxExecRequest): Promise<SandboxExecResult> {
    if (process.platform !== 'darwin') {
      throw new Error('Command sandbox is only enabled on macOS in this implementation.')
    }

    await access('/usr/bin/sandbox-exec')
    const roots = resolveSandboxRoots(project)
    const cwd = resolve(request.cwd || roots[0])
    if (!roots.some(root => isPathInside(cwd, root))) {
      throw new Error(`Working directory is outside project sandbox roots: ${cwd}`)
    }

    const result = await runSandboxedCommand({
      command: request.command,
      cwd,
      profile: createMacSandboxProfile(roots),
      timeoutMs: request.timeoutMs ?? 30000,
    })

    await appendEvent({
      projectId: project.id,
      type: 'sandbox.exec',
      message: result.exitCode === 0
        ? `Command completed: ${request.command}`
        : `Command failed: ${request.command}`,
      payload: {
        command: request.command,
        cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        stdout: truncateOutput(result.stdout),
        stderr: truncateOutput(result.stderr),
      },
    })

    return {
      ...result,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
    }
  }
}

export function createMacSandboxProfile(projectRoots: string[]): string {
  const rootRules = projectRoots
    .map(root => `(allow file-read* file-write* (subpath "${escapeProfileString(root)}"))`)
    .join('\n')

  return `
(version 1)
(deny default)
(allow process*)
(allow sysctl-read)
(allow network*)
(allow file-read*
  (subpath "/bin")
  (subpath "/dev")
  (subpath "/etc")
  (subpath "/Library")
  (subpath "/opt/homebrew")
  (subpath "/System")
  (subpath "/usr")
  (subpath "/var/db")
  (literal "/private/tmp")
  (literal "/tmp"))
(allow file-write*
  (subpath "/private/tmp")
  (subpath "/tmp"))
${rootRules}
`.trim()
}

function runSandboxedCommand(input: {
  command: string
  cwd: string
  profile: string
  timeoutMs: number
}): Promise<SandboxExecResult> {
  serviceSignal.throwIfAborted()
  return new Promise((resolvePromise, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', input.profile, '/bin/zsh', '-f', '-c', input.command], {
      cwd: input.cwd,
      detached: true,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: input.cwd,
        TMPDIR: process.env.TMPDIR || '/tmp',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stop = (): void => {
      if (!child.pid)
        return
      try { process.kill(-child.pid, 'SIGKILL') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          child.kill('SIGKILL')
      }
    }
    let settled!: () => void
    commands.set(stop, new Promise<void>((resolve) => { settled = resolve }))
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      stop()
    }, input.timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-20000)
    })

    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-20000)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      commands.delete(stop)
      settled()
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout)
      commands.delete(stop)
      settled()
      resolvePromise({
        command: input.command,
        cwd: input.cwd,
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

function escapeProfileString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function truncateOutput(value: string): string {
  return value.length > 20000 ? `${value.slice(0, 20000)}\n[truncated]` : value
}
