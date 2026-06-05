import type {
  QuaViewProjection,
  RendererInputCommand,
  RendererInputCommandPayload,
  RendererInputDevice,
} from '@quajs/render-core'
import type { RendererActions } from './actions'
import type { StageContainerSize } from './layout'
import { viewAllowsDialogueChrome, viewAllowsHudChrome } from '@quajs/render-core'
import {
  clientPointToStageLogical,
  readCssSafeAreaInsets,
  readDevicePixelRatio,
  resolveStageLayout,
} from './layout'

export type RendererInputKeyboardEventType = 'keydown' | 'keyup'
export type RendererInputBindingPhase = 'press' | 'release'
export type RendererInputSource = 'keyboard' | 'pointer' | 'wheel' | 'gamepad'

export interface RendererInputKeyboardBinding {
  source: 'keyboard'
  code: string
  command: RendererInputCommand
  phase?: RendererInputBindingPhase
  repeat?: boolean
  preventDefault?: boolean
}

export interface RendererInputPointerBinding {
  source: 'pointer'
  button?: number
  command: RendererInputCommand
  target?: string
  preventDefault?: boolean
}

export type RendererInputWheelDirection = 'up' | 'down' | 'left' | 'right'

export interface RendererInputWheelBinding {
  source: 'wheel'
  direction?: RendererInputWheelDirection
  command: RendererInputCommand
  preventDefault?: boolean
  throttleMs?: number
}

export interface RendererInputGamepadBinding {
  source: 'gamepad'
  button: number
  command: RendererInputCommand
  phase?: RendererInputBindingPhase
}

export type RendererInputBinding
  = | RendererInputKeyboardBinding
    | RendererInputPointerBinding
    | RendererInputWheelBinding
    | RendererInputGamepadBinding

export interface RendererInputCommandDispatch {
  command: RendererInputCommand
  device: RendererInputDevice
  source: string
  repeat?: boolean
  pressed?: boolean
  metadata?: Record<string, unknown>
}

export interface RendererInputControllerOptions {
  actions: RendererActions
  getViewState: () => Readonly<QuaViewProjection>
  target?: Element | Document | Window
  pointerTarget?: Element
  keyboardTarget?: EventTarget
  window?: Window
  enabled?: () => boolean
  bindings?: readonly RendererInputBinding[]
  includeDefaultBindings?: boolean
  keyboard?: boolean
  pointer?: boolean
  wheel?: boolean
  gamepad?: boolean
  focusTracking?: boolean
  gamepadPollIntervalMs?: number
  filterInteractiveTargets?: boolean
  preventDefault?: boolean
}

export interface RendererInputController {
  start: () => void
  stop: () => void
  dispose: () => void
  dispatchCommand: (dispatch: RendererInputCommandDispatch) => Promise<void>
}

const DEFAULT_GAMEPAD_POLL_INTERVAL_MS = 80
const DEFAULT_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-qua-input-ignore]',
  '.qua-choice-panel',
  '.qua-overlay-layer',
  '.qua-backlog-layer',
  '.qua-settings-layer',
  '.qua-settings-panel',
].join(',')

const DEFAULT_KEYBOARD_BINDINGS: readonly RendererInputKeyboardBinding[] = [
  { source: 'keyboard', code: 'Enter', command: 'advance', preventDefault: true },
  { source: 'keyboard', code: 'Space', command: 'advance', preventDefault: true },
  { source: 'keyboard', code: 'ArrowLeft', command: 'advance', preventDefault: true },
  { source: 'keyboard', code: 'ArrowRight', command: 'advance', preventDefault: true },
  { source: 'keyboard', code: 'PageDown', command: 'advance', preventDefault: true },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:start', phase: 'press', preventDefault: true },
  { source: 'keyboard', code: 'ControlLeft', command: 'skip:stop', phase: 'release', preventDefault: true },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:start', phase: 'press', preventDefault: true },
  { source: 'keyboard', code: 'ControlRight', command: 'skip:stop', phase: 'release', preventDefault: true },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:start', phase: 'press', preventDefault: true },
  { source: 'keyboard', code: 'KeyF', command: 'fastForward:stop', phase: 'release', preventDefault: true },
  { source: 'keyboard', code: 'KeyA', command: 'auto:toggle', preventDefault: true },
  { source: 'keyboard', code: 'ArrowUp', command: 'choice:previous', preventDefault: true },
  { source: 'keyboard', code: 'ArrowDown', command: 'choice:next', preventDefault: true },
  { source: 'keyboard', code: 'Escape', command: 'ui:cancel', preventDefault: true },
]

const DEFAULT_POINTER_BINDINGS: readonly RendererInputPointerBinding[] = [
  { source: 'pointer', button: 0, command: 'advance' },
]

const DEFAULT_GAMEPAD_BINDINGS: readonly RendererInputGamepadBinding[] = [
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

export function createRendererInputController(options: RendererInputControllerOptions): RendererInputController {
  return new RendererInputControllerImpl(options)
}

export function createDefaultRendererInputBindings(): RendererInputBinding[] {
  return [
    ...DEFAULT_KEYBOARD_BINDINGS,
    ...DEFAULT_POINTER_BINDINGS,
    ...DEFAULT_GAMEPAD_BINDINGS,
  ]
}

export function createDefaultKeyboardInputBindings(): RendererInputKeyboardBinding[] {
  return [...DEFAULT_KEYBOARD_BINDINGS]
}

export function createDefaultPointerInputBindings(): RendererInputPointerBinding[] {
  return [...DEFAULT_POINTER_BINDINGS]
}

export function createDefaultGamepadInputBindings(): RendererInputGamepadBinding[] {
  return [...DEFAULT_GAMEPAD_BINDINGS]
}

class RendererInputControllerImpl implements RendererInputController {
  private readonly win?: Window
  private readonly bindings: RendererInputBinding[]
  private readonly pressedKeys = new Set<string>()
  private readonly gamepadButtons = new Map<string, boolean>()
  private readonly disposers: Array<() => void> = []
  private dispatchQueue: Promise<void> = Promise.resolve()
  private gamepadTimer?: ReturnType<typeof setInterval>
  private lastPointerDispatch?: { target: EventTarget | null, button: number, time: number }
  private readonly lastWheelDispatch = new Map<RendererInputCommand, number>()
  private started = false
  private focused = true

  constructor(private readonly options: RendererInputControllerOptions) {
    this.win = options.window || resolveWindow(options.target) || resolveWindow(options.pointerTarget)
    this.bindings = [
      ...(options.includeDefaultBindings === false ? [] : createDefaultRendererInputBindings()),
      ...(options.bindings || []),
    ]
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.focused = this.options.focusTracking === false
      ? true
      : this.win?.document.hasFocus?.() ?? true
    if (this.options.keyboard !== false) {
      this.startKeyboard()
    }
    if (this.options.pointer !== false) {
      this.startPointer()
    }
    if (this.options.wheel !== false) {
      this.startWheel()
    }
    if (this.options.gamepad !== false) {
      this.startGamepad()
    }
    if (this.options.focusTracking !== false) {
      this.startFocusTracking()
    }
  }

  stop(): void {
    if (!this.started) {
      return
    }
    this.started = false
    while (this.disposers.length > 0) {
      this.disposers.pop()?.()
    }
    this.stopGamepadTimer()
    this.pressedKeys.clear()
    this.gamepadButtons.clear()
  }

  dispose(): void {
    this.stop()
  }

  async dispatchCommand(dispatch: RendererInputCommandDispatch): Promise<void> {
    if (!this.isEnabled()) {
      return
    }
    const task = this.dispatchQueue.then(() => this.dispatchCommandNow(dispatch))
    this.dispatchQueue = task.catch(() => {})
    return task
  }

  private dispatchCommandFromEvent(dispatch: RendererInputCommandDispatch): void {
    void this.dispatchCommand(dispatch).catch(() => {})
  }

  private async dispatchCommandNow(dispatch: RendererInputCommandDispatch): Promise<void> {
    const payload: RendererInputCommandPayload = {
      command: dispatch.command,
      device: dispatch.device,
      source: dispatch.source,
      repeat: dispatch.repeat,
      pressed: dispatch.pressed,
      timestamp: Date.now(),
      metadata: dispatch.metadata,
    }
    await this.options.actions.inputCommand(payload)
    await this.dispatchBuiltInIntent(dispatch.command, dispatch.source, dispatch.metadata)
  }

  private startKeyboard(): void {
    const target = this.options.keyboardTarget || this.win?.document || this.options.target
    if (!target || !('addEventListener' in target)) {
      return
    }
    const keydown = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        this.handleKeyboard(event, 'keydown')
      }
    }
    const keyup = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        this.handleKeyboard(event, 'keyup')
      }
    }
    target.addEventListener('keydown', keydown)
    target.addEventListener('keyup', keyup)
    this.disposers.push(() => {
      target.removeEventListener('keydown', keydown)
      target.removeEventListener('keyup', keyup)
    })
  }

  private startPointer(): void {
    const target = this.options.pointerTarget || resolvePointerTarget(this.options.target) || this.win?.document
    if (!target) {
      return
    }
    const click = (event: Event) => {
      if (event instanceof MouseEvent) {
        this.handlePointer(event)
      }
    }
    const pointerup = (event: Event) => {
      if (event instanceof PointerEvent || isMouseLikePointerEvent(event)) {
        this.handlePointer(event as PointerEvent | MouseEvent)
      }
    }
    target.addEventListener('click', click)
    if (typeof PointerEvent !== 'undefined') {
      target.addEventListener('pointerup', pointerup)
    }
    this.disposers.push(() => {
      target.removeEventListener('click', click)
      if (typeof PointerEvent !== 'undefined') {
        target.removeEventListener('pointerup', pointerup)
      }
    })
  }

  private startWheel(): void {
    const target = this.options.pointerTarget || resolvePointerTarget(this.options.target) || this.win?.document
    if (!target) {
      return
    }
    const wheel = (event: Event) => {
      if (typeof WheelEvent === 'undefined' || event instanceof WheelEvent) {
        this.handleWheel(event as WheelEvent)
      }
    }
    target.addEventListener('wheel', wheel)
    this.disposers.push(() => target.removeEventListener('wheel', wheel))
  }

  private startGamepad(): void {
    if (!this.win?.navigator || typeof this.win.navigator.getGamepads !== 'function') {
      return
    }
    this.gamepadTimer = setInterval(() => this.pollGamepads(), this.options.gamepadPollIntervalMs ?? DEFAULT_GAMEPAD_POLL_INTERVAL_MS)
  }

  private startFocusTracking(): void {
    if (!this.win) {
      return
    }
    const emitFocus = () => {
      void this.options.actions.windowFocus().catch(() => {})
    }
    const emitBlur = () => {
      void this.options.actions.windowBlur().catch(() => {})
    }
    const focus = () => {
      if (this.win?.document.visibilityState === 'hidden') {
        return
      }
      this.focused = true
      emitFocus()
    }
    const blur = () => {
      this.focused = false
      this.pressedKeys.clear()
      this.gamepadButtons.clear()
      emitBlur()
    }
    const visibilityChange = () => {
      if (this.win?.document.visibilityState === 'hidden') {
        blur()
        return
      }
      focus()
    }
    this.win.addEventListener('focus', focus)
    this.win.addEventListener('blur', blur)
    this.win.document.addEventListener('visibilitychange', visibilityChange)
    this.disposers.push(() => {
      this.win?.removeEventListener('focus', focus)
      this.win?.removeEventListener('blur', blur)
      this.win?.document.removeEventListener('visibilitychange', visibilityChange)
    })
  }

  private handleKeyboard(event: KeyboardEvent, eventType: RendererInputKeyboardEventType): void {
    if (!this.isEnabled() || isEditableInputTarget(event.target)) {
      return
    }
    const phase: RendererInputBindingPhase = eventType === 'keyup' ? 'release' : 'press'
    const code = event.code || event.key
    const wasPressed = this.pressedKeys.has(code)

    if (eventType === 'keydown') {
      this.pressedKeys.add(code)
    }
    else {
      this.pressedKeys.delete(code)
    }

    for (const binding of this.bindings) {
      if (binding.source !== 'keyboard' || binding.code !== code || (binding.phase || 'press') !== phase) {
        continue
      }
      const repeat = event.repeat || (eventType === 'keydown' && wasPressed)
      if (repeat && binding.repeat !== true) {
        continue
      }
      if (binding.preventDefault || this.options.preventDefault) {
        event.preventDefault()
      }
      this.dispatchCommandFromEvent({
        command: binding.command,
        device: 'keyboard',
        source: `keyboard:${code}`,
        repeat,
        pressed: eventType === 'keydown',
        metadata: {
          key: event.key,
          code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
      })
    }
  }

  private handlePointer(event: PointerEvent | MouseEvent): void {
    if (!this.isEnabled()) {
      return
    }
    if (event.type === 'click' && this.isDuplicatePointerClick(event)) {
      return
    }
    const target = isElement(event.target) ? event.target : undefined
    if (target?.closest('[data-qua-input-stage="false"]')) {
      return
    }
    const stage = target?.closest('.qua-stage')
    if (!stage) {
      return
    }
    if (this.options.pointerTarget && stage !== this.options.pointerTarget) {
      return
    }
    if (this.options.filterInteractiveTargets !== false && isInteractivePointerTarget(target)) {
      return
    }
    const dispatchSource = resolvePointerSource(target, stage)
    for (const binding of this.bindings) {
      if (binding.source !== 'pointer' || (binding.button ?? 0) !== event.button) {
        continue
      }
      if (binding.target && binding.target !== dispatchSource) {
        continue
      }
      if (binding.preventDefault || this.options.preventDefault) {
        event.preventDefault()
      }
      this.dispatchCommandFromEvent({
        command: binding.command,
        device: 'pointer',
        source: `pointer:${dispatchSource}`,
        pressed: false,
        metadata: this.createPointerMetadata(event, dispatchSource, stage),
      })
    }
    if (event.type === 'pointerup') {
      this.lastPointerDispatch = { target: event.target, button: event.button, time: Date.now() }
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (!this.isEnabled()) {
      return
    }
    const target = isElement(event.target) ? event.target : undefined
    if (target?.closest('[data-qua-input-stage="false"]')) {
      return
    }
    const stage = target?.closest('.qua-stage')
    if (!stage) {
      return
    }
    if (this.options.pointerTarget && stage !== this.options.pointerTarget) {
      return
    }
    if (this.options.filterInteractiveTargets !== false && isInteractivePointerTarget(target)) {
      return
    }
    const direction = resolveWheelDirection(event)
    for (const binding of this.bindings) {
      if (binding.source !== 'wheel' || (binding.direction && binding.direction !== direction)) {
        continue
      }
      if (this.isWheelThrottled(binding)) {
        continue
      }
      if (binding.preventDefault || this.options.preventDefault) {
        event.preventDefault()
      }
      this.lastWheelDispatch.set(binding.command, Date.now())
      this.dispatchCommandFromEvent({
        command: binding.command,
        device: 'wheel',
        source: `wheel:${direction}`,
        metadata: {
          direction,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
        },
      })
    }
  }

  private pollGamepads(): void {
    if (!this.isEnabled() || !this.focused || !this.win?.navigator.getGamepads) {
      return
    }
    const pads = Array.from(this.win.navigator.getGamepads()).filter(Boolean) as Gamepad[]
    const gamepadBindings = this.bindings.filter(binding => binding.source === 'gamepad')
    const buttonIndices = [...new Set(gamepadBindings.map(binding => binding.button))]
    for (const gamepad of pads) {
      for (const buttonIndex of buttonIndices) {
        const button = gamepad.buttons[buttonIndex]
        const pressed = Boolean(button?.pressed)
        const key = `${gamepad.index}:${buttonIndex}`
        const wasPressed = this.gamepadButtons.get(key) === true
        if (pressed === wasPressed) {
          continue
        }
        this.gamepadButtons.set(key, pressed)
        const phase: RendererInputBindingPhase = pressed ? 'press' : 'release'
        for (const binding of gamepadBindings) {
          if (binding.button !== buttonIndex) {
            continue
          }
          if ((binding.phase || 'press') !== phase) {
            continue
          }
          this.dispatchCommandFromEvent({
            command: binding.command,
            device: 'gamepad',
            source: `gamepad:${gamepad.index}:button:${buttonIndex}`,
            pressed,
            metadata: {
              gamepadIndex: gamepad.index,
              gamepadId: gamepad.id,
              button: buttonIndex,
              value: button?.value ?? 0,
            },
          })
        }
      }
    }
  }

  private createPointerMetadata(event: PointerEvent | MouseEvent, target?: string, stage?: Element): Record<string, unknown> {
    const pointerTarget = this.options.pointerTarget || stage || resolvePointerTarget(this.options.target)
    const container = resolvePointerLayoutContainer(pointerTarget) || (isElement(event.currentTarget) ? event.currentTarget : undefined)
    const metadata: Record<string, unknown> = {
      button: event.button,
      target,
    }
    if ('pointerType' in event && event.pointerType) {
      metadata.pointerType = event.pointerType
    }
    if (!container) {
      return metadata
    }
    const rect = readNonZeroRect(container)
    const layout = resolveStageLayout(this.options.getViewState().layout, readStageContainerSize(container, rect))
    const point = clientPointToStageLogical(layout, {
      clientX: event.clientX,
      clientY: event.clientY,
    }, {
      left: rect.left,
      top: rect.top,
    })
    metadata.x = point.x
    metadata.y = point.y
    metadata.insideViewport = point.insideViewport
    metadata.insideStage = point.insideStage
    return metadata
  }

  private async dispatchBuiltInIntent(
    command: RendererInputCommand,
    source: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    switch (command) {
      case 'advance':
        if (!viewAllowsDialogueChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.advance(source)
        break
      case 'auto:start':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.startAuto(source)
        break
      case 'auto:stop':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.stopAuto(source)
        break
      case 'auto:toggle':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        if (this.options.getViewState().flowControl.mode === 'auto') {
          await this.options.actions.stopAuto(source)
        }
        else {
          await this.options.actions.startAuto(source)
        }
        break
      case 'skip:start':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.startSkip(source)
        break
      case 'skip:stop':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.stopSkip(source)
        break
      case 'skip:toggle':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        if (this.options.getViewState().flowControl.mode === 'skip') {
          await this.options.actions.stopSkip(source)
        }
        else {
          await this.options.actions.startSkip(source)
        }
        break
      case 'fastForward:start':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.startFastForward(source)
        break
      case 'fastForward:stop':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        await this.options.actions.stopFastForward(source)
        break
      case 'fastForward:toggle':
        if (!viewAllowsHudChrome(this.options.getViewState())) {
          return
        }
        if (this.options.getViewState().flowControl.mode === 'fast-forward') {
          await this.options.actions.stopFastForward(source)
        }
        else {
          await this.options.actions.startFastForward(source)
        }
        break
      case 'choice:confirm':
        if (!viewAllowsDialogueChrome(this.options.getViewState())) {
          return
        }
        await this.selectFocusedChoice(source)
        break
      case 'ui:save':
        await this.options.actions.requestSave(typeof metadata?.slotId === 'string' ? metadata.slotId : undefined)
        break
      case 'ui:load':
        await this.options.actions.requestLoad(typeof metadata?.slotId === 'string' ? metadata.slotId : undefined)
        break
      case 'choice:previous':
        if (!viewAllowsDialogueChrome(this.options.getViewState())) {
          return
        }
        this.focusChoice(-1)
        break
      case 'choice:next':
        if (!viewAllowsDialogueChrome(this.options.getViewState())) {
          return
        }
        this.focusChoice(1)
        break
      case 'ui:cancel':
      case 'ui:menu':
        break
    }
  }

  private async selectFocusedChoice(source: string): Promise<void> {
    const focusedChoiceId = this.getFocusedChoiceId()
    if (focusedChoiceId && this.options.getViewState().choices.some(choice => choice.id === focusedChoiceId && choice.enabled)) {
      await this.options.actions.selectChoice(focusedChoiceId)
      return
    }
    const choice = this.options.getViewState().choices.find(item => item.enabled)
    if (choice) {
      await this.options.actions.selectChoice(choice.id)
    }
    else {
      await this.options.actions.advance(source)
    }
  }

  private stopGamepadTimer(): void {
    if (this.gamepadTimer !== undefined) {
      clearInterval(this.gamepadTimer)
      this.gamepadTimer = undefined
    }
  }

  private isEnabled(): boolean {
    return this.started && (this.options.enabled?.() ?? true)
  }

  private isDuplicatePointerClick(event: MouseEvent): boolean {
    if (!this.lastPointerDispatch) {
      return false
    }
    return this.lastPointerDispatch.target === event.target
      && this.lastPointerDispatch.button === event.button
      && Date.now() - this.lastPointerDispatch.time < 250
  }

  private isWheelThrottled(binding: RendererInputWheelBinding): boolean {
    const throttleMs = binding.throttleMs ?? 200
    const last = this.lastWheelDispatch.get(binding.command) || 0
    return Date.now() - last < throttleMs
  }

  private focusChoice(direction: -1 | 1): void {
    const buttons = this.getChoiceButtons()
    if (buttons.length === 0) {
      return
    }
    const active = this.win?.document.activeElement
    const currentIndex = buttons.findIndex(button => button === active)
    const nextIndex = currentIndex >= 0
      ? (currentIndex + direction + buttons.length) % buttons.length
      : direction > 0 ? 0 : buttons.length - 1
    buttons[nextIndex]?.focus()
  }

  private getFocusedChoiceId(): string | undefined {
    const active = this.win?.document.activeElement
    if (!isElement(active) || !active.matches('.qua-choice-button[data-choice-id]')) {
      return undefined
    }
    return active.getAttribute('data-choice-id') || undefined
  }

  private getChoiceButtons(): HTMLElement[] {
    const doc = this.win?.document
    if (!doc) {
      return []
    }
    return Array.from(doc.querySelectorAll('.qua-choice-button[data-choice-id]'))
      .filter((button): button is HTMLElement => button instanceof HTMLElement && !isDisabledButton(button))
  }
}

function readStageContainerSize(container: Element, rect: DOMRect): StageContainerSize {
  return {
    width: rect.width,
    height: rect.height,
    devicePixelRatio: readDevicePixelRatio(container),
    safeAreaInsets: readCssSafeAreaInsets(container),
  }
}

function resolveWindow(target?: Element | Document | Window): Window | undefined {
  if (!target) {
    return typeof window === 'undefined' ? undefined : window
  }
  if (isWindow(target)) {
    return target
  }
  if (isDocument(target)) {
    return target.defaultView || undefined
  }
  return isElement(target) ? target.ownerDocument?.defaultView || undefined : undefined
}

function resolvePointerTarget(target?: Element | Document | Window): Element | undefined {
  if (!target) {
    return undefined
  }
  return isElement(target) ? target : undefined
}

function isWindow(target: unknown): target is Window {
  return Boolean(target && typeof target === 'object' && 'window' in target && (target as Window).window === target)
}

function isDocument(target: unknown): target is Document {
  return Boolean(target && typeof target === 'object' && 'nodeType' in target && (target as Node).nodeType === 9)
}

function isElement(target: unknown): target is Element {
  return Boolean(target && typeof target === 'object' && 'nodeType' in target && (target as Node).nodeType === 1)
}

function isMouseLikePointerEvent(event: Event): event is MouseEvent {
  return event instanceof MouseEvent
}

function isEditableInputTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

function isInteractivePointerTarget(target: Element | undefined): boolean {
  return Boolean(target?.closest(DEFAULT_INTERACTIVE_SELECTOR))
}

function resolvePointerLayoutContainer(target: Element | undefined): Element | undefined {
  if (!target) {
    return undefined
  }
  return target.closest('.qua-renderer') || target.closest('.qua-stage-frame') || target
}

function readNonZeroRect(element: Element): DOMRect {
  let current: Element | null = element
  let rect = current.getBoundingClientRect()
  while ((rect.width <= 0 || rect.height <= 0) && current.parentElement) {
    current = current.parentElement
    rect = current.getBoundingClientRect()
  }
  return rect
}

function resolvePointerSource(target: Element | undefined, stage: Element): string {
  if (target?.closest('.qua-dialogue-box')) {
    return 'dialogue'
  }
  if (target === stage || target) {
    return 'stage'
  }
  return 'stage'
}

function resolveWheelDirection(event: WheelEvent): RendererInputWheelDirection {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return event.deltaX < 0 ? 'left' : 'right'
  }
  return event.deltaY < 0 ? 'up' : 'down'
}

function isDisabledButton(element: HTMLElement): boolean {
  return 'disabled' in element && Boolean((element as HTMLButtonElement).disabled)
}
