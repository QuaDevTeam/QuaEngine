import type { CharacterCatalog } from '@quajs/editor-character'
import type {
  EditorAnimationSample,
  EditorAnimationScenePreview,
  EditorAnimationSceneResult,
  EditorPluginContext,
  EditorProject,
} from '@quajs/editor-core'
import type { AnimationTimeline } from '@quajs/plugin-animation'
import type {
  AnimationCatalog,
  AnimationRecord,
  AnimationSceneBinding,
} from '../contracts.js'
import { element, html, render as renderView } from '@quajs/editor-controls'
import { button, checkbox, field, select } from './dom.js'

/** Editor-local context selection. Scene rendering stays in the actual project Web runtime. */
export class AnimationSceneControls {
  readonly element = element(html`<div class="animation-context"></div>`)
  private readonly status = element(html`<span class="animation-context-status"></span>`)
  private readonly controls = element(html`<div class="animation-context-fields"></div>`)
  private project?: EditorProject
  private record?: AnimationRecord
  private catalog?: AnimationCatalog
  private characters?: CharacterCatalog
  private mode: 'auto' | 'character' | 'scene' = 'auto'
  private binding = 0
  private path = ''
  private stepIndex = 0
  private character = ''
  private self = ''
  private hideDialogue = false
  private visible = false
  private disposed = false
  private generation = 0
  private readyKey = ''
  private loadingKey = ''
  private scene?: EditorAnimationScenePreview
  private runtime?: EditorAnimationSceneResult
  private pending?: EditorAnimationSample
  private sampling = false
  private last?: {
    timeline: AnimationTimeline
    time: number
    playback: boolean
  }

  constructor(
    context: EditorPluginContext,
    private readonly stage: HTMLElement,
    private readonly changed: () => void,
    private readonly setImage: (path: string) => void,
  ) {
    renderView(html`${this.controls}${this.status}`, this.element)
    context.mountStatus?.(this.status)
    this.scene = context.createScenePreview?.()
  }

  update(
    project: EditorProject,
    catalog: AnimationCatalog,
    record?: AnimationRecord,
  ): void {
    const previous = JSON.stringify(this.selection())
    const changed
      = this.project?.root !== project.root || this.record?.path !== record?.path
    if (changed) {
      this.release()
      this.mode = 'auto'
      this.binding = 0
      this.path = ''
      this.character = ''
      this.self = ''
    }
    this.project = project
    this.catalog = catalog
    this.record = record
    if (this.binding >= (record?.bindings?.length ?? 0))
      this.binding = 0
    this.characters = project.plugins?.['qua.character']?.data as
      CharacterCatalog | undefined
    if (!catalog.scenes?.some(scene => scene.path === this.path))
      this.path = catalog.scenes?.[0]?.path ?? ''
    if (
      !catalog.scenes
        ?.find(scene => scene.path === this.path)
        ?.steps
        .some(step => step.index === this.stepIndex)
    ) {
      this.stepIndex
        = catalog.scenes?.find(scene => scene.path === this.path)?.steps[0]?.index ?? 0
    }
    if (!changed && previous !== JSON.stringify(this.selection()))
      this.release()
    if (!this.controls.contains(document.activeElement))
      this.render()
    if (this.visible)
      void this.prepare()
  }

  get usesScene(): boolean {
    return Boolean(this.selection())
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible)
      void this.prepare()
    else this.release()
  }

  sample(timeline: AnimationTimeline, time: number, playback: boolean): void {
    this.last = { timeline, time, playback }
    if (!this.usesScene || !this.readyKey || !this.visible)
      return
    this.pending = {
      duration: timeline.duration,
      time,
      playbackRate: playback ? (timeline.playbackRate ?? 1) : 1,
      delay: playback ? timeline.delay : 0,
      loop: playback ? timeline.loop : false,
      direction: playback ? timeline.direction : 'normal',
      fill: playback ? timeline.fill : 'both',
      self: this.self || undefined,
      hideDialogue: this.hideDialogue,
      tracks: timeline.tracks.map(track => ({
        target: track.target ?? 'self',
        property: track.property,
        interpolation: track.interpolation as 'number' | 'step' | 'discrete',
        keyframes: track.keyframes.map(key => ({
          at: Number(key.at),
          value: Number(key.value),
          easing: key.easing,
        })),
      })),
    }
    void this.flush()
  }

  dispose(): void {
    this.disposed = true
    this.release()
    this.element.remove()
  }

  private selection(): AnimationSceneBinding | undefined {
    if (this.mode === 'auto')
      return this.record?.bindings?.[this.binding]
    if (this.mode === 'scene' && this.path)
      return { path: this.path, stepIndex: this.stepIndex }
    return undefined
  }

  private reset(): void {
    this.release()
    this.render()
    this.changed()
    if (this.visible)
      void this.prepare()
  }

  private render(): void {
    const mode = select(
      [
        { value: 'auto', title: '自动关联' },
        { value: 'character', title: '角色预览' },
        { value: 'scene', title: '场景预览' },
      ],
      this.mode,
      (value) => {
        this.mode = value as typeof this.mode
        this.stepIndex
          = this.catalog?.scenes?.find(scene => scene.path === this.path)
            ?.steps[0]
            ?.index ?? 0
        this.reset()
      },
    )
    const fields = [field('预览上下文', mode)]
    if (this.mode === 'auto' && this.record?.bindings?.length) {
      fields.push(
        field(
          '动画调用位置',
          select(
            this.record.bindings.map((binding, index) => ({
              value: String(index),
              title: `${binding.sceneId ?? binding.path}，步骤 ${binding.stepIndex + 1}`,
            })),
            String(this.binding),
            (value) => {
              this.binding = Number(value)
              this.reset()
            },
          ),
        ),
      )
    }
    if (this.mode === 'scene') {
      fields.push(
        field(
          '预览剧本',
          select(
            (this.catalog?.scenes ?? []).map(scene => ({
              value: scene.path,
              title: scene.path,
            })),
            this.path,
            (value) => {
              this.path = value
              this.stepIndex
                = this.catalog?.scenes?.find(scene => scene.path === value)
                  ?.steps[0]
                  ?.index ?? 0
              this.reset()
            },
          ),
        ),
      )
      const source = this.catalog?.scenes?.find(
        scene => scene.path === this.path,
      )
      fields.push(
        field(
          '场景步骤',
          select(
            (source?.steps ?? []).map(step => ({
              value: String(step.index),
              title: `${step.line}: ${step.label}`,
            })),
            String(this.stepIndex),
            (value) => {
              this.stepIndex = Number(value)
              this.reset()
            },
          ),
        ),
      )
    }
    if (this.usesScene) {
      const show = checkbox(!this.hideDialogue, (checked) => {
        this.hideDialogue = !checked
        this.changed()
      })
      fields.push(field('显示对话框', show))
      if (this.runtime) {
        fields.push(
          field(
            'self 角色',
            select(
              [
                { value: '', title: '当前说话角色' },
                ...this.runtime.characters.map(character => ({
                  value: character.id,
                  title: `${character.name} (${character.id})`,
                })),
              ],
              this.self,
              (value) => {
                this.self = value
                this.changed()
              },
            ),
          ),
        )
      }
      fields.push(button('重新载入场景', () => this.reset()))
    }
    else {
      const options = [
        { value: '', title: '占位形状 / 自选图片' },
        ...(this.characters?.characters ?? []).map(character => ({
          value: character.key,
          title: `${character.displayName.value} (${character.id.value})`,
        })),
      ]
      fields.push(
        field(
          '预览角色',
          select(options, this.character, (value) => {
            this.character = value
            const character = this.characters?.characters.find(
              character => character.key === value,
            )
            const expression
              = character?.expressions.find(expression =>
                /(?:^|\.)(?:neutral|default)$/u.test(expression.name),
              ) ?? character?.expressions[0]
            const asset
              = expression?.assets.find(asset => asset.path)
                ?? character?.base.find(asset => asset.path)
            this.setImage(asset?.path ?? '')
            this.status.textContent
              = character && !asset?.path
                ? '角色资源无法静态解析，请使用场景预览。'
                : this.mode === 'auto'
                  ? '未找到动画调用场景，可选择角色或切换场景预览。'
                  : ''
          }),
        ),
      )
      this.status.textContent
        = this.mode === 'auto'
          ? '未找到动画调用场景，可选择角色或切换场景预览。'
          : ''
    }
    renderView(html`${fields}`, this.controls)
  }

  private async prepare(): Promise<void> {
    const selection = this.selection()
    if (!selection || !this.visible || !this.project || this.disposed)
      return
    if (!this.scene) {
      this.status.textContent = '当前宿主尚未提供 Web 场景预览。'
      return
    }
    const key = JSON.stringify([this.project.root, selection])
    if (this.readyKey === key || this.loadingKey === key)
      return
    this.loadingKey = key
    const generation = ++this.generation
    this.status.textContent = '正在启动 Web 并载入场景…'
    try {
      const runtime = await this.scene.open(this.project.root, selection)
      if (generation !== this.generation || !this.visible || this.disposed)
        return
      this.runtime = runtime
      this.self = selection.self ?? runtime.self ?? ''
      this.readyKey = key
      this.scene.attach(this.stage)
      this.status.textContent = 'Web 场景预览'
      this.render()
      this.changed()
      if (this.last)
        this.sample(this.last.timeline, this.last.time, this.last.playback)
    }
    catch (error) {
      if (generation === this.generation) {
        this.scene.attach(undefined)
        this.status.textContent
          = error instanceof Error ? error.message : String(error)
      }
    }
    finally {
      if (generation === this.generation)
        this.loadingKey = ''
    }
  }

  private async flush(): Promise<void> {
    if (this.sampling || !this.scene)
      return
    this.sampling = true
    const generation = this.generation
    try {
      while (
        this.pending
        && this.visible
        && this.readyKey
        && generation === this.generation
      ) {
        const sample = this.pending
        this.pending = undefined
        await this.scene.sample(sample)
      }
    }
    catch (error) {
      if (generation === this.generation) {
        this.pending = undefined
        this.status.textContent
          = error instanceof Error ? error.message : String(error)
      }
    }
    finally {
      this.sampling = false
      if (this.pending && this.visible && this.readyKey)
        void this.flush()
    }
  }

  private release(): void {
    ++this.generation
    this.pending = undefined
    this.readyKey = ''
    this.loadingKey = ''
    this.runtime = undefined
    this.scene?.release()
  }
}
