import type { Pipeline } from '@quajs/pipeline'
import { emitRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'

export interface RendererActions {
  ready: () => Promise<void>
  sceneReady: (sceneId?: string) => Promise<void>
  click: (payload?: { x?: number, y?: number, target?: string }) => Promise<void>
  advance: (source?: string) => Promise<void>
  selectChoice: (choiceId: string) => Promise<void>
  requestSave: (slotId?: string) => Promise<void>
  requestLoad: (slotId?: string) => Promise<void>
  requestUiOpen: (elementId: string, config?: Record<string, unknown>) => Promise<void>
  requestUiClose: (elementId: string) => Promise<void>
  requestUiUpdate: (elementId: string, config: Record<string, unknown>) => Promise<void>
  requestPluginEvent: (type: string, payload?: unknown) => Promise<void>
}

export function createRendererActions(getPipeline: () => Pipeline): RendererActions {
  return {
    ready: () => emitRenderToLogic(getPipeline(), RenderToLogicEvents.RENDER_READY, { timestamp: Date.now() }),
    sceneReady: (sceneId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.SCENE_READY, { sceneId, timestamp: Date.now() }),
    click: (payload = {}) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CLICK, payload),
    advance: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source }),
    selectChoice: (choiceId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId }),
    requestSave: (slotId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_SAVE_REQUEST, { slotId }),
    requestLoad: (slotId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_LOAD_REQUEST, { slotId }),
    requestUiOpen: (elementId: string, config?: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId, config }),
    requestUiClose: (elementId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId }),
    requestUiUpdate: (elementId: string, config: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_UPDATE, { elementId, config }),
    requestPluginEvent: (type: string, payload: unknown = {}) => getPipeline().emit(type, payload),
  }
}
