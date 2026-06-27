import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface JsonRpcMessage {
  error?: {
    code: number
    data?: unknown
    message: string
  }
  id?: number | string | null
  jsonrpc: '2.0'
  method?: string
  params?: unknown
  result?: unknown
}

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

interface PublishDiagnosticsParams {
  diagnostics: unknown[]
  uri: string
}

export interface CompletionItemLike {
  label: string
}

export interface CompletionListLike {
  items: CompletionItemLike[]
}

export interface CodeActionLike {
  diagnostics?: Array<{
    code?: number | string
  }>
  edit?: WorkspaceEditLike
  kind?: string
  title: string
}

export interface HoverLike {
  contents: string | {
    value?: string
  }
}

export interface DocumentLinkLike {
  target?: string
}

export interface LocationLike {
  uri: string
}

export interface TextEditLike {
  newText: string
  range: {
    end: {
      character: number
      line: number
    }
    start: {
      character: number
      line: number
    }
  }
}

export interface WorkspaceEditLike {
  changes?: Record<string, TextEditLike[]>
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const nativeRoot = resolve(packageRoot, '..')
const uiCompilerRoot = resolve(nativeRoot, 'ui-compiler')
const serverPath = resolve(packageRoot, 'bin/qua-native-language-server.cjs')

export async function runLspProcessBuilds(): Promise<void> {
  await runPackageBuild(uiCompilerRoot)
  await runPackageBuild(packageRoot)
}

export class LspProcessClient {
  private buffer = Buffer.alloc(0)
  private child: ChildProcessWithoutNullStreams
  private diagnostics = new Map<string, unknown[]>()
  private diagnosticWaiters = new Map<string, Array<(diagnostics: unknown[]) => void>>()
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private stderr = ''

  constructor() {
    this.child = spawn(process.execPath, [serverPath], {
      cwd: packageRoot,
      stdio: 'pipe',
    })
    this.child.stdout.on('data', chunk => this.handleStdout(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    this.child.stderr.on('data', (chunk) => {
      this.stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    })
    this.child.on('error', error => this.rejectPending(error))
    this.child.on('exit', (code, signal) => {
      if (this.pending.size === 0)
        return
      this.rejectPending(new Error(`LSP process exited with code ${String(code)} signal ${String(signal)}: ${this.stderr}`))
    })
  }

  async dispose(): Promise<void> {
    try {
      await this.request('shutdown', null, 2_000)
    }
    catch {
      // The process may already have exited after a failed assertion.
    }
    this.notify('exit')

    await new Promise<void>((resolveExit) => {
      if (this.child.exitCode !== null) {
        resolveExit()
        return
      }

      const timeout = setTimeout(() => {
        this.child.kill()
        resolveExit()
      }, 1_000)
      this.child.once('exit', () => {
        clearTimeout(timeout)
        resolveExit()
      })
    })
  }

  notify(method: string, params?: unknown): void {
    this.write({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  request<T>(method: string, params?: unknown, timeoutMs = 5_000): Promise<T> {
    const id = this.nextId
    this.nextId += 1

    return new Promise<T>((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        rejectRequest(new Error(`Timed out waiting for ${method}: ${this.stderr}`))
      }, timeoutMs)

      this.pending.set(id, {
        reject: rejectRequest,
        resolve: value => resolveRequest(value as T),
        timeout,
      })
      this.write({
        id,
        jsonrpc: '2.0',
        method,
        params,
      })
    })
  }

  waitForDiagnostics(uri: string, timeoutMs = 5_000): Promise<unknown[]> {
    const existing = this.diagnostics.get(uri)
    if (existing)
      return Promise.resolve(existing)

    return new Promise((resolveDiagnostics, rejectDiagnostics) => {
      let timeout: ReturnType<typeof setTimeout>
      const resolveAndClear = (diagnostics: unknown[]) => {
        clearTimeout(timeout)
        resolveDiagnostics(diagnostics)
      }
      timeout = setTimeout(() => {
        this.diagnosticWaiters.delete(uri)
        rejectDiagnostics(new Error(`Timed out waiting for diagnostics for ${uri}: ${this.stderr}`))
      }, timeoutMs)
      this.diagnosticWaiters.set(uri, [
        ...(this.diagnosticWaiters.get(uri) ?? []),
        resolveAndClear,
      ])
    })
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined) {
      const id = Number(message.id)
      const pending = this.pending.get(id)
      if (!pending)
        return

      clearTimeout(pending.timeout)
      this.pending.delete(id)
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data)}`))
      }
      else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method === 'textDocument/publishDiagnostics') {
      const params = message.params as PublishDiagnosticsParams
      this.diagnostics.set(params.uri, params.diagnostics)
      const waiters = this.diagnosticWaiters.get(params.uri) ?? []
      this.diagnosticWaiters.delete(params.uri)
      for (const waiter of waiters) {
        waiter(params.diagnostics)
      }
    }
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1)
        return

      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1])
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + length
      if (!length || this.buffer.length < messageEnd)
        return

      const body = this.buffer.subarray(messageStart, messageEnd).toString('utf8')
      this.buffer = this.buffer.subarray(messageEnd)
      this.handleMessage(JSON.parse(body) as JsonRpcMessage)
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private write(message: JsonRpcMessage): void {
    const body = JSON.stringify(message)
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
  }
}

export function completionItems(result: CompletionItemLike[] | CompletionListLike): CompletionItemLike[] {
  return Array.isArray(result) ? result : result.items
}

export function hoverText(hover: HoverLike): string {
  return typeof hover.contents === 'string' ? hover.contents : hover.contents.value ?? ''
}

export function positionAtOffset(source: string, offset: number): { character: number, line: number } {
  const safeOffset = Math.max(0, Math.min(source.length, offset))
  const lines = source.slice(0, safeOffset).split(/\r?\n/)
  return {
    character: lines[lines.length - 1].length,
    line: lines.length - 1,
  }
}

export function rangeAtOffset(source: string, offset: number, length: number): TextEditLike['range'] {
  return {
    start: positionAtOffset(source, offset),
    end: positionAtOffset(source, offset + length),
  }
}

export function applyTextEdits(source: string, edits: readonly TextEditLike[]): string {
  return [...edits]
    .sort((left, right) => offsetAtPosition(source, right.range.start) - offsetAtPosition(source, left.range.start))
    .reduce((current, edit) => {
      const start = offsetAtPosition(current, edit.range.start)
      const end = offsetAtPosition(current, edit.range.end)
      return `${current.slice(0, start)}${edit.newText}${current.slice(end)}`
    }, source)
}

async function runPackageBuild(cwd: string): Promise<void> {
  await new Promise<void>((resolveBuild, rejectBuild) => {
    execFile('pnpm', ['build'], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        rejectBuild(new Error([
          `Failed to build ${cwd}`,
          stdout,
          stderr,
          error.message,
        ].filter(Boolean).join('\n')))
        return
      }
      resolveBuild()
    })
  })
}

function offsetAtPosition(source: string, position: { character: number, line: number }): number {
  const lines = source.split(/\r?\n/)
  let offset = 0
  for (let line = 0; line < Math.min(position.line, lines.length); line += 1) {
    offset += lines[line].length + 1
  }
  return Math.min(source.length, offset + position.character)
}
