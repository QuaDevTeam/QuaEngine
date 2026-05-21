import type { QuaEngine } from '../core/engine'
import type { ChoiceIntent, DialogueIntent, Scene, SceneEnterContext } from '../core/types'
import type { SceneTransitionIntent, SceneTransitionType } from '../events/events'
import { getPackageLogger } from '@quajs/logger'
import { emitLogicToRender, LogicToRenderEvents, RenderToLogicEvents, waitForPipelineEvent } from '../events/events'

const logger = getPackageLogger('engine:scene-manager')

const DEFAULT_SCENE_READY_TIMEOUT = 5000

export type SceneTransition = SceneTransitionType
export interface SceneTransitionOptions extends SceneTransitionIntent {}

export class SceneManager {
  private currentScene?: Scene

  constructor(private engine: QuaEngine) {}

  async loadScene(scene: Scene, transition?: SceneTransitionOptions, enterContext?: SceneEnterContext): Promise<void> {
    const previousScene = this.currentScene
    logger.info(`Loading scene: ${scene.name}`)

    if (this.currentScene) {
      await this.currentScene.destroy?.()
    }

    this.currentScene = scene
    this.engine.getStore().commit('setCurrentScene', scene.name)
    await scene.init(enterContext)
    const sceneReady = transition?.waitForRenderer
      ? waitForPipelineEvent(
          this.engine.getPipeline(),
          RenderToLogicEvents.SCENE_READY,
          payload => payload.sceneId === undefined || payload.sceneId === scene.name,
          {
            timeout: transition.rendererReadyTimeout ?? DEFAULT_SCENE_READY_TIMEOUT,
          },
        )
      : undefined
    await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.SCENE_CHANGE, {
      fromScene: previousScene?.name,
      toScene: scene.name,
      transition,
    })
    await sceneReady
    await scene.run(enterContext)
  }

  async initializeScene(sceneId: string, config: Record<string, unknown> = {}): Promise<void> {
    await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.SCENE_INIT, {
      sceneId,
      config,
    })
  }

  async destroyCurrentScene(): Promise<void> {
    if (!this.currentScene)
      return

    const sceneName = this.currentScene.name
    await this.currentScene.destroy?.()
    this.currentScene = undefined
    this.engine.getStore().commit('setCurrentScene', null)
    await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.SCENE_DESTROY, {
      sceneId: sceneName,
    })
  }

  async showDialogue(
    characterName: string | undefined,
    text: DialogueIntent['text'],
    choices?: ChoiceIntent[],
  ): Promise<void> {
    const payload: DialogueIntent = {
      characterName,
      text,
    }
    await this.engine.showDialogue(payload)
    if (choices) {
      await this.engine.showChoices(choices)
    }
  }

  async hideDialogue(): Promise<void> {
    await this.engine.hideDialogue()
  }

  async updateDialogue(
    text: DialogueIntent['text'],
    characterName?: string,
    choices?: ChoiceIntent[],
  ): Promise<void> {
    await this.showDialogue(characterName, text, choices)
  }

  async showUI(elementId: string, config: Record<string, unknown> = {}): Promise<void> {
    await this.engine.showUI(elementId, config)
  }

  async hideUI(elementId: string): Promise<void> {
    await this.engine.hideUI(elementId)
  }

  async updateUI(elementId: string, config: Record<string, unknown>): Promise<void> {
    await this.engine.updateUI(elementId, config)
  }

  async applyEffect(
    effectType: 'fade_in' | 'fade_out' | 'shake' | 'flash',
    options: {
      duration?: number
      intensity?: number
      target?: string
    } = {},
  ): Promise<void> {
    await this.engine.applyEffect({
      id: `${effectType}:${Date.now()}`,
      type: effectType,
      ...options,
    })
  }

  getCurrentScene(): Scene | undefined {
    return this.currentScene
  }

  getSceneHistory(): string[] {
    return [...(this.engine.getStore().state.engine.runtime.sceneHistory || [])]
  }

  clearHistory(): void {
    this.engine.getStore().commit('clearSceneHistory')
  }

  async destroy(): Promise<void> {
    await this.currentScene?.destroy?.()
    this.currentScene = undefined
  }
}
