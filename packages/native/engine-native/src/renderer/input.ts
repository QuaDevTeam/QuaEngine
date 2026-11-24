import type { EngineContext } from '@quajs/engine'
import { createRendererActions, onRenderToLogic, RenderToLogicEvents, viewAllowsDialogueChrome, viewAllowsHudChrome } from '@quajs/render-core'

/** Run accepted product commands through the same pipeline actions as the Web adapter. */
export function installNativeProductInput(engine: Pick<EngineContext['engine'], 'getViewState'>, pipeline: EngineContext['pipeline']): () => void {
  const actions = createRendererActions(() => pipeline)
  return onRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, async ({ command, pressed, source }, context) => {
    // Release a held mode even when a menu opened after the button went down.
    if (command === 'skip:stop')
      return actions.stopSkip(source)
    if (command === 'fastForward:stop')
      return actions.stopFastForward(source)
    if (context.handled || pressed === false)
      return
    const view = engine.getViewState()
    if (command === 'advance') {
      if (viewAllowsDialogueChrome(view) && !view.choices?.length)
        await actions.advance(source)
      return
    }
    if (!viewAllowsHudChrome(view))
      return
    switch (command) {
      case 'auto:start': return actions.startAuto(source)
      case 'auto:stop': return actions.stopAuto(source)
      case 'auto:toggle': return view.flowControl.mode === 'auto' ? actions.stopAuto(source) : actions.startAuto(source)
      case 'skip:start': return actions.startSkip(source)
      case 'skip:toggle': return view.flowControl.mode === 'skip' ? actions.stopSkip(source) : actions.startSkip(source)
      case 'fastForward:start': return actions.startFastForward(source)
      case 'fastForward:toggle': return view.flowControl.mode === 'fast-forward' ? actions.stopFastForward(source) : actions.startFastForward(source)
    }
  })
}
