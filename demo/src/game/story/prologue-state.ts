import { BaseEnginePlugin, LogicToRenderEvents, onLogicToRender, type EngineContext, type GameStep, type QuaEngine } from '@quajs/engine'
import { STORY_GRAPH_PLUGIN_ID, type StoryGraphPlugin } from '@quajs/story-graph'
import arrival from '../scenes/prologue-arrival.qs'
import commission from '../scenes/prologue-commission.qs'
import restoration from '../scenes/prologue-restoration.qs'
import returnLine from '../scenes/prologue-return-line.qs'
import chapter01 from '../scenes/chapter-01.qs'
import chapter02 from '../scenes/chapter-02.qs'
import chapter03 from '../scenes/chapter-03.qs'
import chapter04 from '../scenes/chapter-04.qs'
import chapter05 from '../scenes/chapter-05.qs'
import inspection from '../scenes/chapter-05-inspection.qs'
import handoff from '../scenes/ending-handoff.qs'
import chapter06 from '../scenes/chapter-06.qs'
import chapter07 from '../scenes/chapter-07.qs'
import epilogue from '../scenes/epilogue.qs'
import { STORY_TREE_NODES } from '../content/story-tree'

export const DEMO_STORY_PLUGIN_ID = 'demo-story'
export const DEMO_LIBRARY_PLUGIN_ID = 'demo-library'
export const DEMO_STORY_REQUEST = 'demo/story/request'
export const DEMO_STORY_ERROR = 'demo/story/error'
export const DEMO_SCENE_ID = 'call-me-tomorrow-prologue'
export type WorkApproach = 'listen-first' | 'catalog-first'
export interface PrologueState { workApproach?: WorkApproach }
export interface StoryState extends PrologueState {
  choices: string[]
  status: 'reading' | 'paused' | 'ended'
  ending?: 'tomorrow' | 'letter' | 'handoff'
}
export interface StoryLibrary { canContinue: boolean; chapters: string[] }
export interface StoryRequest { action: 'start' | 'continue' | 'pause' | 'chapter'; nodeId?: string }
export interface PrologueScope extends Record<string, unknown> {
  response: (listening: string, catalog: string) => string
}
export interface StoryScope extends PrologueScope {
  pick: (choice: string, yes: string, no: string) => string
}

const choiceGroups = [
  ['listen-first', 'catalog-first'], ['verify-audio', 'verify-notice'],
  ['tell-now', 'admit-fear'], ['investigate-station', 'investigate-office'],
  ['continue-inquiry', 'early-handoff'], ['external-preservation', 'formal-followup'],
]
const endings = {
  tomorrow: { title: '明天，请再一次呼唤我', message: '感谢游玩。' },
  letter: { title: '雨后的来信', message: '感谢游玩。' },
  handoff: { title: '下一次见面', message: '感谢游玩。' },
}

/** Saved decisions and navigation policy shared by Web and native. */
export class DemoStoryPlugin extends BaseEnginePlugin {
  readonly name = 'demo-story'
  readonly id = DEMO_STORY_PLUGIN_ID
  readonly version = '0.3.0'
  private disposeLoad?: () => void
  private disposeRequest?: () => void
  // Transient cancellation and command serialization, never narrative facts.
  private playbackGeneration = 0
  private restoringSave = false
  private commandQueue: Promise<void> = Promise.resolve()

  constructor(private readonly engine: QuaEngine) { super() }

  protected override setup(ctx: EngineContext): void {
    this.disposeLoad = onLogicToRender(ctx.pipeline, LogicToRenderEvents.GAME_LOAD, async () => {
      const point = this.engine.getStoryPoint()
      if (point?.sceneId !== DEMO_SCENE_ID) return
      this.restoringSave = true
      for (const id of ['menu', 'saveLoad', 'settings', 'titleConfirm', 'confirm', 'gameOver']) await this.engine.hideUI(id)
      await this.engine.stopAuto()
      await this.engine.stopSkip()
      await this.patch({ status: 'reading', ending: undefined })
      await this.refreshLibrary()
      this.restoringSave = false
      this.launch(point.stepId)
    })
    const listener = (context: { event: { payload: unknown } }) => {
      const request = context.event.payload as StoryRequest
      const command = this.commandQueue.then(async () => {
        if (request.action === 'start') await this.start()
        else if (request.action === 'pause') await this.pause()
        else if (request.action === 'continue') await this.engine.loadFromSlot('continue', { force: true })
        else if (request.action === 'chapter') {
          const library = await this.refreshLibrary()
          if (!request.nodeId || !library.chapters.includes(request.nodeId)) throw new Error('请先阅读并解锁这一章。')
          await this.engine.loadFromSlot(`chapter-${request.nodeId}`, { force: true })
        }
      })
      this.commandQueue = command.catch(async error => { await ctx.pipeline.emit(DEMO_STORY_ERROR, { message: error instanceof Error ? error.message : String(error) }) })
      return this.commandQueue
    }
    ctx.pipeline.on(DEMO_STORY_REQUEST, listener)
    this.disposeRequest = () => ctx.pipeline.off(DEMO_STORY_REQUEST, listener)
  }

  override async onBeforeJump(): Promise<void> { this.playbackGeneration++ }

  override async onAfterJump(ctx: EngineContext): Promise<void> {
    const reason = ctx.jump?.options.reason || ''
    if (!this.restoringSave && ctx.point?.sceneId === DEMO_SCENE_ID && this.state().status === 'reading'
      && (reason.startsWith('ui:') || reason === 'ui-overlay' || reason === 'backlog' || reason === 'rewind')) {
      this.launch(ctx.point.stepId)
    }
  }

  override async destroy(): Promise<void> {
    this.playbackGeneration++
    this.disposeLoad?.()
    this.disposeRequest?.()
    await super.destroy?.()
  }

  private state(): StoryState {
    const value = this.engine.getViewState().plugins[this.id] as StoryState | undefined
    return { choices: [], status: 'paused', ...value }
  }

  private async patch(patch: Partial<StoryState>): Promise<void> {
    await this.engine.setPluginProjection(this.id, { ...this.state(), ...patch })
  }

  async refreshLibrary(): Promise<StoryLibrary> {
    const slots = await this.engine.listSaveSlots()
    const library = {
      canContinue: slots.some(slot => slot.slotId === 'continue'),
      chapters: STORY_TREE_NODES.filter(node => slots.some(slot => slot.slotId === `chapter-${node.id}`)).map(node => node.id),
    }
    const graph = this.engine.getPluginById<StoryGraphPlugin>(STORY_GRAPH_PLUGIN_ID)
    for (const nodeId of library.chapters) await graph?.unlockNode(nodeId)
    await this.engine.setPluginProjection(DEMO_LIBRARY_PLUGIN_ID, library)
    return library
  }

  async start(): Promise<void> {
    await this.engine.stopAuto()
    await this.engine.stopSkip()
    await this.engine.jumpTo({ sceneId: DEMO_SCENE_ID, stepId: 'prologue-arrival', chapterId: '00' }, { mode: 'fresh', force: true })
    await this.engine.setPluginProjection<StoryState>(this.id, { choices: [], status: 'reading' })
    this.launch()
  }

  async pause(): Promise<void> {
    await this.engine.stopAuto()
    await this.engine.stopSkip()
    const point = this.engine.getStoryPoint()
    if (point?.sceneId === DEMO_SCENE_ID && this.state().status !== 'ended') {
      await this.engine.saveToSlot('continue', { name: '继续阅读' })
      await this.engine.jumpTo(point, { mode: 'fresh', force: true })
      await this.patch({ status: 'paused' })
    }
    await this.refreshLibrary()
  }

  private launch(stepId?: string) {
    void this.play(stepId).catch(async error => {
      await this.engine.getPipeline().emit(DEMO_STORY_ERROR, { message: '剧本读取失败，请读取存档或重新开始。' })
      await this.engine.reportError(error, { source: 'script', phase: 'story:play' })
    })
  }

  private async play(startStepId?: string): Promise<void> {
    const generation = ++this.playbackGeneration
    const scope = prologueScope(this.engine)
    const sources = [
      { key: 'arrival', chapter: '00', entry: 'prologue-arrival', create: () => arrival() },
      { key: 'commission', chapter: '00', create: () => commission(scope) },
      { key: 'restoration', chapter: '00', create: () => restoration(scope) },
      { key: 'return-line', chapter: '00', create: () => returnLine() },
      { key: 'chapter-01', chapter: '01', entry: 'chapter-01', create: () => chapter01(scope) },
      { key: 'chapter-02', chapter: '02', entry: 'chapter-02', create: () => chapter02() },
      { key: 'chapter-03', chapter: '03', entry: 'chapter-03', create: () => chapter03() },
      { key: 'chapter-04', chapter: '04', entry: 'chapter-04', create: () => chapter04(scope) },
      { key: 'chapter-05', chapter: '05', entry: 'chapter-05', create: () => chapter05(scope) },
      { key: 'handoff', chapter: '05', only: 'handoff', create: () => handoff() },
      { key: 'inspection', chapter: '05', only: 'continuation', create: () => inspection() },
      { key: 'chapter-06', chapter: '06', entry: 'chapter-06', only: 'continuation', create: () => chapter06(scope) },
      { key: 'chapter-07', chapter: '07', entry: 'chapter-07', only: 'continuation', create: () => chapter07(scope) },
      { key: 'epilogue', chapter: '08', entry: 'epilogue', only: 'continuation', create: () => epilogue(scope) },
    ]
    const sections = await Promise.all(sources.map(async (source) => ({
      ...source,
      steps: (await source.create()).map((step: GameStep, index: number): GameStep => {
        const uuid = index === 0 && source.entry ? source.entry : `story:${source.key}:${index}`
        return {
          ...step, uuid,
          metadata: { ...step.metadata, point: { ...step.metadata?.point, storyId: 'call-me-tomorrow', sceneId: DEMO_SCENE_ID, chapterId: source.chapter, stepId: uuid } },
          run: async ctx => {
            if (generation !== this.playbackGeneration || ctx.signal.aborted) return
            if (source.entry && index === 0) {
              await this.engine.saveToSlot(`chapter-${source.entry}`, { name: STORY_TREE_NODES.find(node => node.id === source.entry)?.title })
              await this.engine.saveToSlot('continue', { name: '继续阅读' })
              await this.refreshLibrary()
            }
            if (ctx.signal.aborted) return
            await step.run(ctx)
            if (!ctx.signal.aborted && ctx.choice) await this.rememberChoice(ctx.choice.choiceId)
          },
        }
      }),
    })))
    let starting = !startStepId
    if (startStepId && !sections.some(section => section.steps.some(step => step.uuid === startStepId))) throw new Error('找不到对应的剧本位置。')
    for (const section of sections) {
      if (generation !== this.playbackGeneration) return
      let start = 0
      if (!starting) {
        start = section.steps.findIndex(step => step.uuid === startStepId)
        if (start < 0) continue
        starting = true
      }
      const handedOff = this.state().choices.includes('early-handoff')
      if ((section.only === 'handoff' && !handedOff) || (section.only === 'continuation' && handedOff)) continue
      await this.engine.dialogue(section.steps.slice(start))
    }
    if (generation !== this.playbackGeneration) return
    const ending = this.state().choices.includes('early-handoff') ? 'handoff' : this.state().choices.includes('formal-followup') ? 'letter' : 'tomorrow'
    await this.patch({ status: 'ended', ending })
    await this.engine.endGame({ ...endings[ending], ending, reason: 'story-complete' })
  }

  async rememberChoice(choiceId: string): Promise<void> {
    const group = choiceGroups.find(group => group.includes(choiceId))
    if (!group) return
    const choices = [...this.state().choices.filter(choice => !group.includes(choice)), choiceId]
    await this.patch({ choices, ...(group === choiceGroups[0] ? { workApproach: choiceId as WorkApproach } : {}) })
  }
}

export function prologueScope(engine: QuaEngine): StoryScope {
  const state = () => engine.getViewState().plugins[DEMO_STORY_PLUGIN_ID] as StoryState | undefined
  return {
    response: (listening, catalog) => state()?.workApproach === 'catalog-first' ? catalog : listening,
    pick: (choice, yes, no) => state()?.choices?.includes(choice) ? yes : no,
  }
}
