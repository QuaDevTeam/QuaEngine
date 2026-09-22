import type { AnimationTimeline } from '@quajs/plugin-animation'
import type { QuaViewProjection } from '@quajs/render-core'
import { Pipeline } from '@quajs/pipeline'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  emitLogicToRender,
  LogicToRenderEvents,
} from '@quajs/render-core'
import { QuaWebDomRenderer } from '@quajs/renderer-web'
import { createCharacterWebRendererPlugin } from '@quajs/renderer-web/plugins/character'
import { authoredProjection, previewProjection } from '../model/timeline.js'

/** An isolated authoring projection, never the running game's pipeline or state. */
export class AnimationPreview {
  private readonly pipeline = new Pipeline()
  private readonly renderer: QuaWebDomRenderer
  private ready: Promise<void>
  private disposed = false
  private pending?: QuaViewProjection
  private flushing = false
  private readonly images = new Map<string, string>()

  constructor(
    container: HTMLElement,
    private readonly error: (error: unknown) => void,
  ) {
    this.renderer = new QuaWebDomRenderer({
      container,
      pipeline: this.pipeline,
      autoReady: false,
      plugins: [
        createCharacterWebRendererPlugin({
          transitions: false,
          renderSprite: (context, character) => {
            const url = this.images.get(character.id)
            const sprite = context.document.createElement(url ? 'img' : 'div')
            sprite.className = 'animation-subject'
            if (sprite instanceof HTMLImageElement) {
              sprite.src = url!
              sprite.alt = character.id
              sprite.draggable = false
            }
            else {
              sprite.classList.add('animation-placeholder')
              sprite.textContent = character.id
            }
            return sprite
          },
        }),
      ],
    })
    this.ready = this.renderer.mount()
    void this.ready.catch(error)
  }

  image(target: string, url?: string): void {
    const id = target
    if (url)
      this.images.set(id, url)
    else this.images.delete(id)
  }

  show(timeline: AnimationTimeline, time: number, playback: boolean): void {
    if (this.disposed)
      return
    const animation = playback
      ? previewProjection(timeline, time)
      : authoredProjection(timeline, time)
    const ids = [
      ...new Set(
        animation.resolvedTracks.map(track =>
          track.target.slice('character:'.length),
        ),
      ),
    ]
    this.pending = {
      layout: createViewLayoutProjection(),
      characters: ids.map(id => ({
        id,
        name: id,
        visible: true,
        sprite: 'editor-placeholder',
        opacity: 1,
        position: { x: 960, y: 540, scale: 1, rotation: 0, anchor: 'center' },
      })),
      dialogue: { visible: false, text: '' },
      choices: [],
      ui: { visible: false },
      flowControl: createFlowControlProjection(),
      effects: [],
      animations: [animation],
      plugins: {},
    }
    void this.flush()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.pending = undefined
    this.images.clear()
    await this.ready.catch(() => {})
    await this.renderer.unmount()
    this.pipeline.removeAllListeners()
  }

  private async flush(): Promise<void> {
    if (this.flushing)
      return
    this.flushing = true
    try {
      await this.ready
      while (!this.disposed && this.pending) {
        const view = this.pending
        this.pending = undefined
        await emitLogicToRender(
          this.pipeline,
          LogicToRenderEvents.VIEW_UPDATE,
          { view },
        )
      }
    }
    catch (error) {
      if (!this.disposed)
        this.error(error)
    }
    finally {
      this.flushing = false
    }
  }
}
