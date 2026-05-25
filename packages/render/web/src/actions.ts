import type { Pipeline } from '@quajs/pipeline'
import type { FlowControlMode, RendererInputCommandPayload, SaveRequestPayload } from '@quajs/render-core'
import { emitRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'

export interface RendererActions {
  ready: () => Promise<void>
  sceneReady: (sceneId?: string) => Promise<void>
  click: (payload?: { x?: number, y?: number, target?: string }) => Promise<void>
  inputCommand: (payload: RendererInputCommandPayload) => Promise<void>
  advance: (source?: string) => Promise<void>
  setFlowControlMode: (mode: FlowControlMode, source?: string) => Promise<void>
  startAuto: (source?: string) => Promise<void>
  stopAuto: (source?: string) => Promise<void>
  startSkip: (source?: string) => Promise<void>
  stopSkip: (source?: string) => Promise<void>
  startFastForward: (source?: string) => Promise<void>
  stopFastForward: (source?: string) => Promise<void>
  selectChoice: (choiceId: string) => Promise<void>
  requestSave: (slotIdOrPayload?: string | SaveRequestPayload, payload?: Omit<SaveRequestPayload, 'slotId'>) => Promise<void>
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
    inputCommand: (payload: RendererInputCommandPayload) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_INPUT_COMMAND, payload),
    advance: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_ADVANCE, { source }),
    setFlowControlMode: (mode: FlowControlMode, source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_SET_MODE_REQUEST, { mode, source }),
    startAuto: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_START_AUTO_REQUEST, { source }),
    stopAuto: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_STOP_AUTO_REQUEST, { source }),
    startSkip: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_START_SKIP_REQUEST, { source }),
    stopSkip: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_STOP_SKIP_REQUEST, { source }),
    startFastForward: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_START_FAST_FORWARD_REQUEST, { source }),
    stopFastForward: (source?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.FLOW_CONTROL_STOP_FAST_FORWARD_REQUEST, { source }),
    selectChoice: (choiceId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId }),
    requestSave: (slotIdOrPayload?: string | SaveRequestPayload, payload?: Omit<SaveRequestPayload, 'slotId'>) => {
      const resolved = typeof slotIdOrPayload === 'string'
        ? { slotId: slotIdOrPayload, ...(payload || {}) }
        : (slotIdOrPayload || {})
      return emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_SAVE_REQUEST, resolved)
    },
    requestLoad: (slotId?: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.GAME_LOAD_REQUEST, { slotId }),
    requestUiOpen: (elementId: string, config?: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_OPEN, { elementId, config }),
    requestUiClose: (elementId: string) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_CLOSE, { elementId }),
    requestUiUpdate: (elementId: string, config: Record<string, unknown>) => emitRenderToLogic(getPipeline(), RenderToLogicEvents.UI_REQUEST_UPDATE, { elementId, config }),
    requestPluginEvent: (type: string, payload: unknown = {}) => getPipeline().emit(type, payload),
  }
}
