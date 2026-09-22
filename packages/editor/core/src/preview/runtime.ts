import type { GameStep, QuaEngine, StoryPoint } from '@quajs/engine'
import type { PreviewCommand, PreviewCommandResult } from './contracts.js'
import type { PreviewDebugOptions } from './runtime-debug.js'
import type { PreviewMemoryResource } from './storage.js'
import { LogicToRenderEvents, onLogicToRender, RenderToLogicEvents } from '@quajs/engine'
import { createAnimationSceneRuntime } from './runtime-animation.js'
import { createPreviewDebugger } from './runtime-debug.js'
import { readEngineStorage } from './runtime-storage.js'

/** Development-only controller. All narrative writes stay inside engine/story APIs. */
export interface EditorPreviewRuntimeOptions extends PreviewDebugOptions {
  /** Inject renderer-owned allocation metadata; never reads bytes or changes resource lifetimes. */
  getResources?: () => readonly PreviewMemoryResource[]
  baselinePoint: StoryPoint
  /** Return a registered factory without running setup until after checkpoint restore. */
  resolveFile: (path: string) => () => GameStep[] | Promise<GameStep[]>
  enter?: () => void | Promise<void>
}
export async function createEditorPreviewRuntime(engine: QuaEngine, options: EditorPreviewRuntimeOptions) {
  const pipeline = engine.getPipeline()
  const baseline = await engine.createCheckpoint({ id: 'editor:baseline', point: options.baselinePoint })
  const debuggerRuntime = createPreviewDebugger(engine, options)
  let busy = false
  let generation = 0
  let playbackGeneration = 0
  let runningError: unknown
  let visibleStep = ''
  let selectedFile: string | undefined
  let steps: GameStep[] = []
  let ended = false
  let disposed = false
  const animation = createAnimationSceneRuntime(engine)
  const shown = () => {
    visibleStep = engine.getStoryPoint()?.stepId || ''
  }
  const disposers = [onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_SHOW, shown), onLogicToRender(pipeline, LogicToRenderEvents.DIALOGUE_CHOICE, shown)]
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25))
  const result = (message: string): PreviewCommandResult => ({ message, stepId: engine.getStoryPoint()?.stepId, path: selectedFile, stepIndex: steps.findIndex(step => step.uuid === engine.getStoryPoint()?.stepId) })
  const advance = async () => {
    await engine.stopAuto()
    await engine.stopSkip()
    await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, { source: 'editor' })
  }
  const execute = async (command: PreviewCommand): Promise<PreviewCommandResult> => {
    if (disposed)
      throw new Error('预览控制已释放。')
    if (command.action === 'storage')
      return { message: '存储快照', storage: await readEngineStorage(engine, command.request, options.getResources) }
    if (command.action === 'debug') {
      if (command.request.kind === 'read' || command.request.kind === 'reply')
        return { message: '场景调试', debug: await debuggerRuntime.request(command.request) }
      if (busy)
        throw new Error('正在执行预览命令。')
      busy = true
      try {
        return { message: '场景调试', debug: await debuggerRuntime.request(command.request) }
      }
      finally { busy = false }
    }
    if (command.action === 'status' && runningError)
      throw runningError
    if (command.action === 'status')
      return result('支持单步与剧本定位')
    if (busy)
      throw new Error('正在执行预览命令。')
    busy = true
    const currentGeneration = ++generation
    try {
      if (command.action === 'animation-scene')
        return { ...result('场景已就绪'), animationScene: animation.describe() }
      if (command.action === 'animation-release') {
        await animation.release()
        return result('动画预览已释放')
      }
      if (command.action === 'animation-sample')
        return { ...result('动画预览'), animationScene: await animation.sample(command.sample) }
      await animation.release()
      await engine.stopAuto()
      await engine.stopSkip()
      if (command.action === 'step' || command.action === 'seek')
        await debuggerRuntime.request({ kind: 'pick', enabled: false })
      if (command.action === 'seek') {
        if (typeof command.path !== 'string' || !Number.isSafeInteger(command.stepIndex) || command.stepIndex! < 0)
          throw new Error('无效的剧本位置。')
        // Validate before cancelling existing playback or restoring the baseline.
        const createSteps = options.resolveFile(command.path)
        if (typeof createSteps !== 'function')
          throw new Error('此文件不是已注册的剧本模块。')
        await engine.jumpTo(baseline, { mode: 'restore', reason: 'editor', force: true })
        await options.enter?.()
        await pipeline.emit('editor/preview/enter', {})
        // Factories run after restore so setup reads use the restored store.
        steps = await createSteps()
        if (!steps[command.stepIndex])
          throw new Error('剧本位置已变化，请保存并重新运行预览。')
        ended = false
        selectedFile = command.path
        visibleStep = ''
        runningError = undefined
        const playback = ++playbackGeneration
        void engine.dialogue(steps).catch((error) => {
          if (playback === playbackGeneration) {
            runningError = error
            void pipeline.emit('editor/preview/error', { message: error instanceof Error ? error.message : String(error) }).catch(() => {})
          }
        }).finally(() => {
          if (playback === playbackGeneration)
            ended = true
        })
        const target = steps[command.stepIndex!].uuid
        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
          await pause()
          if (currentGeneration !== generation)
            throw new Error('预览控制已释放。')
          if (runningError)
            throw runningError
          if (ended)
            throw new Error('脚本已结束，目标不是可等待的对话或选择步骤。')
          const current = engine.getStoryPoint()?.stepId
          if (current === target && visibleStep === current)
            return result('已定位到目标步骤')
          if (engine.getViewState().choices.length)
            return result('遇到选择，请在预览中选择分支后继续单步')
          if (current && visibleStep === current)
            await advance()
        }
        throw new Error('定位超时，已停止自动推进；可继续单步或重新运行。')
      }
      if (command.action !== 'step')
        throw new Error('未知预览命令。')
      if (engine.getViewState().choices.length)
        return result('请先在预览中选择分支')
      const before = engine.getStoryPoint()?.stepId
      if (!before || before === options.baselinePoint.stepId)
        throw new Error('请先从剧本光标位置启动预览，或在游戏中开始阅读。')
      // USER_ADVANCE is the actual logic intent; it bypasses renderer typing cosmetics.
      if (ended)
        return result('当前预览文件已结束')
      await advance()
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        await pause()
        if (currentGeneration !== generation)
          throw new Error('预览控制已释放。')
        if (runningError)
          throw runningError
        if (ended)
          return result('当前预览文件已结束')
        const current = engine.getStoryPoint()?.stepId
        if (current !== before && visibleStep === current)
          return result('已前进一个对话步骤')
        if (engine.getViewState().choices.length)
          return result('请在预览中选择分支')
      }
      return result('已发送单步；当前脚本尚未到达下一处对话或已结束')
    }
    finally { busy = false }
  }
  const listener = async (context: { event: { payload: unknown } }) => {
    const request = context.event.payload as { id?: string, command?: Parameters<typeof execute>[0] }
    if (!request || typeof request.id !== 'string' || request.id.length > 80 || !request.command)
      return
    let response
    try {
      response = { id: request.id, result: await execute(request.command) }
    }
    catch (error) { response = { id: request.id, error: error instanceof Error ? error.message : String(error) } }
    await pipeline.emit('editor/preview/response', response)
  }
  pipeline.on('editor/preview/request', listener)
  return {
    async request(command: Parameters<typeof execute>[0]) {
      const id = `web-${Date.now()}-${Math.random()}`
      let response: { result?: ReturnType<typeof result>, error?: string } | undefined
      const receive = (context: { event: { payload: unknown } }) => {
        const next = context.event.payload as { id?: string, result?: ReturnType<typeof result>, error?: string }
        if (next.id === id)
          response = next
      }
      pipeline.on('editor/preview/response', receive)
      try {
        await pipeline.emit('editor/preview/request', { id, command })
        if (!response || response.error)
          throw new Error(response?.error || '预览控制未响应。')
        return response.result
      }
      finally { pipeline.off('editor/preview/response', receive) }
    },
    dispose() {
      disposed = true
      debuggerRuntime.dispose()
      ++generation
      pipeline.off('editor/preview/request', listener)
      for (const dispose of disposers) dispose()
    },
  }
}
