import type {
  EditorPluginContext,
  EditorPluginPanel,
  EditorProject,
  EditorSourceLocation,
} from '@quajs/editor-core'
import type { AnimationCatalog, AnimationRecord } from '../contracts.js'
import type { Property } from '../model/timeline.js'
import type { AnimationPreview } from '../preview/isolated.js'
import { element, html, nothing, render as renderView } from '@quajs/editor-controls'
import { ANIMATION_EDITOR_ID } from '../contracts.js'
import {
  editTimeline,
  newTimeline,
  parseTimeline,
  properties,
  sampleTrack,
  serializeTimeline,
} from '../model/timeline.js'
import { button } from './dom.js'
import { createAnimationPlayback } from './playback.js'
import { AnimationSceneControls } from './scene-controls.js'
import { TimelineView } from './timeline.js'
import { createAnimationViews } from './views.js'

export class AnimationEditor implements EditorPluginPanel {
  private readonly viewsView = ((owner: AnimationEditor) => {
    return createAnimationViews({
      get catalog() {
        return owner.catalog
      },
      set catalog(value) {
        owner.catalog = value
      },
      get record() {
        return owner.record
      },
      set record(value) {
        owner.record = value
      },
      choose: (...args) => this.choose(...args),
      get applied() {
        return owner.applied
      },
      set applied(value) {
        owner.applied = value
      },
      apply: (...args) => this.apply(...args),
      get busy() {
        return owner.busy
      },
      set busy(value) {
        owner.busy = value
      },
      get dirty() {
        return owner.dirty
      },
      set dirty(value) {
        owner.dirty = value
      },
      history: (...args) => this.history(...args),
      get undo() {
        return owner.undo
      },

      get redo() {
        return owner.redo
      },

      get toolbar() {
        return owner.toolbar
      },

      get context() {
        return owner.context
      },

      get settingsOpen() {
        return owner.settingsOpen
      },
      set settingsOpen(value) {
        owner.settingsOpen = value
      },
      get inspector() {
        return owner.inspector
      },

      get timeline() {
        return owner.timeline
      },
      set timeline(value) {
        owner.timeline = value
      },
      change: (...args) => this.change(...args),
      get path() {
        return owner.path
      },
      set path(value) {
        owner.path = value
      },
      persist: (...args) => this.persist(...args),
      get track() {
        return owner.track
      },
      set track(value) {
        owner.track = value
      },
      get project() {
        return owner.project
      },
      set project(value) {
        owner.project = value
      },
      get images() {
        return owner.images
      },

      loadImage: (...args) => this.playbackView.loadImage(...args),
      get key() {
        return owner.key
      },
      set key(value) {
        owner.key = value
      },
      get playButton() {
        return owner.playButton
      },
      set playButton(value) {
        owner.playButton = value
      },
      get playing() {
        return owner.playing
      },
      set playing(value) {
        owner.playing = value
      },
      togglePlay: (...args) => this.playbackView.togglePlay(...args),
      get seekInput() {
        return owner.seekInput
      },
      set seekInput(value) {
        owner.seekInput = value
      },
      get time() {
        return owner.time
      },
      set time(value) {
        owner.time = value
      },
      seek: (...args) => this.playbackView.seek(...args),
      get readout() {
        return owner.readout
      },
      set readout(value) {
        owner.readout = value
      },
      addKey: (...args) => this.addKey(...args),
      get zoom() {
        return owner.zoom
      },
      set zoom(value) {
        owner.zoom = value
      },
      renderTimeline: (...args) => this.renderTimeline(...args),
      get transport() {
        return owner.transport
      },

      addTrack: (...args) => this.addTrack(...args),
    })
  })(this)

  private readonly playbackView = ((owner: AnimationEditor) => {
    return createAnimationPlayback({
      get playbackMode() {
        return owner.playbackMode
      },
      set playbackMode(value) {
        owner.playbackMode = value
      },
      get time() {
        return owner.time
      },
      set time(value) {
        owner.time = value
      },
      get timeline() {
        return owner.timeline
      },
      set timeline(value) {
        owner.timeline = value
      },
      get playbackTime() {
        return owner.playbackTime
      },
      set playbackTime(value) {
        owner.playbackTime = value
      },
      get seekInput() {
        return owner.seekInput
      },
      set seekInput(value) {
        owner.seekInput = value
      },
      get readout() {
        return owner.readout
      },
      set readout(value) {
        owner.readout = value
      },
      get timelineView() {
        return owner.timelineView
      },

      get playing() {
        return owner.playing
      },
      set playing(value) {
        owner.playing = value
      },
      get visible() {
        return owner.visible
      },
      set visible(value) {
        owner.visible = value
      },
      get playStarted() {
        return owner.playStarted
      },
      set playStarted(value) {
        owner.playStarted = value
      },
      get playButton() {
        return owner.playButton
      },
      set playButton(value) {
        owner.playButton = value
      },
      get disposed() {
        return owner.disposed
      },
      set disposed(value) {
        owner.disposed = value
      },
      get frame() {
        return owner.frame
      },
      set frame(value) {
        owner.frame = value
      },
      get sceneControls() {
        return owner.sceneControls
      },

      get preview() {
        return owner.preview
      },
      set preview(value) {
        owner.preview = value
      },
      get project() {
        return owner.project
      },
      set project(value) {
        owner.project = value
      },
      get stage() {
        return owner.stage
      },

      showError: (...args) => this.showError(...args),
      get images() {
        return owner.images
      },

      get imageGeneration() {
        return owner.imageGeneration
      },
      set imageGeneration(value) {
        owner.imageGeneration = value
      },
      get context() {
        return owner.context
      },

    })
  })(this)

  private readonly root = element(html`<section class="animation-editor editor-controls"></section>`)
  private readonly toolbar = element<HTMLDivElement>(html`<div class="animation-toolbar"></div>`)
  private readonly stage = element<HTMLDivElement>(html`<div class="animation-preview"></div>`)
  private readonly inspector = element<HTMLDivElement>(html`<div class="animation-inspector"></div>`)
  private readonly transport = element<HTMLDivElement>(html`<div class="animation-transport"></div>`)
  private readonly tracks = element<HTMLDivElement>(html`<div class="animation-tracks"></div>`)
  private readonly message = element<HTMLDivElement>(html`<div class="animation-message"></div>`)
  private readonly timelineView: TimelineView
  private readonly sceneControls: AnimationSceneControls
  private project?: EditorProject
  private catalog: AnimationCatalog = { animations: [], issues: [] }
  private timeline = newTimeline()
  private record?: AnimationRecord
  private path = 'animation.animation.json'
  private dirty = false
  private applied = false
  private appliedText?: string
  private visible = false
  private disposed = false
  private busy = false
  private source?: EditorSourceLocation
  private sourceSwitch = false
  private preview?: AnimationPreview
  private settingsOpen = false
  private track = 0
  private key = 0
  private time = 0
  private zoom = 1
  private frame?: number
  private playing = false
  private playStarted = 0
  private playbackTime = 0
  private playbackMode = false
  private readonly undo: string[] = []
  private readonly redo: string[] = []
  private readonly images = new Map<string, string>()
  private imageGeneration = 0
  private seekInput?: HTMLInputElement
  private playButton?: HTMLButtonElement
  private readout?: HTMLElement
  private readonly visibilityChanged = () => {
    if (document.hidden) {
      this.playbackView.pause()
      this.timelineView.dispose()
      this.playbackView.destroyPreview()
      this.sceneControls.setVisible(false)
    }
    else if (this.visible) {
      this.sceneControls.setVisible(true)
      this.playbackView.ensurePreview()
    }
  }

  constructor(
    host: HTMLElement,
    private readonly context: EditorPluginContext,
  ) {
    this.root.setAttribute('aria-label', '动画编辑器')
    this.stage.setAttribute('aria-label', 'Web renderer 动画预览')
    this.message.setAttribute('role', 'status')
    this.sceneControls = new AnimationSceneControls(context, this.stage, () => {
      if (this.sceneControls.usesScene)
        this.playbackView.destroyPreview()
      else if (this.visible)
        this.playbackView.ensurePreview()
      this.playbackView.projectFrame()
    }, (path) => {
      const target = this.timeline.tracks[this.track]?.target ?? 'self'
      this.images.set(target, path)
      void this.playbackView.loadImage(target, path)
      this.viewsView.renderInspector()
    })
    renderView(html`${this.toolbar}${this.sceneControls.element}
      <div class="animation-body"><div class="animation-workspace">${this.stage}${this.transport}${this.tracks}</div>${this.inspector}</div>
      ${this.message}`, this.root)
    renderView(this.root, host)
    context.mountStatus?.(this.message)
    this.timelineView = new TimelineView(this.tracks, {
      seek: time => this.playbackView.seek(time),
      select: (track, key) => {
        this.track = track
        this.key = key
        this.playbackView.seek(Number(this.timeline.tracks[track].keyframes[key]?.at ?? 0))
        this.viewsView.renderInspector()
        this.renderTimeline()
      },
      move: (track, key, time) => {
        this.track = track
        this.key = key
        this.change((draft) => {
          draft.tracks[track].keyframes[key].at = time
        })
      },
      add: (track, time) => {
        this.track = track
        this.playbackView.seek(time)
        this.addKey()
      },
    })
    this.root.addEventListener('keydown', (event) => {
      if ((event.target as HTMLElement).matches('input, select, textarea'))
        return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.stopPropagation()
        this.history(event.shiftKey)
      }
      else if (event.code === 'Space' && event.target === this.stage) {
        event.preventDefault()
        this.playbackView.togglePlay()
      }
    })
    this.stage.tabIndex = 0
    document.addEventListener('visibilitychange', this.visibilityChanged)
  }

  update(project: EditorProject): void {
    const changed = this.project?.root !== project.root
    if (changed) {
      this.source = undefined
      this.sourceSwitch = false
      this.persist()
      this.playbackView.pause()
      this.playbackView.destroyPreview()
      this.images.clear()
    }
    this.project = project
    const slot = project.plugins?.[ANIMATION_EDITOR_ID]
    this.catalog = (slot?.data as AnimationCatalog) ?? {
      animations: [],
      issues: slot?.error ? [slot.error] : [],
    }
    if (changed) {
      this.load(this.catalog.animations[0])
      this.restore()
    }
    else if (this.record) {
      const next = this.catalog.animations.find(
        item => item.path === this.record!.path,
      )
      if (
        next
        && this.appliedText
        && serializeTimeline(next.timeline) === this.appliedText
      ) {
        this.record = next
        this.applied = false
        this.appliedText = undefined
        this.dirty
          = serializeTimeline(next.timeline) !== serializeTimeline(this.timeline)
        this.persist()
        renderView(this.dirty
          ? '源文件已保存，可以应用后续修改。'
          : '动画源文件已保存。', this.message)
      }
      else if (
        next
        && serializeTimeline(next.timeline) === serializeTimeline(this.timeline)
      ) {
        this.record = next
        this.dirty = false
        this.applied = false
        this.persist()
      }
      else if (
        next
        && !this.dirty
        && !this.applied
        && next.edit.revision !== this.record.edit.revision
      ) {
        this.load(next)
      }
      if (next && this.record)
        this.record = { ...this.record, bindings: next.bindings }
    }
    // Watch refreshes must not replace a focused input or unfinished form.
    if (changed || !this.root.contains(document.activeElement))
      this.render()
    this.root.dataset.indexVersion = String(
      Number(this.root.dataset.indexVersion ?? 0) + 1,
    )
    this.sceneControls.update(project, this.catalog, this.record)
    if (this.visible)
      this.playbackView.ensurePreview()
    if (this.sourceSwitch)
      this.revealSource(this.source)
  }

  revealSource(source: EditorSourceLocation | undefined): void {
    this.source = source
    if (this.sourceSwitch) {
      renderView(nothing, this.message)
      this.sourceSwitch = false
    }
    if (!source || this.disposed || this.busy)
      return
    const record = this.catalog.animations.find(item => item.path === source.path)
    if (record && record.path !== this.record?.path)
      this.choose(record, true)
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible)
      return
    this.visible = visible
    this.sceneControls.setVisible(visible)
    if (visible) {
      if (!this.sourceSwitch)
        this.render()
      this.playbackView.ensurePreview()
    }
    else {
      this.playbackView.pause()
      this.timelineView.dispose()
      this.playbackView.destroyPreview()
    }
  }

  dispose(): void {
    this.persist()
    this.disposed = true
    this.playbackView.pause()
    this.timelineView.dispose()
    this.sceneControls.dispose()
    this.playbackView.destroyPreview()
    document.removeEventListener('visibilitychange', this.visibilityChanged)
    this.root.remove()
  }

  private load(record?: AnimationRecord): void {
    this.record = record
    this.timeline = record
      ? parseTimeline(JSON.stringify(record.timeline))
      : newTimeline()
    this.path = record?.path ?? 'animation.animation.json'
    this.dirty = false
    this.applied = false
    this.appliedText = undefined
    this.track = 0
    this.key = 0
    this.time = 0
    this.playbackTime = 0
    this.playbackMode = false
    this.undo.length = 0
    this.redo.length = 0
    renderView(nothing, this.message)
  }

  private choose(record?: AnimationRecord, fromSource = false): void {
    if (this.busy)
      return
    if (!fromSource) {
      this.source = undefined
      this.sourceSwitch = false
    }
    const requestedSource = this.source
    const apply = () => {
      if (fromSource) {
        if (this.source !== requestedSource || this.source?.path !== record?.path)
          return
        record = this.catalog.animations.find(item => item.path === this.source!.path)
        if (!record)
          return
      }
      this.sourceSwitch = false
      this.playbackView.pause()
      this.load(record)
      if (this.project)
        this.sceneControls.update(this.project, this.catalog, this.record)
      this.persist()
      this.render()
      this.playbackView.projectFrame()
    }
    if (this.dirty || [...this.inspector.querySelectorAll('input')].some(input => input.value !== input.defaultValue)) {
      this.sourceSwitch = fromSource
      renderView(html`<span>当前动画有尚未应用的更改。</span>${button('放弃更改并切换', apply)}`, this.message)
      this.viewsView.renderToolbar()
    }
    else {
      apply()
    }
  }

  private render(): void {
    this.viewsView.renderToolbar()
    this.viewsView.renderInspector()
    this.viewsView.renderTransport()
    this.renderTimeline()
  }

  private renderTimeline(): void {
    this.timelineView.render(this.timeline, this.track, this.key, this.zoom)
    this.timelineView.setTime(this.time)
  }

  private change(edit: Parameters<typeof editTimeline>[1]): void {
    if (this.busy)
      return
    const selectedTrack = this.track
    const selectedKey = this.key
    this.playbackView.pause()
    try {
      const before = serializeTimeline(this.timeline)
      const next = editTimeline(this.timeline, edit)
      this.undo.push(before)
      while (this.undo.length > 50 || this.undo.reduce((size, entry) => size + entry.length * 2, 0) > 2 * 1024 * 1024)
        this.undo.shift()
      this.redo.length = 0
      this.timeline = next
      this.dirty = true
      this.time = Math.min(this.time, next.duration)
      this.playbackMode = false
      renderView(this.applied
        ? '更改已暂存；先保存源文件，再应用后续修改。'
        : '更改已暂存在此编辑器，应用后可在源码中撤销和保存。', this.message)
      this.persist()
      this.render()
      this.playbackView.projectFrame()
    }
    catch (error) {
      this.track = selectedTrack
      this.key = selectedKey
      this.showError(error)
      this.viewsView.renderInspector()
    }
  }

  private history(forward: boolean): void {
    if (this.busy)
      return
    const from = forward ? this.redo : this.undo
    const text = from.pop()
    if (!text)
      return
    this.playbackView.pause();
    (forward ? this.undo : this.redo).push(serializeTimeline(this.timeline))
    this.timeline = parseTimeline(text)
    this.track = Math.min(
      this.track,
      Math.max(0, this.timeline.tracks.length - 1),
    )
    this.key = Math.min(
      this.key,
      Math.max(
        0,
        (this.timeline.tracks[this.track]?.keyframes.length ?? 1) - 1,
      ),
    )
    this.dirty = true
    this.time = Math.min(this.time, this.timeline.duration)
    this.persist()
    this.render()
    this.playbackView.projectFrame()
  }

  private addTrack(): void {
    this.change((draft) => {
      let target = this.timeline.tracks[this.track]?.target ?? 'self'
      let property = Object.keys(properties).find(
        property =>
          !draft.tracks.some(
            track =>
              (track.target ?? 'self') === target
              && track.property === property,
          ),
      )
      if (!property) {
        let index = 1
        while (
          draft.tracks.some(
            track => track.target === `character:subject-${index}`,
          )
        ) {
          index++
        }
        target = `character:subject-${index}`
        property = 'position.x'
      }
      draft.tracks.push({
        target,
        property,
        interpolation: 'number',
        keyframes: [{ at: 0, value: properties[property as Property].initial }],
      })
      this.track = draft.tracks.length - 1
      this.key = 0
    })
  }

  private addKey(): void {
    const track = this.timeline.tracks[this.track]
    if (!track)
      return
    const time = Math.round(this.time)
    const existing = track.keyframes.findIndex(key => key.at === time)
    if (existing >= 0) {
      this.key = existing
      this.viewsView.renderInspector()
      this.renderTimeline()
      renderView('该时间已有关键帧，已选中。', this.message)
      return
    }
    const value = sampleTrack(this.timeline, this.track, time)
    this.change((draft) => {
      draft.tracks[this.track].keyframes.push({
        at: time,
        value,
        easing: 'linear',
      })
      this.key = draft.tracks[this.track].keyframes.length - 1
    })
  }

  private async apply(): Promise<void> {
    const root = this.project?.root
    if (!root || this.busy || this.applied)
      return
    this.busy = true
    this.viewsView.renderToolbar()
    try {
      const text = serializeTimeline(this.timeline)
      if (this.record) {
        await this.context.applyEdit({ ...this.record.edit, newText: text })
      }
      else {
        if (!this.path.endsWith('.animation.json'))
          throw new Error('文件名须以 .animation.json 结尾。')
        if (!this.context.createDocument)
          throw new Error('当前编辑器不支持创建源文件。')
        const document = await this.context.createDocument(
          root,
          this.path,
          text,
        )
        if (this.disposed || this.project?.root !== root)
          return
        this.record = {
          path: this.path,
          timeline: this.timeline,
          edit: {
            root,
            path: this.path,
            revision: document.revision,
            start: 0,
            end: document.text.length,
            expectedText: document.text,
          },
        }
      }
      if (this.disposed || this.project?.root !== root)
        return
      this.applied = true
      this.appliedText = text
      this.dirty = false
      this.persist()
      renderView('已应用到源码草稿，可撤销；按 Ctrl/Cmd+S 保存。', this.message)
    }
    catch (error) {
      if (!this.disposed && this.project?.root === root)
        this.showError(error)
    }
    finally {
      this.busy = false
      if (!this.disposed)
        this.viewsView.renderToolbar()
      if (this.source)
        this.revealSource(this.source)
    }
  }

  private showError(error: unknown): void {
    renderView(error instanceof Error ? error.message : String(error), this.message)
  }

  private persist(): void {
    if (!this.project)
      return
    try {
      const key = `qua-animation-draft:${this.project.root}`
      if (this.dirty || this.applied) {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            timeline: this.timeline,
            path: this.path,
            record: this.record,
          }),
        )
      }
      else {
        window.localStorage.removeItem(key)
      }
    }
    catch {
      renderView('本地暂存不可用，请及时应用到源文件并保存。', this.message)
    }
  }

  private restore(): void {
    try {
      const text = window.localStorage.getItem(
        `qua-animation-draft:${this.project!.root}`,
      )
      if (!text || text.length > 2 * 1024 * 1024)
        return
      const saved = JSON.parse(text)
      this.timeline = parseTimeline(JSON.stringify(saved.timeline))
      if (typeof saved.path !== 'string')
        return
      this.path = saved.path
      this.record
        = saved.record?.edit?.root === this.project!.root
          ? saved.record
          : undefined
      const current = this.catalog.animations.find(
        item => item.path === this.path,
      )
      if (
        current
        && serializeTimeline(current.timeline) === serializeTimeline(this.timeline)
      ) {
        this.load(current)
        this.persist()
        return
      }
      this.dirty = true
      renderView('已恢复本地动画草稿；应用时会检查源码版本。', this.message)
    }
    catch {
      renderView('本地草稿无法恢复，请检查源文件。', this.message)
    }
  }
}
