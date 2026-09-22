import type {
  EditorPluginContext,
  EditorProject,
} from '@quajs/editor-core'
import type { AnimationTimeline } from '@quajs/plugin-animation'
import type { AnimationCatalog, AnimationRecord } from '../contracts.js'
import type { editTimeline, Property } from '../model/timeline.js'
import { element, html, nothing, render } from '@quajs/editor-controls'
import {
  easings,
  MAX_DURATION,
  properties,
} from '../model/timeline.js'
import { button, field, input, section, select } from './dom.js'

interface ViewContext {
  catalog: AnimationCatalog
  record: AnimationRecord | undefined
  choose: (record?: AnimationRecord, fromSource?: boolean) => void
  applied: boolean
  apply: () => Promise<void>
  busy: boolean
  dirty: boolean
  history: (forward: boolean) => void
  undo: string[]
  redo: string[]
  toolbar: HTMLDivElement
  context: EditorPluginContext
  settingsOpen: boolean
  inspector: HTMLDivElement
  timeline: AnimationTimeline
  change: (edit: Parameters<typeof editTimeline>[1]) => void
  path: string
  persist: () => void
  track: number
  project: EditorProject | undefined
  images: Map<string, string>
  loadImage: (target: string, path: string) => Promise<void>
  key: number
  playButton: HTMLButtonElement | undefined
  playing: boolean
  togglePlay: () => void
  seekInput: HTMLInputElement | undefined
  time: number
  seek: (time: number) => void
  readout: HTMLElement | undefined
  addKey: () => void
  zoom: number
  renderTimeline: () => void
  transport: HTMLDivElement
  addTrack: () => void
}

export function createAnimationViews(context: ViewContext) {
  function renderToolbar(): void {
    render(html`
      <select class="editor-select" aria-label="动画文件" @change=${(event: Event) => context.choose(context.catalog.animations.find(item => item.path === (event.currentTarget as HTMLSelectElement).value))}>
        ${[{ path: '', title: '新动画' }, ...context.catalog.animations.map(item => ({ path: item.path, title: item.path }))].map(item => html`<option value=${item.path} .selected=${item.path === (context.record?.path ?? '')}>${item.title}</option>`)}
      </select>
      <button type="button" @click=${() => context.choose()}>新建动画</button>
      <button type="button" ?disabled=${!context.undo.length} @click=${() => context.history(false)}>撤销</button>
      <button type="button" ?disabled=${!context.redo.length} @click=${() => context.history(true)}>重做</button>
      <button type="button" class="editor-button" data-variant="primary" ?disabled=${context.busy || context.applied || (!context.dirty && Boolean(context.record))} @click=${() => void context.apply()}>${context.applied ? '等待源文件保存' : '应用到源文件'}</button>
      ${context.record
        ? html`<button type="button" @click=${() => context.context.openSource({ path: context.record!.path, line: 1, column: 1 })}>查看源码</button>
        ${context.applied ? html`<button type="button" @click=${() => context.choose(context.catalog.animations.find(item => item.path === context.record!.path))}>重新读取源码</button>` : nothing}`
        : nothing}
      ${context.catalog.issues.length ? html`<details class="animation-issues"><summary>${context.catalog.issues.length} 个文件需检查</summary><pre>${context.catalog.issues.join('\n')}</pre></details>` : nothing}
    `, context.toolbar)
  }

  function renderInspector(): void {
    context.settingsOpen = context.inspector.querySelector<HTMLDetailsElement>('.animation-settings')?.open ?? context.settingsOpen
    const id = input(context.timeline.id ?? '', value => context.change((draft) => {
      draft.id = value.trim()
    }))
    const duration = input(context.timeline.duration, value => context.change((draft) => {
      draft.duration = Number(value)
    }), 'number')
    duration.min = '1'
    duration.max = String(MAX_DURATION)
    const settings = element(html`<details class="animation-settings" .open=${context.settingsOpen}><summary>播放设置</summary>
      ${field('延迟', input(context.timeline.delay ?? 0, value => context.change((draft) => {
        draft.delay = Number(value)
      }), 'number'), { unit: 'ms', accessibleName: '延迟 ms' })}
      ${field('播放速度', input(context.timeline.playbackRate ?? 1, value => context.change((draft) => {
        draft.playbackRate = Number(value)
      }), 'number'))}
      ${field('循环', select([{ value: 'once', title: '单次播放' }, { value: 'forever', title: '无限循环' }, { value: 'count', title: '指定次数' }], typeof context.timeline.loop === 'number' ? 'count' : context.timeline.loop ? 'forever' : 'once', value => context.change((draft) => {
        draft.loop = value === 'count' ? 2 : value === 'forever'
      })))}
      ${typeof context.timeline.loop === 'number'
        ? field('循环次数', input(context.timeline.loop, value => context.change((draft) => {
            draft.loop = Number(value)
          }), 'number'))
        : nothing}
      ${field('方向', select([{ value: 'normal', title: '正向' }, { value: 'reverse', title: '反向' }, { value: 'alternate', title: '往返' }, { value: 'alternate-reverse', title: '反向往返' }], context.timeline.direction ?? 'normal', value => context.change((draft) => {
        draft.direction = value as AnimationTimeline['direction']
      })))}
      ${field('填充', select([{ value: 'none', title: '不填充' }, { value: 'forwards', title: '保持结束' }, { value: 'backwards', title: '保持开始' }, { value: 'both', title: '保持两端' }], context.timeline.fill ?? 'forwards', value => context.change((draft) => {
        draft.fill = value as AnimationTimeline['fill']
      })))}
      ${field('结束提交', select([{ value: 'none', title: '不提交' }, { value: 'final', title: '提交最终值' }], String(context.timeline.commit ?? 'final'), value => context.change((draft) => {
        draft.commit = value as 'none' | 'final'
      })))}
    </details>`)
    const animation = section('动画', field('动画 ID', id), field('时长', duration, { unit: 'ms', accessibleName: '时长 ms' }), ...(!context.record
      ? [field('新文件路径', input(context.path, (value) => {
          context.path = value.trim()
          context.dirty = true
          context.persist()
        }), { layout: 'stack' })]
      : []), settings)
    const track = context.timeline.tracks[context.track]
    if (!track) {
      render(html`${animation}`, context.inspector)
      return
    }
    const target = track.target ?? 'self'
    const assets = [{ value: '', title: '占位形状' }, ...(context.project?.entries ?? []).filter(item => item.kind === 'image').slice(0, 2000).map(item => ({ value: item.path, title: item.path }))]
    const trackSection = section('选中轨道', field('目标', input(target, value => context.change((draft) => {
      draft.tracks[context.track].target = value.trim()
    }))), field('属性', select(Object.entries(properties).map(([value, data]) => ({ value, title: data.title })), track.property, value => context.change((draft) => {
      draft.tracks[context.track].property = value
      for (const key of draft.tracks[context.track].keyframes) key.value = properties[value as Property].initial
    }))), field('插值', select([{ value: 'number', title: '连续插值' }, { value: 'step', title: '阶梯' }, { value: 'discrete', title: '离散' }], track.interpolation ?? 'number', value => context.change((draft) => {
      draft.tracks[context.track].interpolation = value as 'number' | 'step' | 'discrete'
    }))), field('预览图片', select(assets, context.images.get(target) ?? '', (path) => {
      context.images.set(target, path)
      void context.loadImage(target, path)
    })))
    const key = track.keyframes[context.key]
    let keySection: HTMLElement | undefined
    if (key) {
      const easing = input(key.easing ?? 'linear', value => context.change((draft) => {
        draft.tracks[context.track].keyframes[context.key].easing = value
      }))
      easing.setAttribute('list', 'qua-animation-easings')
      keySection = section(`关键帧 ${context.key + 1} / ${track.keyframes.length}`, field('时间', input(Number(key.at), value => context.change((draft) => {
        draft.tracks[context.track].keyframes[context.key].at = Number(value)
      }), 'number'), { unit: 'ms', accessibleName: '时间 ms' }), field('数值', input(Number(key.value), value => context.change((draft) => {
        draft.tracks[context.track].keyframes[context.key].value = Number(value)
      }), 'number'), { unit: track.property === 'position.rotation' ? '°' : ['position.x', 'position.y'].includes(track.property) ? 'px' : track.property === 'position.scale' ? '×' : undefined }), field('缓动', easing), element(html`<datalist id="qua-animation-easings">${easings.map(value => html`<option value=${value}></option>`)}</datalist>`))
    }
    render(html`${animation}${trackSection}${keySection ?? nothing}<div class="animation-inline-actions editor-actions">
      <button type="button" class="editor-button" data-variant="danger" ?disabled=${track.keyframes.length <= 1} @click=${() => context.change((draft) => {
        draft.tracks[context.track].keyframes.splice(context.key, 1)
        context.key = Math.max(0, context.key - 1)
      })}>删除关键帧</button>
      <button type="button" class="editor-button" data-variant="danger" @click=${() => context.change((draft) => {
        draft.tracks.splice(context.track, 1)
        context.track = Math.max(0, context.track - 1)
        context.key = 0
      })}>删除轨道</button>
    </div>`, context.inspector)
  }

  function renderTransport(): void {
    context.playButton = button(context.playing ? '暂停' : '播放', () => context.togglePlay())
    context.seekInput = input(context.time, value => context.seek(Number(value)), 'range')
    context.seekInput.min = '0'
    context.seekInput.max = String(context.timeline.duration)
    context.seekInput.step = '1'
    context.seekInput.setAttribute('aria-label', '播放位置')
    context.seekInput.addEventListener('input', () => context.seek(Number(context.seekInput!.value)))
    context.readout = element(html`<output class="animation-time">${Math.round(context.time)} / ${context.timeline.duration} ms</output>`)
    const add = button('+ 关键帧', () => context.addKey())
    add.disabled = !context.timeline.tracks[context.track]
    const zoom = select(['0.5', '1', '2', '4'], String(context.zoom), (value) => {
      context.zoom = Number(value)
      context.renderTimeline()
    })
    zoom.setAttribute('aria-label', '时间轴缩放')
    render(html`${context.playButton}${button('回到起点', () => context.seek(0))}${context.seekInput}${context.readout}${button('+ 轨道', () => context.addTrack())}${add}${zoom}`, context.transport)
  }
  return { renderToolbar, renderInspector, renderTransport }
}
