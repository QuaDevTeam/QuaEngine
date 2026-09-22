import type { QuaEngine } from '@quajs/engine'
import type { PreviewAudioIntent, PreviewAudioPlayback, PreviewDebugClip, PreviewDebugRequest, PreviewDebugSnapshot, PreviewSource, PreviewSourceRequest } from './debug.js'
import { LogicToRenderEvents, onLogicToRender, RenderToLogicEvents, richTextToPlainText } from '@quajs/engine'
import { validateDebugRequest } from './debug.js'

export interface PreviewDebugOptions {
  getAudio?: () => readonly PreviewAudioIntent[]
  controlAudio?: (command: Extract<PreviewDebugRequest, { kind: 'audio' }>) => Promise<void>
}

/** Transient authoring trace, not a second source of game state. No polling timer. */
export function createPreviewDebugger(engine: QuaEngine, options: PreviewDebugOptions) {
  const pipeline = engine.getPipeline()
  let epoch = Date.now()
  let current: PreviewSource | undefined
  let currentStep = ''
  let picking = false
  let renderer = false
  let truncated = false
  let serial = 0
  const clips: PreviewDebugClip[] = []
  const requests: PreviewSourceRequest[] = []
  const characterSources = new Map<string, PreviewSource>()
  let backgroundSource: PreviewSource | undefined
  const audioClips = new Map<string, PreviewDebugClip>()
  let dialogueClip: PreviewDebugClip | undefined
  const now = () => Date.now() - epoch
  const guard: Exclude<Parameters<typeof pipeline.addMiddleware>[0], { toFunction: unknown }> = async (context, next) => {
    if (picking && [RenderToLogicEvents.USER_INPUT_COMMAND, RenderToLogicEvents.USER_ADVANCE, RenderToLogicEvents.USER_CHOICE_SELECT].includes(context.event.type as RenderToLogicEvents)) {
      context.stopPropagation = true
      return
    }
    await next()
  }
  pipeline.addMiddleware(guard)
  const publish = () => pipeline.emit('editor/preview/dev-state', { picking, stepId: currentStep })
  const listen = (event: string, handler: (payload: any) => void | Promise<void>) => {
    const listener = (context: { event: { payload: unknown } }) => handler(context.event.payload)
    pipeline.on(event, listener)
    return () => pipeline.off(event, listener)
  }
  const add = (clip: Omit<PreviewDebugClip, 'id'>) => {
    const value = { ...clip, id: ++serial }
    clips.push(value)
    if (clips.length > 400) {
      const expired = clips.findIndex(clip => clip.endMs !== undefined)
      clips.splice(expired < 0 ? 0 : expired, 1)
      truncated = true
    }
    return value
  }
  const captureAudio = () => {
    const tracks = options.getAudio?.() || []
    const active = new Set<string>()
    for (const value of tracks.slice(0, 128)) {
      const track: PreviewAudioIntent = { id: value.id, kind: value.kind, assetKey: value.assetKey, state: value.state, loop: value.loop, contentPackageId: value.contentPackageId }
      if (track.state === 'stopped' || track.state === 'idle')
        continue
      active.add(track.id)
      let clip = audioClips.get(track.id)
      if (clip && (clip.track?.assetKey !== track.assetKey || clip.track.contentPackageId !== track.contentPackageId)) {
        clip.endMs = now()
        clip = undefined
      }
      if (!clip) {
        clip = add({ kind: track.kind, lane: track.kind === 'voice' ? `${engine.getViewState().dialogue.characterName || engine.getViewState().dialogue.characterId || '旁白'}，配音` : track.kind.toUpperCase(), label: track.assetKey.slice(0, 512), startMs: now(), source: current, track: { ...track } })
        audioClips.set(track.id, clip)
      }
      clip.track = { ...track }
    }
    for (const [id, clip] of audioClips) {
      if (!active.has(id)) {
        clip.endMs = now()
        audioClips.delete(id)
      }
    }
  }
  const clear = (preserve = true) => {
    const previousAudio = new Map(audioClips)
    const previousDialogue = dialogueClip
    epoch = Date.now()
    clips.length = 0
    audioClips.clear()
    dialogueClip = undefined
    truncated = false
    captureAudio()
    if (preserve) {
      for (const [id, clip] of audioClips) clip.source = previousAudio.get(id)?.source
      if (previousDialogue && engine.getViewState().dialogue.visible)
        dialogueClip = add({ ...previousDialogue, startMs: 0, endMs: undefined })
    }
  }
  const disposers = [
    listen('editor/preview/step', async ({ source, stepId }) => {
      if (!source || typeof source.path !== 'string' || !source.path.endsWith('.qs') || typeof source.expectedText !== 'string' || source.expectedText.length > 8192) {
        current = undefined
        currentStep = ''
        return
      }
      current = source
      currentStep = stepId
      await publish()
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, () => {
      if (dialogueClip)
        dialogueClip.endMs = now()
      const dialogue = engine.getViewState().dialogue
      dialogueClip = add({ kind: 'dialogue', lane: dialogue.characterName || dialogue.characterId || '旁白', label: richTextToPlainText(dialogue.text).slice(0, 2000), startMs: now(), source: current })
      captureAudio()
      for (const clip of audioClips.values()) {
        if (clip.kind === 'voice' && clip.source === current)
          clip.lane = `${dialogue.characterName || dialogue.characterId || '旁白'}，配音`
      }
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_HIDE, () => {
      if (dialogueClip)
        dialogueClip.endMs = now()
      dialogueClip = undefined
    }),
    onLogicToRender(pipeline, LogicToRenderEvents.VIEW_UPDATE, captureAudio),
    ...[LogicToRenderEvents.CHARACTER_SHOW, LogicToRenderEvents.CHARACTER_MOVE, LogicToRenderEvents.CHARACTER_EXPRESSION, LogicToRenderEvents.CHARACTER_SPRITE].map(event => listen(event, ({ id }) => {
      if (current && typeof id === 'string') {
        characterSources.set(id, current)
        if (characterSources.size > 256)
          characterSources.delete(characterSources.keys().next().value!)
      }
    })),
    listen(LogicToRenderEvents.BACKGROUND_SET, () => { backgroundSource = current }),
    listen('editor/preview/renderer-ready', async () => {
      renderer = true
      await publish()
    }),
    listen('editor/preview/pick-request', async ({ enabled }) => {
      if (enabled === false) {
        picking = false
        await publish()
      }
    }),
    listen('editor/preview/audio-sample', ({ tracks }) => {
      if (!Array.isArray(tracks))
        return
      for (const track of tracks as PreviewAudioPlayback[]) {
        const clip = audioClips.get(track.id)
        if (clip)
          clip.playback = { ...track }
      }
    }),
    listen('editor/preview/inspect', async (input) => {
      if (!picking || !['dialogue', 'character', 'background', 'audio'].includes(input.kind))
        return
      const target = typeof input.target === 'string' ? input.target.slice(0, 512) : undefined
      const source = input.kind === 'character' ? characterSources.get(target || '') : input.kind === 'background' ? backgroundSource : input.kind === 'audio' ? audioClips.get(target || '')?.source : dialogueClip?.source
      if (input.text !== undefined && (typeof input.text !== 'string' || input.text.length > 10000 || input.stepId !== currentStep || input.expectedText !== engine.getViewState().dialogue.text)) {
        await pipeline.emit('editor/preview/edit-result', { error: true, message: '场景已前进，请重新选择台词。' })
        return
      }
      requests.push({ id: ++serial, kind: input.kind, target, source, text: input.text, expectedText: input.expectedText })
      if (requests.length > 32)
        requests.shift()
    }),
    listen('editor/preview/enter', () => {
      current = undefined
      currentStep = ''
      backgroundSource = undefined
      characterSources.clear()
      clear(false)
    }),
  ]
  return {
    async request(value: PreviewDebugRequest): Promise<PreviewDebugSnapshot> {
      const request = validateDebugRequest(value)
      if (request.kind === 'pick') {
        picking = request.enabled
        if (picking) {
          await engine.stopAuto()
          await engine.stopSkip()
        }
        await publish()
      }
      if (request.kind === 'clear')
        clear()
      if (request.kind === 'flow') {
        picking = false
        await publish()
        await engine.stopSkip()
        if (request.mode === 'auto')
          await engine.startAuto()
        else await engine.stopAuto()
      }
      if (request.kind === 'audio') {
        if (!options.controlAudio)
          throw new Error('项目未提供音频调试控制。')
        await options.controlAudio(request)
      }
      if (request.kind === 'reply')
        await pipeline.emit('editor/preview/edit-result', request)
      captureAudio()
      await pipeline.emit('editor/preview/sample', {})
      return { picking, timeMs: now(), clips: clips.map(clip => ({ ...clip })), requests: request.kind === 'read' ? requests.filter(item => item.id > request.after) : [], current, flow: engine.getViewState().flowControl.mode, audioControl: Boolean(options.controlAudio), renderer, truncated }
    },
    dispose() {
      pipeline.removeMiddleware(guard)
      disposers.forEach(dispose => dispose())
    },
  }
}
