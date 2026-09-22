import type { EditorBridge, PreviewCommand, PreviewDebugClip, PreviewDebugRequest, PreviewDebugSnapshot, PreviewSourceRequest, PreviewState } from '@quajs/editor-core'
import { element, html, nothing, render, repeat, styleMap } from '@quajs/editor-controls'
import { workbenchEmpty } from '../../shared/empty-state'
import './styles.scss'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const states: Record<string, string> = { playing: '播放中', scheduled: '等待开始', paused: '暂停', pending: '等待解锁 / 加载', suspended: '设备挂起', stopped: '已结束' }

/** Bounded snapshots over the existing preview command transport, scoped to a session. */
export class SceneDebugger {
  private readonly empty = workbenchEmpty('pulse', '尚无场景调试数据', '运行 Web 预览后，查看场景时间轴和实时属性。')
  private state: PreviewState = { phase: 'idle' }
  private visible = false
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private after = 0
  private busy = false
  private snapshot?: PreviewDebugSnapshot
  private selected?: number
  private zoom = 40
  private readonly message = element(html`<span class="scene-debug-message"></span>`)
  private readonly timeline = element(html`<div class="scene-timeline"></div>`)
  private readonly details = element(html`<div class="scene-debug-details"></div>`)
  private readonly pick: HTMLButtonElement
  private readonly auto: HTMLButtonElement
  private readonly controls: HTMLButtonElement[] = []
  private detailKey = ''
  private timelineKey = ''
  private readonly audioTimes = new Map<string, HTMLElement>()
  private readonly viewport = element(html`<div class="scene-timeline-viewport"></div>`)

  constructor(root: HTMLElement, private readonly bridge: EditorBridge, private readonly openSource: (request: PreviewSourceRequest, replay?: boolean) => Promise<void>) {
    const action = (label: string, run: () => Promise<unknown>) => {
      const button = element<HTMLButtonElement>(html`<button type="button">${label}</button>`)
      button.type = 'button'
      button.onclick = () => void run().catch(error => this.message.textContent = error instanceof Error ? error.message : String(error))
      this.controls.push(button)
      return button
    }
    this.pick = action('拾取属性', () => this.debug({ kind: 'pick', enabled: !this.snapshot?.picking }))
    this.pick.setAttribute('aria-pressed', 'false')
    action('单步', () => this.command({ action: 'step' }))
    this.auto = action('自动阅读', () => this.debug({ kind: 'flow', mode: this.snapshot?.flow === 'auto' ? 'manual' : 'auto' }))
    action('暂停全部音频', () => this.debug({ kind: 'audio', action: 'pause', target: 'master' }))
    action('恢复全部音频', () => this.debug({ kind: 'audio', action: 'resume', target: 'master' }))
    action('清空记录', () => this.debug({ kind: 'clear' }))
    this.empty.element.classList.add('panel-empty')
    render(this.timeline, this.viewport)
    render(html`<div class="scene-debug-toolbar">${this.controls}
      <input type="range" min="10" max="100" .value=${String(this.zoom)} aria-label="时间轴缩放"
        @input=${(event: Event) => {
          this.zoom = Number((event.currentTarget as HTMLInputElement).value)
          this.draw()
        }}>
      ${this.message}</div>${this.viewport}${this.details}${this.empty.element}`, root)
    document.addEventListener('visibilitychange', () => this.update())
    window.addEventListener('pagehide', () => this.stop())
    this.draw()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible)
      return
    this.visible = visible
    this.update()
    this.draw()
  }

  setState(state: PreviewState): void {
    const changed = state.identity?.sessionId !== this.state.identity?.sessionId || state.phase !== this.state.phase || state.reloading !== this.state.reloading
    if (state.identity?.sessionId !== this.state.identity?.sessionId || (state.reloading && !this.state.reloading)) {
      this.snapshot = undefined
      this.after = 0
      this.selected = undefined
      this.detailKey = ''
      this.timelineKey = ''
      render(nothing, this.timeline)
      render(nothing, this.details)
    }
    this.state = state
    if (changed) {
      this.update()
      this.draw()
    }
  }

  private stop(): void {
    ++this.generation
    clearTimeout(this.timer)
  }

  private update(): void {
    this.stop()
    const active = this.state.phase === 'running' && this.state.identity?.target === 'web' && !this.state.reloading
    for (const control of this.controls) control.disabled = !active
    if (!active) {
      this.message.textContent = this.state.reloading ? '正在热重载…' : ''
      return
    }
    if ((!this.visible && !this.snapshot?.picking) || document.hidden)
      return
    const generation = this.generation
    const session = this.state.identity!.sessionId
    const poll = async () => {
      try {
        if (this.busy)
          return
        const response = await this.bridge.previewCommand(session, { action: 'debug', request: { kind: 'read', after: this.after } })
        if (generation !== this.generation)
          return
        if (!response?.debug)
          throw new Error('项目尚未接入场景调试。')
        this.snapshot = response.debug
        for (const request of response.debug.requests) {
          if (generation !== this.generation)
            return
          this.after = Math.max(this.after, request.id)
          let message = '已定位属性'
          let error = false
          try {
            await this.openSource(request)
            if (request.text !== undefined)
              message = '已写入 QS 草稿，可撤销。保存后更新场景'
          }
          catch (reason) {
            error = true
            message = reason instanceof Error ? reason.message : String(reason)
          }
          if (generation !== this.generation)
            return
          if (request.text !== undefined || error)
            await this.bridge.previewCommand(session, { action: 'debug', request: { kind: 'reply', id: request.id, message: message.slice(0, 1000), error } })
          this.message.textContent = message
        }
        this.draw()
      }
      catch (error) {
        if (generation === this.generation)
          this.message.textContent = error instanceof Error ? error.message : String(error)
      }
      finally {
        if (generation === this.generation && (this.visible || this.snapshot?.picking) && !document.hidden)
          this.timer = setTimeout(() => void poll(), 300)
      }
    }
    void poll()
  }

  private async command(command: PreviewCommand): Promise<void> {
    const session = this.state.identity?.sessionId
    if (!session || this.busy)
      return
    this.stop()
    this.busy = true
    try {
      const result = await this.bridge.previewCommand(session, command)
      if (this.state.identity?.sessionId !== session)
        return
      if (result?.debug)
        this.snapshot = result.debug
      this.message.textContent = result?.message || ''
      this.draw()
    }
    finally {
      this.busy = false
      this.update()
    }
  }

  private debug(request: PreviewDebugRequest): Promise<void> {
    return this.command({ action: 'debug', request })
  }

  private source(clip: PreviewDebugClip, replay = false): void {
    this.selected = clip.id
    void this.openSource({ id: clip.id, kind: clip.kind === 'dialogue' ? 'dialogue' : 'audio', source: clip.source, target: clip.track?.id }, replay).catch((error) => {
      this.message.textContent = error instanceof Error ? error.message : String(error)
    })
    this.draw()
  }

  private draw(): void {
    const data = this.snapshot
    this.empty.element.hidden = Boolean(data)
    this.viewport.hidden = !data
    this.details.hidden = !data
    this.empty.heading.textContent = this.state.phase === 'running' && this.state.identity?.target === 'web' ? '等待场景调试数据…' : '尚无场景调试数据'
    this.pick.setAttribute('aria-pressed', String(data?.picking || false))
    this.auto.textContent = data?.flow === 'auto' ? '停止自动阅读' : '自动阅读'
    if (!this.visible || !data)
      return
    const follow = this.viewport.scrollWidth - this.viewport.scrollLeft - this.viewport.clientWidth < 50
    const clips = data.clips
    const first = clips[0]?.startMs ?? 0
    // A rolling two-minute view; older recorded clips remain in the dialogue list.
    const origin = Math.floor(Math.max(first, data.timeMs - 120000) / 5000) * 5000
    const width = Math.max(this.viewport.clientWidth - 140, (data.timeMs - origin) / 1000 * this.zoom + 80)
    const lanes = [...new Set(clips.filter(clip => (clip.endMs ?? data.timeMs) >= origin).map(clip => clip.lane))]
    const timelineKey = JSON.stringify([origin, this.zoom, clips.map(clip => [clip.id, clip.lane]), this.viewport.clientWidth, Math.floor(data.timeMs / 5000)])
    if (timelineKey !== this.timelineKey) {
      this.timelineKey = timelineKey
      const ticks: number[] = []
      for (let time = Math.ceil(origin / 5000) * 5000; time <= data.timeMs + 5000; time += 5000) ticks.push(time)
      render(html`<div class="scene-ruler" style=${styleMap({ width: `${width}px` })}>
        ${ticks.map(time => html`<span style=${styleMap({ left: `${(time - origin) / 1000 * this.zoom}px` })}>${seconds(time)}</span>`)}
      </div>${repeat(lanes, lane => lane, (lane) => {
        let slot = 0
        let lastEnd = -1
        let height = 32
        const items = clips.filter(item => item.lane === lane && (item.endMs ?? data.timeMs) >= origin).map((clip) => {
          slot = clip.startMs < lastEnd ? slot + 1 : 0
          lastEnd = clip.endMs ?? data.timeMs
          height = Math.max(height, slot * 26 + 32)
          return { clip, slot }
        })
        return html`<div class="scene-track"><span class="scene-track-label">${lane}</span>
          <div class="scene-track-clips" style=${styleMap({ width: `${width}px`, minHeight: `${height}px` })}>
            ${repeat(items, item => item.clip.id, ({ clip, slot }) => html`<button type="button" class="scene-clip" data-kind=${clip.kind} data-clip=${clip.id}
              aria-pressed=${String(this.selected === clip.id)} style=${styleMap({ left: `${Math.max(0, clip.startMs - origin) / 1000 * this.zoom}px`, width: `${Math.max(6, ((clip.endMs ?? data.timeMs) - Math.max(clip.startMs, origin)) / 1000 * this.zoom)}px`, top: `${slot * 26 + 3}px` })}
              title=${`${lane}，${clip.label}\n${seconds(clip.startMs)} – ${clip.endMs === undefined ? '进行中' : seconds(clip.endMs)}${clip.source ? `\n${clip.source.path}:${clip.source.line}` : '\n没有 QS 源码定位'}\n点击定位属性；双击对白从此处运行`}
              @click=${() => this.source(clip)} @dblclick=${() => {
                if (clip.kind === 'dialogue')
                  this.source(clip, true)
              }}>${clip.label}</button>`)}
          </div></div>`
      })}`, this.timeline)
    }
    for (const region of this.timeline.querySelectorAll<HTMLElement>('.scene-track-clips, .scene-ruler')) region.style.width = `${width}px`
    for (const button of this.timeline.querySelectorAll<HTMLButtonElement>('.scene-clip')) {
      const clip = clips.find(item => item.id === Number(button.dataset.clip))!
      button.setAttribute('aria-pressed', String(this.selected === clip.id))
      button.style.width = `${Math.max(6, ((clip.endMs ?? data.timeMs) - Math.max(clip.startMs, origin)) / 1000 * this.zoom)}px`
    }
    if (follow)
      this.viewport.scrollLeft = this.viewport.scrollWidth
    this.renderDetails(data)
  }

  private renderDetails(data: PreviewDebugSnapshot): void {
    const audio = data.clips.filter(clip => clip.track && clip.endMs === undefined)
    const dialogue = data.clips.filter(clip => clip.kind === 'dialogue')
    const key = JSON.stringify([dialogue.map(item => item.id), audio.map(item => [item.id, item.track?.state])])
    if (key !== this.detailKey) {
      this.detailKey = key
      this.audioTimes.clear()
      render(html`<div class="scene-dialogue-list">${repeat(dialogue, clip => clip.id, clip => html`
        <button type="button" title="点击定位 QS 属性；双击从这句运行" data-clip=${clip.id}
          @click=${() => this.source(clip)} @dblclick=${() => this.source(clip, true)}>${seconds(clip.startMs)}  ${clip.lane}：${clip.label}</button>`)}
        </div><div class="scene-audio-list">${audio.map((clip) => {
          const time = element(html`<output></output>`)
          this.audioTimes.set(clip.track!.id, time)
          return html`<div class="scene-audio-row"><button type="button" @click=${() => this.source(clip)}>${clip.lane}，${clip.label}</button>${time}
            ${([[clip.track!.state === 'paused' ? 'resume' : 'pause', clip.track!.state === 'paused' ? '播放' : '暂停'], ['seek', '重播'], ['stop', '停止']] as const).map(([action, title]) => html`
              <button type="button" ?disabled=${!data.audioControl}
                @click=${() => void this.debug({ kind: 'audio', action, target: clip.track!.id, positionMs: action === 'seek' ? 0 : undefined }).catch(error => this.message.textContent = String(error))}>${title}</button>`)}
            <input type="range" min="0" .max=${String(Math.round(clip.playback?.durationMs || 0))} .value=${String(Math.round(clip.playback?.positionMs || 0))}
              aria-label=${`${clip.label} 播放位置`} ?disabled=${!data.audioControl || !clip.playback?.durationMs}
              @change=${(event: Event) => void this.debug({ kind: 'audio', action: 'seek', target: clip.track!.id, positionMs: Number((event.currentTarget as HTMLInputElement).value) }).catch(error => this.message.textContent = String(error))}>
          </div>`
        })}${!audio.length ? html`<p>当前没有音频</p>` : nothing}</div>
        <p class="scene-debug-note">时间轴记录实际经过的对白和音频意图；播放位置来自音频设备。${data.truncated ? '已保留最近 400 条。' : ''}</p>`, this.details)
    }
    for (const clip of audio) {
      const output = this.audioTimes.get(clip.track!.id)
      if (output) {
        output.textContent = clip.playback ? `${states[clip.playback.state]}，${seconds(clip.playback.positionMs)} / ${seconds(clip.playback.durationMs)}${clip.track!.loop ? ' ↻' : ''}` : `意图：${clip.track!.state}，等待设备采样`
        const seek = output.parentElement!.querySelector('input')!
        if (document.activeElement !== seek) {
          seek.max = String(Math.round(clip.playback?.durationMs || 0))
          seek.value = String(Math.round(clip.playback?.positionMs || 0))
          seek.disabled = !data.audioControl || !clip.playback?.durationMs
        }
      }
    }
  }
}
