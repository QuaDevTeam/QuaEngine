import type { PreviewCommandResult, PreviewDriver } from '@quajs/editor-core'
import type { BrowserWindow } from 'electron'
import { setTimeout as delay } from 'node:timers/promises'
import { WebContentsView } from 'electron'
import { freePort, startProjectProcess, waitForEndpoint } from '../process.js'
import { webPerformance } from './performance.js'
import { webStorage } from './storage.js'

export function createWebPreview(window: BrowserWindow, setView: (view?: WebContentsView) => void, environment: () => NodeJS.ProcessEnv = () => ({})): PreviewDriver {
  return {
    async start(request) {
      const port = await freePort()
      const url = `http://127.0.0.1:${port}`
      const process = await startProjectProcess(request, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { ...environment(), VITE_QUA_EDITOR_PREVIEW: '1' })
      let view: WebContentsView | undefined
      let session: Electron.Session | undefined
      let stopping: Promise<void> | undefined
      const stop = (): Promise<void> => {
        stopping ||= (async () => {
          try {
            const previous = view
            view = undefined
            setView()
            if (previous?.webContents && !previous.webContents.isDestroyed())
              previous.webContents.close()
            if (session) {
              await Promise.all([session.clearStorageData(), session.clearCache()])
              session = undefined
            }
          }
          finally {
            await process.stop()
          }
        })().catch((error) => {
          stopping = undefined
          throw error
        })
        return stopping
      }
      const contents = () => {
        request.signal.throwIfAborted()
        if (!view?.webContents || view.webContents.isDestroyed())
          throw new Error('Web 预览已关闭。')
        return view.webContents
      }
      const cdp = (method: string, params?: Record<string, unknown>) => contents().debugger.sendCommand(method, params)
      try {
        await waitForEndpoint(url, request.signal, process.assertRunning)
        request.signal.throwIfAborted()
        view = new WebContentsView({ webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: `qua-editor-web-${request.sessionId}`,
        } })
        session = view.webContents.session
        view.webContents.setAudioMuted(Boolean(request.muted))
        view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        view.webContents.on('will-navigate', (event, destination) => {
          if (new URL(destination).origin !== url)
            event.preventDefault()
        })
        view.webContents.on('render-process-gone', (_event, details) => {
          if (view && !request.signal.aborted)
            request.failed(new Error(`Web 预览退出：${details.reason}`))
        })
        const activeView = view
        view.webContents.once('destroyed', () => {
          if (view !== activeView)
            return
          view = undefined
          setView()
          if (!request.signal.aborted)
            request.failed(new Error('Web 预览已关闭。'))
        })
        if (window.isDestroyed())
          throw new Error('编辑器已关闭。')
        setView(view)
        view.webContents.debugger.attach('1.3')
        const failedRequests = new Map<string, { url: string, status: number }>()
        view.webContents.debugger.on('message', (_event, method, params) => {
          if (method === 'Runtime.exceptionThrown') {
            const details = params.exceptionDetails
            request.issue?.(String(details.exception?.description || details.text || 'Web 渲染失败'))
          }
          if (method === 'Network.responseReceived' && params.response.status >= 400 && ['Script', 'Document'].includes(params.type)) {
            if (failedRequests.size < 32)
              failedRequests.set(params.requestId, { url: params.response.url, status: params.response.status })
          }
          if (method === 'Network.loadingFailed') {
            failedRequests.delete(params.requestId)
            if (!params.canceled && ['Script', 'Document'].includes(params.type))
              request.issue?.(`预览模块加载失败：${params.errorText}`)
          }
          if (method === 'Network.loadingFinished' && failedRequests.has(params.requestId)) {
            const response = failedRequests.get(params.requestId)!
            failedRequests.delete(params.requestId)
            void Promise.resolve().then(() => cdp('Network.getResponseBody', { requestId: params.requestId })).then((result) => {
              if (!request.signal.aborted) {
                const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : String(result.body)
                request.issue?.(`${response.url}，HTTP ${response.status}\n${body.slice(0, 12000)}`)
              }
            }).catch(() => {
              if (!request.signal.aborted)
                request.issue?.(`${response.url}，HTTP ${response.status}`)
            })
          }
        })
        await Promise.all([view.webContents.loadURL(url), (async () => {
          await cdp('Runtime.enable')
          await cdp('DOM.enable')
          await cdp('CSS.enable')
          await cdp('Network.enable', { maxTotalBufferSize: 2 * 1024 * 1024, maxResourceBufferSize: 256 * 1024 })
        })()])
        request.signal.throwIfAborted()
        return { stop, storage: webStorage(cdp), performance: webPerformance(contents), cdp: async (method, params) => cdp(method, params), async setMuted(muted) {
          contents().setAudioMuted(muted)
        }, async reload() {
          const page = contents()
          await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>
            function cleanup() {
              clearTimeout(timer)
              page.removeListener('did-finish-load', done)
              page.removeListener('did-fail-load', fail)
              page.removeListener('destroyed', cancelled)
              request.signal.removeEventListener('abort', cancelled)
            }
            function cancelled() {
              cleanup()
              reject(new Error('Web 预览已关闭。'))
            }
            function done() {
              cleanup()
              resolve()
            }
            function fail(_event: unknown, code: number, description: string) {
              if (code !== -3) {
                cleanup()
                reject(new Error(description))
              }
            }
            timer = setTimeout(() => {
              cleanup()
              reject(new Error('Web 刷新超时。'))
            }, 30000)
            page.on('did-finish-load', done)
            page.on('did-fail-load', fail)
            page.once('destroyed', cancelled)
            request.signal.addEventListener('abort', cancelled, { once: true })
            void cdp('Page.reload', { ignoreCache: true }).catch((error) => {
              cleanup()
              reject(error)
            })
          })
        }, async command(command) {
          for (let attempt = 0; attempt < 50; attempt++) {
            const ready = await cdp('Runtime.evaluate', { expression: 'typeof globalThis.__QUA_EDITOR_PREVIEW__ === "function"', returnByValue: true })
            if (ready.result?.value)
              break
            await delay(100, undefined, { signal: request.signal })
          }
          // Fixed development entrypoint; no user-supplied executable code.
          const response = await cdp('Runtime.evaluate', { expression: `(() => {
            if (typeof globalThis.__QUA_EDITOR_PREVIEW__ !== 'function') throw new Error('项目尚未接入编辑器预览控制。');
            return globalThis.__QUA_EDITOR_PREVIEW__(${JSON.stringify(command)});
          })()`, awaitPromise: true, returnByValue: true })
          if (response.exceptionDetails)
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
          return response.result.value as PreviewCommandResult
        } }
      }
      catch (error) {
        await stop()
        throw error
      }
    },
  }
}
