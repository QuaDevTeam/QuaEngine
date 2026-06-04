import type { CocosHostInputEvent } from '@quajs/cocos-host'
import type {
  RendererInputCommand,
  RendererInputDevice,
} from '@quajs/render-core'
import type { CocosRendererPluginContext } from '../types'
import { clientPointToStageLogical, RenderToLogicEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'

export type CocosRendererInputBindingPhase = 'press' | 'release'
export type CocosRendererInputWheelDirection = 'up' | 'down' | 'left' | 'right'

export interface CocosRendererInputKeyboardBinding {
  source: 'keyboard'
  code: string
  command: RendererInputCommand
  phase?: CocosRendererInputBindingPhase
  repeat?: boolean
}

export interface CocosRendererInputPointerBinding {
  source: 'pointer'
  command: RendererInputCommand
  phase?: CocosRendererInputBindingPhase
  target?: string
}

export interface CocosRendererInputWheelBinding {
  source: 'wheel'
  command: RendererInputCommand
  direction?: CocosRendererInputWheelDirection
  throttleMs?: number
}

export interface CocosRendererInputGamepadBinding {
  source: 'gamepad'
  button: number
  command: RendererInputCommand
  phase?: CocosRendererInputBindingPhase
}

export type CocosRendererInputBinding
  = | CocosRendererInputKeyboardBinding
    | CocosRendererInputPointerBinding
    | CocosRendererInputWheelBinding
    | CocosRendererInputGamepadBinding

export interface InputCocosRendererPluginOptions {
  pointerAdvance?: boolean
  bindings?: readonly CocosRendererInputBinding[]
  includeDefaultBindings?: boolean
  keyboard?: boolean
  pointer?: boolean
  wheel?: boolean
  gamepad?: boolean
  focusTracking?: boolean
  filterInteractiveTargets?: boolean
}

export function createInputCocosRendererPlugin(options: InputCocosRendererPluginOptions = {}) {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/input',
    setup(context) {
      const controller = new CocosInputController(context, options)
      context.addDisposer(context.cocos.host.input.onInput(event => controller.handleInputEvent(event)))
    },
  })
}

export const inputCocosRendererPlugin = createInputCocosRendererPlugin()

const INTERACTIVE_CONTROL_METADATA_KEYS = [
  'choiceId',
  'settingsScope',
  'backlogEntryId',
  'galleryEntryId',
  'achievementId',
  'elementId',
  'uiAction',
  'settingsAction',
  'settingsPathKey',
  'backlogAction',
  'galleryAction',
  'achievementAction',
] as const

const DEFAULT_KEYBOARD_BINDINGS: readonly CocosRendererInputKeyboardBinding[] = [
  { source: 'keyboard', code: 'Enter', command: 'advance' },
  { source: 'keyboard', code: 'Space', command: 'advance' },
  { source: 'keyboard', code: ' ', command: 'advance' },
  { source: 'keyboard', code: 'ArrowLeft', command: 'advance' },
  { source: 'keyboard', code: 'ArrowRight', command: 'advance' },
  { source: 'keyboard', code: 'PageDown', command: 'advance' },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:start', phase: 'press' },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:stop', phase: 'release' },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:start', phase: 'press' },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:stop', phase: 'release' },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:start', phase: 'press' },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:stop', phase: 'release' },
  { source: 'keyboard', code: 'KeyA', command: 'auto:toggle' },
  { source: 'keyboard', code: 'ArrowUp', command: 'choice:previous' },
  { source: 'keyboard', code: 'ArrowDown', command: 'choice:next' },
  { source: 'keyboard', code: 'Escape', command: 'ui:cancel' },
]

const DEFAULT_POINTER_BINDINGS: readonly CocosRendererInputPointerBinding[] = [
  { source: 'pointer', command: 'advance' },
]

const DEFAULT_GAMEPAD_BINDINGS: readonly CocosRendererInputGamepadBinding[] = [
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

class CocosInputController {
  private readonly bindings: readonly CocosRendererInputBinding[]
  private readonly pressedKeys = new Set<string>()
  private readonly gamepadButtons = new Map<number, boolean>()
  private readonly lastWheelDispatch = new Map<RendererInputCommand, number>()
  private dispatchQueue: Promise<void> = Promise.resolve()
  private focusedChoiceId?: string

  constructor(
    private readonly context: CocosRendererPluginContext,
    private readonly options: InputCocosRendererPluginOptions,
  ) {
    this.bindings = [
      ...(options.includeDefaultBindings === false ? [] : defaultBindings(options)),
      ...(options.bindings || []),
    ]
  }

  async handleInputEvent(event: CocosHostInputEvent): Promise<void> {
    if (event.kind === 'pointer' && event.phase === 'down') {
      await this.handlePointer(event)
      return
    }
    if (event.kind === 'pointer' && event.phase === 'wheel') {
      await this.handleWheel(event)
      return
    }
    if (event.kind === 'keyboard') {
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

  private async handlePointer(event: CocosHostInputEvent): Promise<void> {
    if (this.options.pointer === false)
      return

    const point = clientPointToStageLogical(this.context.cocos.getStageLayout(), {
      clientX: event.x ?? 0,
      clientY: event.y ?? 0,
    })
    const target = typeof event.metadata?.target === 'string' ? event.metadata.target : undefined
    await this.context.emitRenderToLogic(RenderToLogicEvents.USER_CLICK, {
      x: point.x,
      y: point.y,
      target,
    })

    if (this.options.filterInteractiveTargets !== false && isInteractiveControlPointer(this.context, event, point)) {
      return
    }

    for (const binding of this.bindings) {
      if (binding.source !== 'pointer' || (binding.phase || 'press') !== 'press')
        continue
      if (binding.target && binding.target !== target)
        continue
      await this.dispatchCommand({
        command: binding.command,
        device: 'pointer',
        source: `cocos:pointer${target ? `:${target}` : ''}`,
        pressed: true,
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

  private async handleKeyboard(event: CocosHostInputEvent): Promise<void> {
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
      if (binding.code !== code && binding.code !== key)
        continue
      const repeat = event.repeat || (phase === 'press' && wasPressed)
      if (repeat && binding.repeat !== true)
        continue
      await this.dispatchCommand({
        command: binding.command,
        device: 'keyboard',
        source: `cocos:keyboard:${code || key}`,
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

  private async handleWheel(event: CocosHostInputEvent): Promise<void> {
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
      this.lastWheelDispatch.set(binding.command, this.context.cocos.host.runtime.now())
      await this.dispatchCommand({
        command: binding.command,
        device: 'wheel',
        source: `cocos:wheel:${direction}`,
        metadata: {
          ...event.metadata,
          direction,
        },
      })
    }
  }

  private async handleGamepad(event: CocosHostInputEvent): Promise<void> {
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
        source: `cocos:gamepad:button:${button}`,
        pressed,
        repeat: event.repeat,
        metadata: {
          ...event.metadata,
          button,
        },
      })
    }
  }

  private async handleFocus(event: CocosHostInputEvent): Promise<void> {
    if (this.options.focusTracking === false)
      return

    if (event.phase === 'blur') {
      this.pressedKeys.clear()
      this.gamepadButtons.clear()
      await this.context.cocos.getActions().windowBlur()
      return
    }
    if (event.phase === 'focus') {
      await this.context.cocos.getActions().windowFocus()
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
      await this.context.cocos.getActions().inputCommand({
        command: dispatch.command,
        device: dispatch.device,
        source: dispatch.source,
        repeat: dispatch.repeat,
        pressed: dispatch.pressed,
        timestamp: this.context.cocos.host.runtime.now(),
        metadata: dispatch.metadata,
      })
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
    const actions = this.context.cocos.getActions()
    switch (command) {
      case 'advance':
        await actions.advance(source)
        break
      case 'auto:start':
        await actions.startAuto(source)
        break
      case 'auto:stop':
        await actions.stopAuto(source)
        break
      case 'auto:toggle':
        if (this.context.getViewState().flowControl.mode === 'auto')
          await actions.stopAuto(source)
        else
          await actions.startAuto(source)
        break
      case 'skip:start':
        await actions.startSkip(source)
        break
      case 'skip:stop':
        await actions.stopSkip(source)
        break
      case 'skip:toggle':
        if (this.context.getViewState().flowControl.mode === 'skip')
          await actions.stopSkip(source)
        else
          await actions.startSkip(source)
        break
      case 'fastForward:start':
        await actions.startFastForward(source)
        break
      case 'fastForward:stop':
        await actions.stopFastForward(source)
        break
      case 'fastForward:toggle':
        if (this.context.getViewState().flowControl.mode === 'fast-forward')
          await actions.stopFastForward(source)
        else
          await actions.startFastForward(source)
        break
      case 'choice:previous':
        this.focusChoice(-1)
        break
      case 'choice:next':
        this.focusChoice(1)
        break
      case 'choice:confirm':
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
      await this.context.cocos.getActions().selectChoice(focused.id)
      return
    }
    const first = choices.find(choice => choice.enabled)
    if (first) {
      await this.context.cocos.getActions().selectChoice(first.id)
      return
    }
    await this.context.cocos.getActions().advance(source)
  }

  private isWheelThrottled(binding: CocosRendererInputWheelBinding): boolean {
    const throttleMs = binding.throttleMs ?? 200
    const last = this.lastWheelDispatch.get(binding.command) || 0
    return this.context.cocos.host.runtime.now() - last < throttleMs
  }
}

function isInteractiveControlPointer(
  context: CocosRendererPluginContext,
  event: CocosHostInputEvent,
  point: { x: number, y: number },
): boolean {
  if (hasInteractiveControlMetadata(event.metadata))
    return true

  if (event.targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(event.targetNode)
    if (hasInteractiveControlMetadata(metadata))
      return true
  }

  return INTERACTIVE_CONTROL_METADATA_KEYS.some((metadataKey) => {
    const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey })
    return hasInteractiveControlMetadata(hit?.metadata)
  })
}

function hasInteractiveControlMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(metadata && INTERACTIVE_CONTROL_METADATA_KEYS.some(key => metadata[key] !== undefined))
}

function defaultBindings(options: InputCocosRendererPluginOptions): CocosRendererInputBinding[] {
  return [
    ...DEFAULT_KEYBOARD_BINDINGS,
    ...(options.pointerAdvance === false ? [] : DEFAULT_POINTER_BINDINGS),
    ...DEFAULT_GAMEPAD_BINDINGS,
  ]
}

function inputPhase(phase: CocosHostInputEvent['phase']): CocosRendererInputBindingPhase {
  return phase === 'up' ? 'release' : 'press'
}

function wheelDirection(event: CocosHostInputEvent): CocosRendererInputWheelDirection {
  const value = event.metadata?.direction
  if (value === 'up' || value === 'down' || value === 'left' || value === 'right')
    return value
  const deltaX = numberValue(event.metadata?.deltaX, 0)
  const deltaY = numberValue(event.metadata?.deltaY, 0)
  if (Math.abs(deltaX) > Math.abs(deltaY))
    return deltaX > 0 ? 'right' : 'left'
  return deltaY < 0 ? 'up' : 'down'
}

function gamepadButton(event: CocosHostInputEvent): number | undefined {
  const value = event.metadata?.button ?? event.code ?? event.key
  const button = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  return typeof button === 'number' && Number.isFinite(button) ? button : undefined
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
