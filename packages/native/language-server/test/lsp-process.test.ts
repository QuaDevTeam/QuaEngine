import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

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

interface CompletionItemLike {
  label: string
}

interface CompletionListLike {
  items: CompletionItemLike[]
}

interface HoverLike {
  contents: string | {
    value?: string
  }
}

interface DocumentLinkLike {
  target?: string
}

interface LocationLike {
  uri: string
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const nativeRoot = resolve(packageRoot, '..')
const uiCompilerRoot = resolve(nativeRoot, 'ui-compiler')
const serverPath = resolve(packageRoot, 'bin/qua-native-language-server.cjs')

let client: LspProcessClient | undefined

describe('@quajs/native-language-server process', () => {
  beforeAll(async () => {
    await runPackageBuild(uiCompilerRoot)
    await runPackageBuild(packageRoot)
  }, 120_000)

  afterEach(async () => {
    await client?.dispose()
    client = undefined
  })

  it('serves editor requests over stdio without target runtime adapters', async () => {
    const quiUri = 'file:///project/ui/menu.qui'
    const qssUri = 'file:///project/ui/menu.qss'
    const qui = 'import style "./menu.qss";\nPanel.dialog { Button.primary { Text { "Open" } } }'
    const qss = 'Panel.dialog, Button.primary { color: #fff; }'

    client = new LspProcessClient(serverPath)

    const initialize = await client.request<{ capabilities: Record<string, unknown> }>('initialize', {
      capabilities: {},
      initializationOptions: {
        quaNative: {
          lint: {
            strictComponents: true,
          },
        },
      },
      processId: process.pid,
      rootUri: 'file:///project',
    })

    expect(initialize.capabilities).toEqual(expect.objectContaining({
      completionProvider: expect.any(Object),
      documentLinkProvider: expect.any(Object),
      hoverProvider: true,
      referencesProvider: true,
    }))

    client.notify('initialized', {})
    client.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'qua-style',
        text: qss,
        uri: qssUri,
        version: 1,
      },
    })
    client.notify('textDocument/didOpen', {
      textDocument: {
        languageId: 'qua-ui',
        text: qui,
        uri: quiUri,
        version: 1,
      },
    })

    await expect(client.waitForDiagnostics(qssUri)).resolves.toEqual([])
    await expect(client.waitForDiagnostics(quiUri)).resolves.toEqual([])

    const completion = await client.request<CompletionItemLike[] | CompletionListLike>('textDocument/completion', {
      position: {
        character: 0,
        line: 0,
      },
      textDocument: {
        uri: quiUri,
      },
    })
    expect(completionItems(completion).some(item => item.label === 'Button')).toBe(true)

    const buttonPosition = positionAtOffset(qui, qui.indexOf('Button'))
    const hover = await client.request<HoverLike>('textDocument/hover', {
      position: buttonPosition,
      textDocument: {
        uri: quiUri,
      },
    })
    expect(hoverText(hover)).toContain('Button')

    const links = await client.request<DocumentLinkLike[]>('textDocument/documentLink', {
      textDocument: {
        uri: quiUri,
      },
    })
    expect(links).toEqual([
      expect.objectContaining({
        target: qssUri,
      }),
    ])

    const references = await client.request<LocationLike[]>('textDocument/references', {
      context: {
        includeDeclaration: true,
      },
      position: buttonPosition,
      textDocument: {
        uri: quiUri,
      },
    })
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: quiUri,
      }),
      expect.objectContaining({
        uri: qssUri,
      }),
    ]))
  }, 30_000)
})

class LspProcessClient {
  private buffer = Buffer.alloc(0)
  private child: ChildProcessWithoutNullStreams
  private diagnostics = new Map<string, unknown[]>()
  private diagnosticWaiters = new Map<string, Array<(diagnostics: unknown[]) => void>>()
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private stderr = ''

  constructor(serverPath: string) {
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

function completionItems(result: CompletionItemLike[] | CompletionListLike): CompletionItemLike[] {
  return Array.isArray(result) ? result : result.items
}

function hoverText(hover: HoverLike): string {
  return typeof hover.contents === 'string' ? hover.contents : hover.contents.value ?? ''
}

function positionAtOffset(source: string, offset: number): { character: number, line: number } {
  const safeOffset = Math.max(0, Math.min(source.length, offset))
  const lines = source.slice(0, safeOffset).split(/\r?\n/)
  return {
    character: lines[lines.length - 1].length,
    line: lines.length - 1,
  }
}
