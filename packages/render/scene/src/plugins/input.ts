import type {
  RendererInputCommand,
  RendererInputDevice,
} from '@quajs/render-core'
import type { SceneHostInputEvent } from '@quajs/scene-host'
import type { SceneRendererPluginContext } from '../types'
import { clientPointToStageLogical, RenderToLogicEvents, viewAllowsDialogueChrome, viewAllowsHudChrome } from '@quajs/render-core'
import { defineSceneRendererPlugin } from './core'
import { INTERACTIVE_CONTROL_METADATA_KEYS } from './projection-utils'

export type SceneRendererInputBindingPhase = 'press' | 'release'
export type SceneRendererInputWheelDirection = 'up' | 'down' | 'left' | 'right'

export interface SceneRendererInputKeyboardBinding {
  source: 'keyboard'
  code: string
  command: RendererInputCommand
  phase?: SceneRendererInputBindingPhase
  repeat?: boolean
}

export interface SceneRendererInputPointerBinding {
  source: 'pointer'
  command: RendererInputCommand
  phase?: SceneRendererInputBindingPhase
  target?: string
}

export interface SceneRendererInputWheelBinding {
  source: 'wheel'
  command: RendererInputCommand
  direction?: SceneRendererInputWheelDirection
  throttleMs?: number
}

export interface SceneRendererInputGamepadBinding {
  source: 'gamepad'
  button: number
  command: RendererInputCommand
  phase?: SceneRendererInputBindingPhase
}

export type SceneRendererInputBinding
  = | SceneRendererInputKeyboardBinding
    | SceneRendererInputPointerBinding
    | SceneRendererInputWheelBinding
    | SceneRendererInputGamepadBinding

export interface InputSceneRendererPluginOptions {
  pointerAdvance?: boolean
  bindings?: readonly SceneRendererInputBinding[]
  includeDefaultBindings?: boolean
  keyboard?: boolean
  pointer?: boolean
  wheel?: boolean
  gamepad?: boolean
  focusTracking?: boolean
  filterInteractiveTargets?: boolean
}

export function createInputSceneRendererPlugin(options: InputSceneRendererPluginOptions = {}) {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/input',
    setup(context) {
      const controller = new SceneInputController(context, options)
      context.addDisposer(context.scene.host.input.onInput(event => controller.handleInputEvent(event)))
    },
  })
}

export const inputSceneRendererPlugin = createInputSceneRendererPlugin()

const DEFAULT_KEYBOARD_BINDINGS: readonly SceneRendererInputKeyboardBinding[] = [
  { source: 'keyboard', code: 'Enter', command: 'advance' },
  { source: 'keyboard', code: 'Space', command: 'advance' },
  { source: 'keyboard', code: ' ', command: 'advance' },
  { source: 'keyboard', code: 'ArrowRight', command: 'advance' },
  { source: 'keyboard', code: 'ArrowDown', command: 'advance' },
  { source: 'keyboard', code: 'PageDown', command: 'advance' },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:start', phase: 'press' },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:stop', phase: 'release' },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:start', phase: 'press' },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:stop', phase: 'release' },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:start', phase: 'press' },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:stop', phase: 'release' },
  { source: 'keyboard', code: 'KeyA', command: 'auto:toggle' },
  { source: 'keyboard', code: 'ArrowUp', command: 'choice:previous' },
  { source: 'keyboard', code: 'Escape', command: 'ui:cancel' },
  { source: 'keyboard', code: 'KeyH', command: 'ui:screenshot' },
]

const DEFAULT_POINTER_BINDINGS: readonly SceneRendererInputPointerBinding[] = [
  { source: 'pointer', command: 'advance' },
]

const DEFAULT_GAMEPAD_BINDINGS: readonly SceneRendererInputGamepadBinding[] = [
  { source: 'gamepad', button: 0, command: 'choice:confirm' },
  { source: 'gamepad', button: 1, command: 'ui:cancel' },
  { source: 'gamepad', button: 12, command: 'choice:previous' },
  { source: 'gamepad', button: 13, command: 'choice:next' },
  { source: 'gamepad', button: 5, command: 'fastForward:start', phase: 'press' },
  { source: 'gamepad', button: 5, command: 'fastForward:stop', phase: 'release' },
  { source: 'gamepad', button: 7, command: 'skip:start', phase: 'press' },
  { source: 'gamepad', button: 7, command: 'skip:stop', phase: 'release' },
  { source: 'gamepad', button: 9, command: 'ui:menu' },
]

class SceneInputController {
  private readonly bindings: readonly SceneRendererInputBinding[]
  private readonly pressedKeys = new Set<string>()
  private readonly gamepadButtons = new Map<number, boolean>()
  private readonly lastWheelDispatch = new Map<RendererInputCommand, number>()
  private dispatchQueue: Promise<void> = Promise.resolve()
  private focusedChoiceId?: string

  constructor(
    private readonly context: SceneRendererPluginContext,
    private readonly options: InputSceneRendererPluginOptions,
  ) {
    this.bindings = [
      ...(options.includeDefaultBindings === false ? [] : defaultBindings(options)),
      ...(options.bindings || []),
    ]
  }

  async handleInputEvent(event: SceneHostInputEvent): Promise<void> {
    if (event.kind === 'pointer' && (event.phase === 'down' || event.phase === 'up')) {
      await this.handlePointer(event)
      return
    }
    if (event.kind === 'pointer' && event.phase === 'wheel') {
      await this.handleWheel(event)
      return
    }
    if (event.kind === 'keyboard') {
      if (await this.context.scene.interceptKey(event))
        return
      await this.handleKeyboard(event)
      return
    }
    if (event.kind === 'gamepad') {
      await this.handleGamepad(event)
      return
    }
    if (event.kind === 'focus') {
      await this.handleFocus(event)
    }
  }

  private async handlePointer(event: SceneHostInputEvent): Promise<void> {
    if (this.options.pointer === false)
      return

    const point = clientPointToStageLogical(this.context.scene.getStageLayout(), {
      clientX: event.x ?? 0,
      clientY: event.y ?? 0,
    })
    if (!point.insideStage && !event.targetNode)
      return
    const phase = inputPhase(event.phase)
    const target = typeof event.metadata?.target === 'string' ? event.metadata.target : undefined
    // Capture the hit before awaiting pipeline work. Another listener can
    // hide or replace this control while USER_CLICK is being dispatched.
    const interactive = this.options.filterInteractiveTargets !== false && isInteractiveControlPointer(this.context, event, point)
    if (phase === 'press') {
      await this.context.emitRenderToLogic(RenderToLogicEvents.USER_CLICK, {
        x: point.x,
        y: point.y,
        target,
      })
    }

    if (interactive) {
      return
    }

    for (const binding of this.bindings) {
      if (binding.source !== 'pointer' || (binding.phase || 'press') !== phase)
        continue
      if (binding.target && binding.target !== target)
        continue
      await this.dispatchCommand({
        command: binding.command,
        device: 'pointer',
        source: `scene:pointer${target ? `:${target}` : ''}`,
        pressed: phase === 'press',
        metadata: {
          ...event.metadata,
          x: point.x,
          y: point.y,
          target,
          insideViewport: point.insideViewport,
          insideStage: point.insideStage,
        },
      })
    }
  }

  private async handleKeyboard(event: SceneHostInputEvent): Promise<void> {
    if (this.options.keyboard === false)
      return

    const key = event.key || event.code || ''
    const code = event.code || event.key || ''
    const phase = inputPhase(event.phase)
    const wasPressed = this.pressedKeys.has(code)
    if (phase === 'press')
      this.pressedKeys.add(code)
    else
      this.pressedKeys.delete(code)

    if (phase === 'press') {
      await this.context.emitRenderToLogic(RenderToLogicEvents.USER_KEY_PRESS, { key, code: event.code })
    }
    for (const binding of this.bindings) {
      if (binding.source !== 'keyboard' || (binding.phase || 'press') !== phase)
        continue
      if (binding.code !== code)
        continue
      const repeat = event.repeat || (phase === 'press' && wasPressed)
      if (repeat && binding.repeat !== true)
        continue
      await this.dispatchCommand({
        command: binding.command,
        device: 'keyboard',
        source: `scene:keyboard:${code || key}`,
        repeat,
        pressed: phase === 'press',
        metadata: {
          ...event.metadata,
          key,
          code,
        },
      })
    }
  }

  private async handleWheel(event: SceneHostInputEvent): Promise<void> {
    if (this.options.wheel === false)
      return

    const direction = wheelDirection(event)
    for (const binding of this.bindings) {
      if (binding.source !== 'wheel')
        continue
      if (binding.direction && binding.direction !== direction)
        continue
      if (this.isWheelThrottled(binding))
        continue
      this.lastWheelDispatch.set(binding.command, this.context.scene.host.runtime.now())
      await this.dispatchCommand({
        command: binding.command,
        device: 'wheel',
        source: `scene:wheel:${direction}`,
        metadata: {
          ...event.metadata,
          direction,
        },
      })
    }
  }

  private async handleGamepad(event: SceneHostInputEvent): Promise<void> {
    if (this.options.gamepad === false)
      return

    const button = gamepadButton(event)
    if (button === undefined)
      return
    const phase = inputPhase(event.phase)
    const pressed = phase === 'press'
    const wasPressed = this.gamepadButtons.get(button) === true
    if (pressed === wasPressed && event.repeat !== true)
      return
    this.gamepadButtons.set(button, pressed)
    for (const binding of this.bindings) {
      if (binding.source !== 'gamepad' || binding.button !== button || (binding.phase || 'press') !== phase)
        continue
      await this.dispatchCommand({
        command: binding.command,
        device: 'gamepad',
        source: `scene:gamepad:button:${button}`,
        pressed,
        repeat: event.repeat,
        metadata: {
          ...event.metadata,
          button,
        },
      })
    }
  }

  private async handleFocus(event: SceneHostInputEvent): Promise<void> {
    if (this.options.focusTracking === false)
      return

    if (event.phase === 'blur') {
      this.pressedKeys.clear()
      this.gamepadButtons.clear()
      await this.context.scene.getActions().windowBlur()
      return
    }
    if (event.phase === 'focus') {
      await this.context.scene.getActions().windowFocus()
    }
  }

  private async dispatchCommand(dispatch: {
    command: RendererInputCommand
    device: RendererInputDevice
    source: string
    repeat?: boolean
    pressed?: boolean
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const task = this.dispatchQueue.then(async () => {
      const uiHidden = this.context.getViewState().ui.visible === false
      await this.context.scene.getActions().inputCommand({
        command: dispatch.command,
        device: dispatch.device,
        source: dispatch.source,
        repeat: dispatch.repeat,
        pressed: dispatch.pressed,
        timestamp: this.context.scene.host.runtime.now(),
        metadata: dispatch.metadata,
      })
      if (!uiHidden && this.context.getViewState().ui.visible !== false)
        await this.dispatchBuiltInIntent(dispatch.command, dispatch.source, dispatch.metadata)
    })
    this.dispatchQueue = task.catch(() => {})
    await task
  }

  private async dispatchBuiltInIntent(
    command: RendererInputCommand,
    source: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const actions = this.context.scene.getActions()
    switch (command) {
      case 'advance':
        if (!viewAllowsDialogueChrome(this.context.getViewState()))
          return
        if (source === 'scene:keyboard:ArrowDown' && this.context.getViewState().choices.some(choice => choice.enabled)) {
          this.focusChoice(1)
          return
        }
        await actions.advance(source)
        break
      case 'auto:start':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.startAuto(source)
        break
      case 'auto:stop':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.stopAuto(source)
        break
      case 'auto:toggle':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        if (this.context.getViewState().flowControl.mode === 'auto')
          await actions.stopAuto(source)
        else
          await actions.startAuto(source)
        break
      case 'skip:start':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.startSkip(source)
        break
      case 'skip:stop':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.stopSkip(source)
        break
      case 'skip:toggle':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        if (this.context.getViewState().flowControl.mode === 'skip')
          await actions.stopSkip(source)
        else
          await actions.startSkip(source)
        break
      case 'fastForward:start':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.startFastForward(source)
        break
      case 'fastForward:stop':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        await actions.stopFastForward(source)
        break
      case 'fastForward:toggle':
        if (!viewAllowsHudChrome(this.context.getViewState()))
          return
        if (this.context.getViewState().flowControl.mode === 'fast-forward')
          await actions.stopFastForward(source)
        else
          await actions.startFastForward(source)
        break
      case 'choice:previous':
        if (!viewAllowsDialogueChrome(this.context.getViewState()))
          return
        this.focusChoice(-1)
        break
      case 'choice:next':
        if (!viewAllowsDialogueChrome(this.context.getViewState()))
          return
        this.focusChoice(1)
        break
      case 'choice:confirm':
        if (!viewAllowsDialogueChrome(this.context.getViewState()))
          return
        await this.selectFocusedChoice(source)
        break
      case 'ui:save':
        await actions.requestSave(typeof metadata?.slotId === 'string' ? metadata.slotId : undefined)
        break
      case 'ui:load':
        await actions.requestLoad(typeof metadata?.slotId === 'string' ? metadata.slotId : undefined)
        break
      case 'ui:cancel':
      case 'ui:menu':
        break
    }
  }

  private focusChoice(direction: 1 | -1): void {
    const choices = this.context.getViewState().choices.filter(choice => choice.enabled)
    if (choices.length === 0) {
      this.focusedChoiceId = undefined
      return
    }
    const currentIndex = choices.findIndex(choice => choice.id === this.focusedChoiceId)
    const nextIndex = currentIndex >= 0
      ? (currentIndex + direction + choices.length) % choices.length
      : direction > 0 ? 0 : choices.length - 1
    this.focusedChoiceId = choices[nextIndex]?.id
  }

  private async selectFocusedChoice(source: string): Promise<void> {
    const choices = this.context.getViewState().choices
    const focused = this.focusedChoiceId
      ? choices.find(choice => choice.id === this.focusedChoiceId && choice.enabled)
      : undefined
    if (focused) {
      await this.context.scene.getActions().selectChoice(focused.id)
      return
    }
    const first = choices.find(choice => choice.enabled)
    if (first) {
      await this.context.scene.getActions().selectChoice(first.id)
      return
    }
    await this.context.scene.getActions().advance(source)
  }

  private isWheelThrottled(binding: SceneRendererInputWheelBinding): boolean {
    const throttleMs = binding.throttleMs ?? 200
    const last = this.lastWheelDispatch.get(binding.command)
    return last !== undefined && this.context.scene.host.runtime.now() - last < throttleMs
  }
}

function isInteractiveControlPointer(
  context: SceneRendererPluginContext,
  event: SceneHostInputEvent,
  point: { x: number, y: number },
): boolean {
  if (hasInteractiveControlMetadata(event.metadata))
    return true

  if (event.targetNode) {
    const metadata = context.scene.host.nodes.getNodeMetadata?.(event.targetNode)
    if (hasInteractiveControlMetadata(metadata))
      return true
  }

  const hit = context.scene.host.nodes.hitTest?.(context.scene.getRootNode(), point, { metadataKeys: INTERACTIVE_CONTROL_METADATA_KEYS })
  return hasInteractiveControlMetadata(hit?.metadata)
}

function hasInteractiveControlMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(metadata && INTERACTIVE_CONTROL_METADATA_KEYS.some(key => metadata[key] !== undefined))
}

function defaultBindings(options: InputSceneRendererPluginOptions): SceneRendererInputBinding[] {
  return [
    ...DEFAULT_KEYBOARD_BINDINGS,
    ...(options.pointerAdvance === false ? [] : DEFAULT_POINTER_BINDINGS),
    ...DEFAULT_GAMEPAD_BINDINGS,
  ]
}

function inputPhase(phase: SceneHostInputEvent['phase']): SceneRendererInputBindingPhase {
  return phase === 'up' ? 'release' : 'press'
}

function wheelDirection(event: SceneHostInputEvent): SceneRendererInputWheelDirection {
  const value = event.metadata?.direction
  if (value === 'up' || value === 'down' || value === 'left' || value === 'right')
    return value
  const deltaX = numberValue(event.metadata?.deltaX, 0)
  const deltaY = numberValue(event.metadata?.deltaY, 0)
  if (Math.abs(deltaX) > Math.abs(deltaY))
    return deltaX > 0 ? 'right' : 'left'
  return deltaY < 0 ? 'up' : 'down'
}

function gamepadButton(event: SceneHostInputEvent): number | undefined {
  const value = event.metadata?.button ?? event.code ?? event.key
  const button = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  return typeof button === 'number' && Number.isFinite(button) ? button : undefined
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
