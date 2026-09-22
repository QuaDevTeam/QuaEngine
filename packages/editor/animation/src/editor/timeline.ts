import type { AnimationTimeline } from '@quajs/plugin-animation'
import type { Property } from '../model/timeline.js'
import { element, html, render as renderView, styleMap } from '@quajs/editor-controls'
import { properties } from '../model/timeline.js'

export class TimelineView {
  private readonly root = element(html`<div class="animation-timeline"></div>`)
  private readonly playhead = element(html`<div class="animation-playhead"></div>`)
  private time = 0
  private duration = 1
  private cancelDrag?: () => void

  constructor(
    host: HTMLElement,
    private readonly actions: {
      seek: (time: number) => void
      select: (track: number, key: number) => void
      move: (track: number, key: number, time: number) => void
      add: (track: number, time: number) => void
    },
  ) {
    host.append(this.root)
  }

  render(
    timeline: AnimationTimeline,
    selectedTrack: number,
    selectedKey: number,
    zoom: number,
  ): void {
    this.cancelDrag?.()
    this.duration = timeline.duration
    this.root.style.setProperty('--timeline-width', `${Math.max(400, zoom * 600)}px`)
    const ticks = Math.min(10, Math.floor(Math.max(400, zoom * 600) / 85))
    renderView(html`
      <div class="animation-ruler"><span class="animation-track-label">目标 / 属性</span>
        <div class="animation-lane animation-scale" aria-label="时间标尺" tabindex="0"
          @pointerdown=${(event: PointerEvent) => this.drag(event, event.currentTarget as HTMLElement, time => this.actions.seek(time))}
          @keydown=${(event: KeyboardEvent) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
              return
            event.preventDefault()
            this.actions.seek(Math.max(0, Math.min(this.duration, this.time + (event.key === 'ArrowLeft' ? -10 : 10))))
          }}>${Array.from({ length: ticks + 1 }, (_, index) => html`<span class="animation-tick" style=${styleMap({ left: `${index * 100 / ticks}%` })}>${Math.round(timeline.duration * index / ticks)} ms</span>`)}</div>
      </div>
      ${timeline.tracks.map((track, index) => html`<div class=${`animation-track${index === selectedTrack ? ' is-selected' : ''}`}>
        <button type="button" class="animation-track-label" title=${`${track.target ?? 'self'} / ${track.property}`} @click=${() => this.actions.select(index, 0)}>${track.target ?? 'self'}，${properties[track.property as Property].title}</button>
        <div class="animation-lane" data-track=${index} @pointerdown=${(event: PointerEvent) => {
          if (event.target === event.currentTarget)
            this.drag(event, event.currentTarget as HTMLElement, time => this.actions.seek(time))
        }} @dblclick=${(event: MouseEvent) => {
          if (event.target === event.currentTarget)
            this.actions.add(index, this.at(event.clientX, event.currentTarget as HTMLElement))
        }}>${track.keyframes.map((key, keyIndex) => html`
          <button type="button" class=${`animation-key${index === selectedTrack && keyIndex === selectedKey ? ' is-selected' : ''}`}
            style=${styleMap({ left: `${Number(key.at) / timeline.duration * 100}%` })} aria-label=${`${track.target ?? 'self'} ${properties[track.property as Property].title} ${key.at} ms`}
            title=${`时间：${key.at} ms，值：${key.value}`} @click=${() => this.actions.select(index, keyIndex)}
            @pointerdown=${(event: PointerEvent) => {
              event.stopPropagation()
              const diamond = event.currentTarget as HTMLButtonElement
              let moved = false
              this.drag(event, diamond.parentElement!, (time) => {
                moved = true
                diamond.style.left = `${time / timeline.duration * 100}%`
              }, (time) => {
                if (moved)
                  this.actions.move(index, keyIndex, time)
              }, false)
            }} @keydown=${(event: KeyboardEvent) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
                return
              event.preventDefault()
              this.actions.move(index, keyIndex, Math.max(0, Math.min(this.duration, Number(key.at) + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10))))
            }}></button>`)}
        </div>
      </div>`)}${this.playhead}
    `, this.root)
    this.setTime(this.time)
  }

  setTime(time: number): void {
    this.time = time
    this.playhead?.style.setProperty(
      'left',
      `calc(190px + var(--timeline-width) * ${time / this.duration})`,
    )
  }

  dispose(): void {
    this.cancelDrag?.()
  }

  private at(clientX: number, lane: HTMLElement): number {
    const rect = lane.getBoundingClientRect()
    return Math.max(
      0,
      Math.min(
        this.duration,
        Math.round(
          (((clientX - rect.left) / Math.max(1, rect.width)) * this.duration)
          / 10,
        ) * 10,
      ),
    )
  }

  private drag(
    event: PointerEvent,
    lane: HTMLElement,
    move: (time: number) => void,
    finish?: (time: number) => void,
    initial = true,
  ): void {
    if (event.button !== 0)
      return
    this.cancelDrag?.()
    event.preventDefault()
    const update = (event: PointerEvent) => move(this.at(event.clientX, lane))
    let end: (event: PointerEvent) => void
    const cleanup = () => {
      window.removeEventListener('pointermove', update)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cleanup)
      this.cancelDrag = undefined
    }
    end = (event: PointerEvent) => {
      cleanup()
      finish?.(this.at(event.clientX, lane))
    }
    this.cancelDrag = cleanup
    window.addEventListener('pointermove', update)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cleanup)
    if (initial)
      update(event)
  }
}
