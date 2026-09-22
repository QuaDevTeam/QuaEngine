import type { EditorBridge, PreviewPerformance, PreviewState } from '@quajs/editor-core'
import { element, styleMap } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { workbenchEmpty } from '../../shared/empty-state'
import { icon, setIconButton } from '../../shared/icons'
import { editorTheme } from '../theme/controller'
import './styles.scss'

type Key = 'fps' | 'cpuPercent' | 'memoryBytes' | 'gpuPercent' | 'gpuMemoryBytes' | 'drawCalls'
const metrics: { key: Key, label: string, unit: string, color: string, floor: number, native?: boolean }[] = [
  { key: 'fps', label: 'FPS', unit: '帧 / 秒', color: 'success', floor: 60 },
  { key: 'cpuPercent', label: 'CPU', unit: '%', color: 'info', floor: 100 },
  { key: 'memoryBytes', label: '内存（RSS）', unit: 'MiB', color: 'purple', floor: 64 * 1024 * 1024 },
  { key: 'gpuPercent', label: '系统 GPU', unit: '%', color: 'warning', floor: 100, native: true },
  { key: 'gpuMemoryBytes', label: 'GPU 已分配内存', unit: 'MiB', color: 'orange', floor: 64 * 1024 * 1024, native: true },
  { key: 'drawCalls', label: 'Draw Calls', unit: '/ 帧', color: 'cyan', floor: 10, native: true },
]

/**
 * No frame subscriptions, GPU readbacks or permanent render loop. Five samples
 * per second while visible; 60 seconds of bounded history and six small canvases.
 */
export class PerformancePanel {
  private readonly empty = workbenchEmpty('pulse', '尚无性能数据', '运行预览后，查看帧率、CPU 和内存变化。')
  private state: PreviewState = { phase: 'idle' }
  private visible = false
  private paused = false
  private generation = 0
  private timer?: ReturnType<typeof setTimeout>
  private session?: string
  private samples: PreviewPerformance[] = []
  private readonly graphs = new Map<Key, { canvas: HTMLCanvasElement, output: HTMLOutputElement, section: HTMLElement }>()
  private readonly message: HTMLElement
  private readonly detail: HTMLElement
  private readonly pause: HTMLButtonElement

  constructor(private readonly root: HTMLElement, private readonly bridge: EditorBridge) {
    render(html`<div class="performance-toolbar"><span class="performance-message"></span><span class="performance-detail"></span><button class="icon-button performance-pause" aria-label="暂停采样" title="暂停采样">${unsafeHTML(icon('pause'))}</button><button class="icon-button performance-clear" aria-label="清空性能记录" title="清空性能记录">${unsafeHTML(icon('clear'))}</button></div><div class="performance-graphs"></div>${this.empty.element}`, root)
    this.empty.element.classList.add('panel-empty')
    root.querySelector<HTMLElement>('.performance-graphs')!.hidden = true
    this.message = root.querySelector('.performance-message')!
    this.detail = root.querySelector('.performance-detail')!
    this.pause = root.querySelector('.performance-pause')!
    this.pause.onclick = () => {
      this.paused = !this.paused
      setIconButton(this.pause, this.paused ? 'play' : 'pause', this.paused ? '恢复采样' : '暂停采样')
      this.pause.setAttribute('aria-pressed', String(this.paused))
      this.update()
    }
    root.querySelector<HTMLButtonElement>('.performance-clear')!.onclick = () => {
      this.samples = []
      this.draw()
    }
    const sections = metrics.map((metric) => {
      const section = element(html`<section class="performance-metric" data-metric=${metric.key} style=${styleMap({ '--metric-color': `var(--editor-${metric.color})` })}>
        <div class="performance-value"><span>${metric.label}</span><output>—</output><small>${metric.unit}</small></div><canvas aria-hidden="true"></canvas></section>`)
      this.graphs.set(metric.key, { section, canvas: section.querySelector('canvas')!, output: section.querySelector('output')! })
      return section
    })
    render(html`${sections}`, root.querySelector('.performance-graphs')!)
    new ResizeObserver(() => {
      if (this.visible)
        this.draw()
    }).observe(root)
    document.addEventListener('visibilitychange', () => this.update())
    window.addEventListener('pagehide', () => this.stop())
    const unsubscribeTheme = editorTheme.subscribe(() => this.draw())
    window.addEventListener('pagehide', unsubscribeTheme, { once: true })
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible)
      return
    this.visible = visible
    this.update()
    if (visible)
      this.draw()
  }

  setState(state: PreviewState): void {
    const changed = this.state.identity?.sessionId !== state.identity?.sessionId || this.state.phase !== state.phase || this.state.reloading !== state.reloading
    if (this.state.identity?.sessionId !== state.identity?.sessionId || (state.reloading && !this.state.reloading)) {
      this.samples = []
      this.detail.textContent = ''
    }
    this.state = state
    for (const metric of metrics)
      this.graphs.get(metric.key)!.section.hidden = Boolean(metric.native && state.identity?.target !== 'native')
    this.root.dataset.target = state.identity?.target ?? 'web'
    if (changed) {
      this.update()
      this.draw()
    }
  }

  private stop(): void {
    this.generation++
    clearTimeout(this.timer)
    const previous = this.session
    this.session = undefined
    if (previous)
      void this.bridge.previewPerformance(previous, false).catch(() => {})
  }

  private update(): void {
    this.stop()
    const active = this.visible && !document.hidden && !this.paused && this.state.phase === 'running' && !this.state.reloading && this.state.identity
    this.pause.disabled = this.state.phase !== 'running'
    this.root.classList.toggle('sampling', Boolean(active))
    if (!active) {
      this.message.textContent = this.paused ? '采样已暂停' : this.state.reloading ? '正在热重载…' : this.state.phase === 'starting' ? '正在启动预览…' : this.state.phase === 'running' ? '采样已暂停' : ''
      return
    }
    this.session = active.sessionId
    const generation = this.generation
    const sample = async (): Promise<void> => {
      const started = performance.now()
      try {
        const reading = await this.bridge.previewPerformance(active.sessionId, true)
        if (generation !== this.generation)
          return
        if (reading?.sessionId === active.sessionId) {
          this.samples.push(reading)
          if (this.samples.length > 300)
            this.samples.shift()
          this.samples = this.samples.filter(sample => reading.timestamp - sample.timestamp <= 60000)
          this.message.textContent = `${reading.target === 'web' ? 'Web' : 'Native'} 近 60 秒，每秒采样 5 次`
          this.detail.textContent = reading.target === 'web'
            ? `帧间隔 ${this.number(reading.frameMs)} ms，JS 堆 ${this.number(reading.jsHeapBytes === null ? null : reading.jsHeapBytes / 1048576)} MiB`
            : `CPU 帧 ${this.number(reading.frameMs)} ms，${this.number(reading.renderPasses, 0)} 渲染通道`
          this.draw()
        }
        else {
          this.message.textContent = '等待预览性能数据…'
        }
      }
      catch (error) {
        if (generation === this.generation)
          this.message.textContent = `采样暂不可用：${error instanceof Error ? error.message : String(error)}`
      }
      finally {
        if (generation === this.generation)
          this.timer = setTimeout(() => void sample(), Math.max(0, 200 - (performance.now() - started)))
      }
    }
    void sample()
  }

  private number(value: number | null | undefined, digits = 1): string {
    return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
  }

  private draw(): void {
    this.empty.element.hidden = this.samples.length > 0
    this.root.querySelector<HTMLElement>('.performance-graphs')!.hidden = !this.samples.length
    this.empty.heading.textContent = this.state.phase === 'running' ? this.paused ? '采样已暂停' : '等待性能数据…' : '尚无性能数据'
    if (!this.visible || document.hidden)
      return
    const latest = this.samples.at(-1)
    const now = latest?.timestamp ?? Date.now()
    for (const metric of metrics) {
      const { canvas, section, output } = this.graphs.get(metric.key)!
      if (section.hidden)
        continue
      const bytes = metric.key === 'memoryBytes' || metric.key === 'gpuMemoryBytes'
      const value = latest?.[metric.key]
      const text = this.number(value == null ? null : bytes ? value / 1048576 : value, metric.key === 'drawCalls' ? 0 : 1)
      if (output.textContent !== text)
        output.textContent = text
      section.title = metric.key === 'fps' ? latest?.fpsSource ?? '等待帧采样' : metric.key === 'gpuPercent' ? `${latest?.gpuSource ?? '等待驱动统计'}；含其他应用；多 GPU 显示最高利用率` : metric.key === 'gpuMemoryBytes' ? latest?.gpuMemorySource ?? '等待设备分配统计' : metric.key === 'cpuPercent' ? '仅预览渲染进程；一个逻辑核心满载为 100%，多核可能超过 100%' : metric.key === 'memoryBytes' ? '仅预览渲染进程的常驻物理内存，不含编辑器及编译进程' : '最近一次提交的实际 GPU 绘制调用，含合成与模糊；空闲时保留最后一帧'
      if (latest && value == null)
        section.title += '（当前不可用或采样预热中）'
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height)
        continue
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
      const context = canvas.getContext('2d')!
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      const ceiling = Math.max(metric.floor, ...this.samples.map(sample => sample[metric.key] ?? 0)) * 1.1
      context.strokeStyle = editorTheme.color('grid')
      context.lineWidth = 1
      context.beginPath()
      for (let i = 1; i < 4; i++) {
        context.moveTo(0, height * i / 4)
        context.lineTo(width, height * i / 4)
        context.moveTo(width * i / 4, 0)
        context.lineTo(width * i / 4, height)
      }
      context.stroke()
      context.strokeStyle = editorTheme.color(metric.color)
      context.lineWidth = 1.25
      context.beginPath()
      let previous = 0
      for (const sample of this.samples) {
        const value = sample[metric.key]
        if (value == null || !Number.isFinite(value)) {
          previous = 0
          continue
        }
        const x = width * (1 - (now - sample.timestamp) / 60000)
        const y = height - 2 - Math.max(0, value) / ceiling * (height - 12)
        if (!previous || sample.timestamp - previous > 600)
          context.moveTo(x, y)
        else context.lineTo(x, y)
        previous = sample.timestamp
      }
      context.stroke()
      context.fillStyle = editorTheme.color('muted')
      context.font = '9px system-ui'
      context.fillText(`${this.number(bytes ? ceiling / 1048576 : ceiling, 0)} ${metric.unit}`, 3, 10)
    }
  }
}
