import type { NativeRendererIntent, QuaNativeHostApi } from '@quajs/native-contracts'
import type { RendererInputCommandPayload, RendererTextInputPayload } from '@quajs/engine'
import { emitRenderToLogic, RenderToLogicEvents } from '@quajs/engine'
import { parseNativeRendererIntentPayload } from '@quajs/native-contracts'

type NativeRendererIntentPipeline = Parameters<typeof emitRenderToLogic>[0]
const RENDER_TO_LOGIC_UI_INTENT = 'ui/intent'
const INPUT_COMMANDS = new Set([
  'advance',
  'auto:start',
  'auto:stop',
  'auto:toggle',
  'skip:start',
  'skip:stop',
  'skip:toggle',
  'fastForward:start',
  'fastForward:stop',
  'fastForward:toggle',
  'choice:previous',
  'choice:next',
  'choice:confirm',
  'ui:cancel',
  'ui:menu',
  'ui:save',
  'ui:load',
])
const INPUT_DEVICES = new Set(['keyboard', 'pointer', 'wheel', 'gamepad'])
const TEXT_INPUT_PHASES = new Set(['enabled', 'disabled', 'preedit', 'commit'])

export interface NativeRendererIntentEmittedEvent {
  type: RenderToLogicEvents | typeof RENDER_TO_LOGIC_UI_INTENT
  payload: unknown
}

export interface NativeRendererIntentDispatchResult {
  handled: boolean
  emittedEvents: readonly NativeRendererIntentEmittedEvent[]
  ignoredReason?: 'unknown-intent-type'
}

export interface NativeRendererIntentBridgeOptions {
  onError?: (error: unknown, event: NativeRendererIntent) => void
}

export type NativeRendererIntentBridgeDisposer = () => void

export async function emitNativeRendererIntentToPipeline(
  pipeline: NativeRendererIntentPipeline,
  event: NativeRendererIntent,
): Promise<NativeRendererIntentDispatchResult> {
  switch (event.type) {
    case 'choice/select':
      return await emitNativeChoiceSelectIntent(pipeline, event)
    case 'ui/intent':
      return await emitNativeUiIntent(pipeline, event)
    case RenderToLogicEvents.USER_INPUT_COMMAND:
      return await emitNativeInputCommandIntent(pipeline, event)
    case RenderToLogicEvents.USER_TEXT_INPUT:
      return await emitNativeTextInputIntent(pipeline, event)
    case RenderToLogicEvents.WINDOW_FOCUS:
      return await emitNativeWindowLifecycleIntent(pipeline, RenderToLogicEvents.WINDOW_FOCUS)
    case RenderToLogicEvents.WINDOW_BLUR:
      return await emitNativeWindowLifecycleIntent(pipeline, RenderToLogicEvents.WINDOW_BLUR)
    default:
      return {
        handled: false,
        emittedEvents: [],
        ignoredReason: 'unknown-intent-type',
      }
  }
}

export function installNativeRendererIntentBridge(
  host: QuaNativeHostApi,
  pipeline: NativeRendererIntentPipeline,
  options: NativeRendererIntentBridgeOptions = {},
): NativeRendererIntentBridgeDisposer {
  const previousEmitRendererIntent = host.emitRendererIntent

  const emitRendererIntent = (event: NativeRendererIntent): void => {
    void emitNativeRendererIntentToPipeline(pipeline, event)
      .then((result) => {
        if (!result.handled) {
          options.onError?.(
            new Error(`Native renderer intent "${event.type}" was not handled by the native engine bridge.`),
            event,
          )
        }
      })
      .catch(error => options.onError?.(error, event))
    try {
      previousEmitRendererIntent?.(event)
    }
    catch (error) {
      options.onError?.(error, event)
    }
  }

  host.emitRendererIntent = emitRendererIntent

  return () => {
    if (host.emitRendererIntent === emitRendererIntent) {
      host.emitRendererIntent = previousEmitRendererIntent
    }
  }
}

async function emitNativeChoiceSelectIntent(
  pipeline: NativeRendererIntentPipeline,
  event: NativeRendererIntent,
): Promise<NativeRendererIntentDispatchResult> {
  const payload = parseNativeRendererIntentPayloadRecord(event)
  const choiceId = stringField(payload, 'choiceId')
  if (!choiceId) {
    throw new Error('Native renderer choice/select intent requires string payload field "choiceId".')
  }

  const emittedEvents = [
    {
      type: RenderToLogicEvents.USER_CHOICE_SELECT,
      payload: { choiceId },
    },
  ]
  await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_CHOICE_SELECT, { choiceId })
  return { handled: true, emittedEvents }
}

async function emitNativeUiIntent(
  pipeline: NativeRendererIntentPipeline,
  event: NativeRendererIntent,
): Promise<NativeRendererIntentDispatchResult> {
  const payload = parseNativeRendererIntentPayloadRecord(event)
  const {
    action,
    elementId,
    payload: uiIntentPayload,
  } = normalizeUiIntentPayload(payload)
  const emittedEvents: NativeRendererIntentEmittedEvent[] = [
    {
      type: RENDER_TO_LOGIC_UI_INTENT,
      payload: uiIntentPayload,
    },
  ]

  await pipeline.emit(RENDER_TO_LOGIC_UI_INTENT, uiIntentPayload)

  if (!action || !elementId) {
    return { handled: true, emittedEvents }
  }

  if (action === 'open') {
    const config = recordField(payload, 'config')
    const shortcutPayload = config ? { elementId, config } : { elementId }
    emittedEvents.push({
      type: RenderToLogicEvents.UI_REQUEST_OPEN,
      payload: shortcutPayload,
    })
    await emitRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_OPEN, shortcutPayload)
  }
  else if (action === 'close') {
    const shortcutPayload = { elementId }
    emittedEvents.push({
      type: RenderToLogicEvents.UI_REQUEST_CLOSE,
      payload: shortcutPayload,
    })
    await emitRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_CLOSE, shortcutPayload)
  }
  else if (action === 'update') {
    const shortcutPayload = { elementId, config: recordField(payload, 'config') || {} }
    emittedEvents.push({
      type: RenderToLogicEvents.UI_REQUEST_UPDATE,
      payload: shortcutPayload,
    })
    await emitRenderToLogic(pipeline, RenderToLogicEvents.UI_REQUEST_UPDATE, shortcutPayload)
  }

  return { handled: true, emittedEvents }
}

async function emitNativeInputCommandIntent(
  pipeline: NativeRendererIntentPipeline,
  event: NativeRendererIntent,
): Promise<NativeRendererIntentDispatchResult> {
  const payload = parseNativeRendererIntentPayloadRecord(event)
  const inputCommandPayload = normalizeInputCommandPayload(payload)
  const emittedEvents = [
    {
      type: RenderToLogicEvents.USER_INPUT_COMMAND,
      payload: inputCommandPayload,
    },
  ]
  await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_INPUT_COMMAND, inputCommandPayload)
  return { handled: true, emittedEvents }
}

async function emitNativeTextInputIntent(
  pipeline: NativeRendererIntentPipeline,
  event: NativeRendererIntent,
): Promise<NativeRendererIntentDispatchResult> {
  const payload = parseNativeRendererIntentPayloadRecord(event)
  const textInputPayload = normalizeTextInputPayload(payload)
  const emittedEvents = [
    {
      type: RenderToLogicEvents.USER_TEXT_INPUT,
      payload: textInputPayload,
    },
  ]
  await emitRenderToLogic(pipeline, RenderToLogicEvents.USER_TEXT_INPUT, textInputPayload)
  return { handled: true, emittedEvents }
}

async function emitNativeWindowLifecycleIntent(
  pipeline: NativeRendererIntentPipeline,
  type: RenderToLogicEvents.WINDOW_FOCUS | RenderToLogicEvents.WINDOW_BLUR,
): Promise<NativeRendererIntentDispatchResult> {
  const payload = {}
  const emittedEvents = [{ type, payload }]
  await emitRenderToLogic(pipeline, type, payload)
  return { handled: true, emittedEvents }
}

function parseNativeRendererIntentPayloadRecord(event: NativeRendererIntent): Record<string, unknown> {
  const payload = parseNativeRendererIntentPayload(event)
  if (payload === undefined)
    return {}
  if (!isRecord(payload)) {
    throw new Error(`Native renderer intent "${event.type}" payloadJson must decode to an object.`)
  }
  return payload
}

function normalizeUiIntentPayload(payload: Record<string, unknown>): {
  action?: string
  elementId?: string
  payload: Record<string, unknown>
} {
  const normalized: Record<string, unknown> = { ...payload }
  const action = optionalUiIntentStringField(payload, 'action')
  const elementId = optionalUiIntentStringField(payload, 'elementId')

  if (action !== undefined)
    normalized.action = action
  else
    delete normalized.action

  if (elementId !== undefined)
    normalized.elementId = elementId
  else
    delete normalized.elementId

  return {
    action,
    elementId,
    payload: normalized,
  }
}

function normalizeInputCommandPayload(payload: Record<string, unknown>): RendererInputCommandPayload {
  const command = stringField(payload, 'command')
  if (!command || !INPUT_COMMANDS.has(command)) {
    throw new Error('Native renderer user/input_command intent requires supported string payload field "command".')
  }

  const device = stringField(payload, 'device')
  if (!device || !INPUT_DEVICES.has(device)) {
    throw new Error('Native renderer user/input_command intent requires supported string payload field "device".')
  }

  const source = stringField(payload, 'source')
  if (!source) {
    throw new Error('Native renderer user/input_command intent requires string payload field "source".')
  }

  const timestamp = finiteNumberField(payload, 'timestamp')
  if (timestamp === undefined) {
    throw new Error('Native renderer user/input_command intent requires finite number payload field "timestamp".')
  }

  const repeat = optionalBooleanField(payload, 'repeat')
  const pressed = optionalBooleanField(payload, 'pressed')
  const metadata = optionalRecordField(payload, 'metadata', 'user/input_command')
  const normalized: RendererInputCommandPayload = {
    command: command as RendererInputCommandPayload['command'],
    device: device as RendererInputCommandPayload['device'],
    source,
    timestamp,
  }
  if (repeat !== undefined)
    normalized.repeat = repeat
  if (pressed !== undefined)
    normalized.pressed = pressed
  if (metadata !== undefined)
    normalized.metadata = metadata
  return normalized
}

function normalizeTextInputPayload(payload: Record<string, unknown>): RendererTextInputPayload {
  const phase = stringField(payload, 'phase')
  if (!phase || !TEXT_INPUT_PHASES.has(phase)) {
    throw new Error('Native renderer user/text_input intent requires supported string payload field "phase".')
  }

  const source = stringField(payload, 'source')
  if (!source) {
    throw new Error('Native renderer user/text_input intent requires string payload field "source".')
  }

  const timestamp = finiteNumberField(payload, 'timestamp')
  if (timestamp === undefined) {
    throw new Error('Native renderer user/text_input intent requires finite number payload field "timestamp".')
  }

  const text = optionalStringField(payload, 'text')
  const cursorStart = optionalFiniteNumberField(payload, 'cursorStart')
  const cursorEnd = optionalFiniteNumberField(payload, 'cursorEnd')
  const metadata = optionalRecordField(payload, 'metadata', 'user/text_input')
  const normalized: RendererTextInputPayload = {
    phase: phase as RendererTextInputPayload['phase'],
    source,
    timestamp,
  }
  if (text !== undefined)
    normalized.text = text
  if (cursorStart !== undefined)
    normalized.cursorStart = cursorStart
  if (cursorEnd !== undefined)
    normalized.cursorEnd = cursorEnd
  if (metadata !== undefined)
    normalized.metadata = metadata
  return normalized
}

function stringField(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalStringField(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string') {
    throw new Error(`Native renderer user/text_input intent payload field "${field}" must be a string when provided.`)
  }
  return value
}

function optionalUiIntentStringField(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Native renderer ui/intent payload field "${field}" must be a non-empty string when provided.`)
  }
  return value
}

function finiteNumberField(payload: Record<string, unknown>, field: string): number | undefined {
  const value = payload[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalFiniteNumberField(payload: Record<string, unknown>, field: string): number | undefined {
  const value = payload[field]
  if (value === undefined)
    return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Native renderer user/text_input intent payload field "${field}" must be a finite number when provided.`)
  }
  return value
}

function optionalBooleanField(payload: Record<string, unknown>, field: string): boolean | undefined {
  const value = payload[field]
  if (value === undefined)
    return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Native renderer user/input_command intent payload field "${field}" must be a boolean when provided.`)
  }
  return value
}

function optionalRecordField(
  payload: Record<string, unknown>,
  field: string,
  intentType: 'user/input_command' | 'user/text_input',
): Record<string, unknown> | undefined {
  const value = payload[field]
  if (value === undefined)
    return undefined
  if (!isRecord(value)) {
    throw new Error(`Native renderer ${intentType} intent payload field "${field}" must be an object when provided.`)
  }
  return value
}

function recordField(payload: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
  const value = payload[field]
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
