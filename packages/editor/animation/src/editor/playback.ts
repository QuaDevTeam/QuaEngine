import type {
  EditorPluginContext,
  EditorProject,
} from '@quajs/editor-core'
import type { AnimationTimeline } from '@quajs/plugin-animation'
import type { AnimationSceneControls } from './scene-controls.js'
import type { TimelineView } from './timeline.js'
import {
  playbackCursor,
} from '../model/timeline.js'
import { AnimationPreview } from '../preview/isolated.js'

interface ViewContext {
  playbackMode: boolean
  time: number
  timeline: AnimationTimeline
  playbackTime: number
  seekInput: HTMLInputElement | undefined
  readout: HTMLElement | undefined
  timelineView: TimelineView
  playing: boolean
  visible: boolean
  playStarted: number
  playButton: HTMLButtonElement | undefined
  disposed: boolean
  frame: number | undefined
  sceneControls: AnimationSceneControls
  preview: AnimationPreview | undefined
  project: EditorProject | undefined
  stage: HTMLDivElement
  showError: (error: unknown) => void
  images: Map<string, string>
  imageGeneration: number
  context: EditorPluginContext
}

export function createAnimationPlayback(context: ViewContext) {
  function seek(time: number): void {
    pause()
    context.playbackMode = false
    context.time = Math.max(0, Math.min(context.timeline.duration, time))
    context.playbackTime
      = (context.time + (context.timeline.delay ?? 0))
        / (context.timeline.playbackRate ?? 1)
    updateTime()
    projectFrame()
  }

  function updateTime(): void {
    if (context.seekInput)
      context.seekInput.value = String(context.time)
    if (context.readout)
      context.readout.textContent = `${Math.round(context.time)} / ${context.timeline.duration} ms`
    context.timelineView.setTime(context.time)
  }

  function togglePlay(): void {
    if (context.playing) {
      pause()
      return
    }
    if (!context.visible || document.hidden)
      return
    const loops = context.timeline.loop === true ? Infinity : typeof context.timeline.loop === 'number' ? context.timeline.loop : 1
    const totalTime = ((context.timeline.delay ?? 0) + context.timeline.duration * loops) / (context.timeline.playbackRate ?? 1)
    if (context.playbackTime >= totalTime || (!context.playbackMode && context.time >= context.timeline.duration))
      context.playbackTime = 0
    context.playing = true
    context.playbackMode = true
    context.playStarted = performance.now() - context.playbackTime
    if (context.playButton)
      context.playButton.textContent = '暂停'
    const tick = (now: number) => {
      if (!context.playing || context.disposed)
        return
      context.playbackTime = now - context.playStarted
      const elapsed = Math.max(
        0,
        context.playbackTime * (context.timeline.playbackRate ?? 1)
        - (context.timeline.delay ?? 0),
      )
      const ended = elapsed >= context.timeline.duration * loops
      context.time = playbackCursor(context.timeline, context.playbackTime)
      updateTime()
      projectFrame()
      if (ended)
        pause()
      else context.frame = requestAnimationFrame(tick)
    }
    context.frame = requestAnimationFrame(tick)
  }

  function pause(): void {
    context.playing = false
    if (context.frame !== undefined)
      cancelAnimationFrame(context.frame)
    context.frame = undefined
    if (context.playButton)
      context.playButton.textContent = '播放'
  }

  function ensurePreview(): void {
    if (context.sceneControls.usesScene) {
      destroyPreview()
      return
    }
    if (!context.preview && context.project && !context.disposed) {
      context.preview = new AnimationPreview(context.stage, error =>
        context.showError(error))
      for (const [target, path] of context.images)
        void loadImage(target, path)
    }
    projectFrame()
  }

  function destroyPreview(): void {
    context.imageGeneration++
    const preview = context.preview
    context.preview = undefined
    if (preview)
      void preview.dispose().catch(context.context.reportError)
  }

  function projectFrame(): void {
    if (context.sceneControls.usesScene) {
      context.sceneControls.sample(context.timeline, context.playbackMode ? context.playbackTime : context.time, context.playbackMode)
      return
    }
    context.preview?.show(
      context.timeline,
      context.playbackMode ? context.playbackTime : context.time,
      context.playbackMode,
    )
  }

  async function loadImage(target: string, path: string): Promise<void> {
    const root = context.project?.root
    const preview = context.preview
    const generation = context.imageGeneration
    if (!root || !preview)
      return
    try {
      const url = path
        ? await context.context.assetUrl(root, path, false)
        : undefined
      if (
        context.disposed
        || generation !== context.imageGeneration
        || preview !== context.preview
        || root !== context.project?.root
        || context.images.get(target) !== path
      ) {
        return
      }
      preview.image(target, url)
      projectFrame()
    }
    catch (error) {
      if (generation === context.imageGeneration)
        context.showError(error)
    }
  }
  return { seek, updateTime, togglePlay, pause, ensurePreview, destroyPreview, projectFrame, loadImage }
}
