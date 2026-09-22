import type { PreviewCommandResult, PreviewDriver, PreviewPerformanceReading } from '@quajs/editor-core'
import type { NativePreviewSurface } from './surface.js'
import { randomBytes } from 'node:crypto'
import { NativeCdp } from '../cdp.js'
import { freePort, startProjectProcess, waitForEndpoint } from '../process.js'
import { NativeBuildProgress } from './progress.js'
import { nativeStorage } from './storage.js'
import { nativeLayerBinding, parseNativeSurface, NativePreviewSurface as Surface } from './surface.js'

export function createNativePreview(environment: () => NodeJS.ProcessEnv = () => ({}), surfaceChanged: (surface?: NativePreviewSurface) => void = () => {}): PreviewDriver {
  return { async start(request) {
    nativeLayerBinding() // Fail before launching a product on an unsupported host.
    let surface: NativePreviewSurface | undefined
    let starting = true
    const progress = new NativeBuildProgress(value => request.progress?.(value))
    const port = await freePort()
    const token = randomBytes(24).toString('hex')
    const url = `http://127.0.0.1:${port}`
    const headers = { Authorization: `Bearer ${token}` }
    const process = await startProjectProcess({ ...request, log: (message) => {
      request.log(message)
      if (starting)
        progress.append(message)
    } }, [], {
      ...environment(),
      VITE_QUA_EDITOR_PREVIEW: '1',
      QUA_NATIVE_RENDERER_CONTROL: `127.0.0.1:${port}`,
      QUA_NATIVE_EDITOR_PREVIEW: '1',
      QUA_NATIVE_EDITOR_TOKEN: token,
      QUA_NATIVE_EDITOR_MUTED: request.muted ? '1' : '0',
      QUA_NATIVE_EDITOR_MANAGED_RELOAD: '1',
      QUA_NATIVE_EDITOR_FAST_REBUILD: request.reloading ? '1' : '0',
      QUA_NATIVE_LOG: 'warn',
    })
    let cdp: NativeCdp | undefined
    let diagnosticsTimer: ReturnType<typeof setInterval> | undefined
    const stop = async (): Promise<void> => {
      starting = false
      progress.dispose()
      surfaceChanged(undefined)
      surface?.destroy()
      surface = undefined
      clearInterval(diagnosticsTimer)
      cdp?.close()
      cdp = undefined
      await process.stop()
    }
    try {
      await waitForEndpoint(`${url}/qua/preview`, request.signal, process.assertRunning, headers)
      starting = false
      progress.dispose()
      request.progress?.({ stage: 'connect', label: '正在连接 Native 预览', detail: '构建进程已启动，连接原生渲染表面…' })
      const capabilities = await fetch(`${url}/qua/preview`, { headers, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) }).then(response => response.json())
      if (capabilities.protocolVersion !== 2)
        throw new Error('Native 预览协议或能力不兼容。')
      const descriptor = parseNativeSurface(capabilities.surface)
      request.signal.throwIfAborted()
      surface = new Surface(descriptor)
      surfaceChanged(surface)
      request.log(`Native control: ${url}\nNative surface: Core Animation context ${descriptor.contextId}\n`)
      cdp = await NativeCdp.connect(`ws://127.0.0.1:${port}/devtools/page/qua-native?token=${token}`, request.signal, request.failed)
      let checking = false
      diagnosticsTimer = setInterval(() => {
        if (checking || !cdp)
          return
        checking = true
        void cdp.send('Qua.getDiagnostics').then((result) => {
          if (typeof result.error === 'string')
            request.issue?.(result.error)
        }).catch(() => {}).finally(() => { checking = false })
      }, 1500)
      return {
        stop,
        nativeViewport: { width: descriptor.width, height: descriptor.height },
        storage: nativeStorage((method, params, timeout) => cdp!.send(method, params, timeout), token),
        async performance(enabled) {
          if (!cdp || request.signal.aborted)
            return undefined
          const reading = await cdp.send('Qua.getPerformance', { token, enabled })
          if (!enabled)
            return undefined
          return { ...reading, jsHeapBytes: null, fpsSource: 'Native 实际提交渲染帧，最近 1 秒；空闲时降至 0' } as unknown as PreviewPerformanceReading
        },
        async setMuted(muted) {
          if (!cdp || request.signal.aborted)
            return
          await cdp.send('Qua.setAudioMuted', { token, muted })
        },
        cdp: (method, params) => cdp!.send(method, params),
        command: async command => await cdp!.send('Qua.editorCommand', { token, requestId: randomBytes(12).toString('hex'), command }, 35000) as unknown as PreviewCommandResult,
        async pointer(event) {
          if (!cdp || request.signal.aborted)
            return
          if (![event.x, event.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
            || !['mousePressed', 'mouseReleased', 'mouseMoved'].includes(event.type)
            || !['left', 'right', 'middle'].includes(event.button)) {
            throw new Error('Native pointer input is invalid.')
          }
          await cdp.send('Input.dispatchMouseEvent', { type: event.type, button: event.button, x: event.x * descriptor.width, y: event.y * descriptor.height })
        },
      }
    }
    catch (error) {
      try {
        await stop()
      }
      catch (stopError) {
        throw new Error(`${String(error)}\n停止 Native 预览失败：${String(stopError)}`)
      }
      throw error
    }
  } }
}
