import { QuaEngine, Scene } from '@quajs/engine'
import type { HudPatch } from '../types'
import { DEMO_STORY_PLUGIN_ID, DemoStoryPlugin } from './prologue-state'

/** Optional scene facade over the same full-story plugin used by Web/native pipeline intents. */
export class MainScene extends Scene {
  readonly name = 'call-me-tomorrow-prologue'

  constructor(
    private readonly engine: QuaEngine,
    private readonly updateHud: (patch: HudPatch) => void,
    private readonly markStoryStarted: () => void,
  ) {
    super()
  }

  async init(): Promise<void> {
    this.markStoryStarted()
  }

  async run(): Promise<void> {
    const story = this.engine.getPluginById<DemoStoryPlugin>(DEMO_STORY_PLUGIN_ID)
    if (!story) throw new Error('Demo story plugin is not installed.')
    this.updateHud({ chapter: '00', route: '雨天来客', signal: '0' })
    await story.start()
  }
}
