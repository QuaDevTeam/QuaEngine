import type { PreviewPerformanceReading } from '@quajs/editor-core'
import type { WebContents } from 'electron'
import { app } from 'electron'

// A bounded one-second window measures actual animation callbacks, never the
// configured refresh rate or CDP's "Frames" (which counts document frames).
const readFrames = `(() => {
  const now = performance.now();
  let probe = globalThis.__QUA_EDITOR_PERFORMANCE__;
  if (!probe || now > probe.deadline) {
    if (probe) cancelAnimationFrame(probe.id);
    probe = globalThis.__QUA_EDITOR_PERFORMANCE__ = { times: [], started: now, deadline: now + 2000, id: 0 };
    const tick = at => {
      if (at > probe.deadline) return;
      probe.times.push(at);
      while (probe.times.length > 512 || probe.times[0] < at - 1000) probe.times.shift();
      probe.id = requestAnimationFrame(tick);
    };
    probe.id = requestAnimationFrame(tick);
  }
  probe.deadline = now + 2000;
  while (probe.times[0] < now - 1000) probe.times.shift();
  const duration = Math.min(1000, now - probe.started);
  const times = probe.times;
  return { fps: duration >= 500 ? times.length * 1000 / duration : null,
    frameMs: times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : null,
    frameAgeMs: times.length ? now - times[times.length - 1] : null };
})()`
const stopFrames = `(() => { const probe = globalThis.__QUA_EDITOR_PERFORMANCE__; if (probe) cancelAnimationFrame(probe.id); delete globalThis.__QUA_EDITOR_PERFORMANCE__; })()`

export function webPerformance(contents: () => WebContents): (enabled: boolean) => Promise<PreviewPerformanceReading | undefined> {
  let previous: { pid: number, time: number, cpu: number } | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let enabled = false
  return (active) => {
    const pending = queue.catch(() => {}).then(async () => {
      const page = contents()
      const cdp = (method: string, params?: Record<string, unknown>) => page.debugger.sendCommand(method, params)
      if (!active) {
        previous = undefined
        if (enabled) {
          enabled = false
          await Promise.allSettled([
            cdp('Runtime.evaluate', { expression: stopFrames }),
            cdp('Performance.disable'),
          ])
        }
        return undefined
      }
      if (!enabled) {
        await cdp('Performance.enable')
        enabled = true
      }
      const pid = page.getOSProcessId()
      const metric = app.getAppMetrics().find(process => process.pid === pid)
      const now = performance.now()
      const total = metric?.cpu.cumulativeCPUUsage
      const cpuPercent = typeof total === 'number' && previous?.pid === pid && now - previous.time >= 100 && now - previous.time < 2000
        ? Math.max(0, (total - previous.cpu) * 100000 / (now - previous.time))
        : null
      previous = typeof total === 'number' ? { pid, time: now, cpu: total } : undefined
      const [frames, metrics] = await Promise.all([
        cdp('Runtime.evaluate', { expression: readFrames, returnByValue: true }),
        cdp('Performance.getMetrics'),
      ])
      if (frames.exceptionDetails)
        throw new Error('Web 性能采样暂时不可用。')
      const heap = metrics.metrics.find((metric: { name: string }) => metric.name === 'JSHeapUsedSize')?.value
      return {
        ...frames.result.value,
        cpuPercent,
        memoryBytes: metric ? metric.memory.workingSetSize * 1024 : null,
        jsHeapBytes: typeof heap === 'number' ? heap : null,
        fpsSource: 'Web 动画帧回调，最近 1 秒；静止画面仍可回调，不代表合成器重绘次数',
        gpuMemoryBytes: null,
        gpuPercent: null,
        drawCalls: null,
        renderPasses: null,
        gpuMemorySource: '',
        gpuSource: '',
      } satisfies PreviewPerformanceReading
    })
    queue = pending
    return pending
  }
}
