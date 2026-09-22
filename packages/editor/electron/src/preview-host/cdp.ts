/** Bounded CDP WebSocket client; control and inspection only; presentation uses the native compositor. */
export class NativeCdp {
  private id = 0
  private stopped = false
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  private constructor(private readonly socket: WebSocket, private readonly failed: (error: Error) => void) {
    socket.addEventListener('message', (event) => {
      try {
        const raw = String(event.data)
        if (raw.length > 16 * 1024 * 1024)
          throw new Error('CDP 响应超出限制。')
        const response = JSON.parse(raw)
        const item = this.pending.get(response.id)
        if (!item)
          return
        this.pending.delete(response.id)
        clearTimeout(item.timer)
        if (response.error)
          item.reject(new Error(response.error.message))
        else
          item.resolve(response.result || {})
      }
      catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.addEventListener('close', () => this.fail(new Error('Native CDP 连接已关闭。')))
  }

  static async connect(url: string, signal: AbortSignal, failed: (error: Error) => void): Promise<NativeCdp> {
    const socket = new WebSocket(url)
    const client = new NativeCdp(socket, failed)
    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        function cleanup() {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
        }
        function abort() {
          cleanup()
          reject(new Error('CDP 连接已取消。'))
        }
        timer = setTimeout(() => {
          cleanup()
          reject(new Error('CDP 连接超时。'))
        }, 5000)
        signal.addEventListener('abort', abort, { once: true })
        socket.addEventListener('open', () => {
          cleanup()
          resolve()
        }, { once: true })
        socket.addEventListener('error', () => {
          cleanup()
          reject(new Error('CDP 连接失败。'))
        }, { once: true })
        if (signal.aborted)
          abort()
      })
      return client
    }
    catch (error) {
      client.close()
      throw error
    }
  }

  send(method: string, params: Record<string, unknown> = {}, timeout = 5000): Promise<Record<string, unknown>> {
    if (this.socket.readyState !== WebSocket.OPEN || this.pending.size >= 32)
      return Promise.reject(new Error('CDP 连接不可用或请求过多。'))
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} 超时。`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close(): void {
    this.stopped = true
    this.fail(new Error('CDP 已停止。'))
    this.socket.close()
  }

  private fail(error: Error): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    this.pending.clear()
    if (!this.stopped) {
      this.stopped = true
      this.failed(error)
    }
  }
}
