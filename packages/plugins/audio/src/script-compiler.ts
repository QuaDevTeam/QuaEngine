import * as t from '@babel/types'

export const audioDecoratorMappings = {
  AudioChapter: {
    function: 'configureAudioChapterWithEngine',
    module: '@quajs/plugin-audio',
  },
  LineId: {
    function: 'lineIdDirective',
    module: '@quajs/plugin-audio',
  },
  PlayVoice: {
    function: 'playVoiceWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlayBGM: {
    function: 'playBGMWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlaySFX: {
    function: 'playSFXWithEngine',
    module: '@quajs/plugin-audio',
  },
  PlayAmbient: {
    function: 'playAmbientWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioGain: {
    function: 'setAudioGainWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioEq: {
    function: 'setAudioEqWithEngine',
    module: '@quajs/plugin-audio',
  },
  SetAudioAutomation: {
    function: 'setAudioAutomationWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopAudio: {
    function: 'stopAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  PauseAudio: {
    function: 'pauseAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  ResumeAudio: {
    function: 'resumeAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  SeekAudio: {
    function: 'seekAudioWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopVoice: {
    function: 'stopVoiceWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopBGM: {
    function: 'stopBGMWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopSFX: {
    function: 'stopSFXWithEngine',
    module: '@quajs/plugin-audio',
  },
  StopAmbient: {
    function: 'stopAmbientWithEngine',
    module: '@quajs/plugin-audio',
  },
} as const

export function createAudioDecoratorCompiler() {
  return {
    module: '@quajs/plugin-audio',
    runtimeHelperModules: {
      configureAudioChapterWithEngine: '@quajs/plugin-audio',
      playVoiceWithEngine: '@quajs/plugin-audio',
      playBGMWithEngine: '@quajs/plugin-audio',
      playSFXWithEngine: '@quajs/plugin-audio',
      playAmbientWithEngine: '@quajs/plugin-audio',
      setAudioGainWithEngine: '@quajs/plugin-audio',
      setAudioEqWithEngine: '@quajs/plugin-audio',
      setAudioAutomationWithEngine: '@quajs/plugin-audio',
      stopAudioWithEngine: '@quajs/plugin-audio',
      pauseAudioWithEngine: '@quajs/plugin-audio',
      resumeAudioWithEngine: '@quajs/plugin-audio',
      seekAudioWithEngine: '@quajs/plugin-audio',
      stopVoiceWithEngine: '@quajs/plugin-audio',
      stopBGMWithEngine: '@quajs/plugin-audio',
      stopSFXWithEngine: '@quajs/plugin-audio',
      stopAmbientWithEngine: '@quajs/plugin-audio',
    },
    supports(_decoratorName: string, mapping: { function: string, module: string }) {
      return mapping.module === '@quajs/plugin-audio'
    },
    compile(input: {
      decorator: { name: string, args: unknown[] }
      decorators: { name: string, args: unknown[] }[]
      index: number
      context: {
        characterName?: string
        stepType: 'dialogue' | 'action'
        stepIndex: number
        stepUuid: string
        state: Record<string, unknown>
      }
      mapping: { function: string }
    }) {
      const state = ensureAudioCompileState(input.context.state)
      prepareStepState(state, input.context.stepIndex)

      switch (input.decorator.name) {
        case 'AudioChapter':
          return compileAudioChapter(input, state)
        case 'LineId':
          state.lineIdOverride = requireStringArg(input.decorator, input.decorator.args[0], 'line id')
          return { skip: true }
        case 'PlayVoice':
          return compilePlayVoice(input, state)
        case 'PlayBGM':
          return compilePlayBgm(input, state)
        case 'PlaySFX':
          return compilePlaySfx(input, state)
        case 'PlayAmbient':
          return compilePlayAmbient(input, state)
        case 'SetAudioGain':
          return compileSetGain(input)
        case 'SetAudioEq':
          return compileSetEq(input)
        case 'SetAudioAutomation':
          return compileSetAutomation(input)
        case 'StopAudio':
          return compileStopAudio(input)
        case 'PauseAudio':
          return compilePauseResume('pauseAudioWithEngine', input)
        case 'ResumeAudio':
          return compilePauseResume('resumeAudioWithEngine', input)
        case 'SeekAudio':
          return compileSeek(input)
        case 'StopVoice':
          return compileStopAlias('stopVoiceWithEngine', input, 'voice')
        case 'StopBGM':
          return compileStopAlias('stopBGMWithEngine', input, 'bgm')
        case 'StopSFX':
          return compileStopAlias('stopSFXWithEngine', input, 'sfx')
        case 'StopAmbient':
          return compileStopAlias('stopAmbientWithEngine', input, 'ambient')
        default:
          return null
      }
    },
    compileImplicit(input: {
      decorators: { name: string, args: unknown[] }[]
      context: {
        characterName?: string
        stepType: 'dialogue' | 'action'
        stepIndex: number
        stepUuid: string
        state: Record<string, unknown>
      }
    }) {
      const state = ensureAudioCompileState(input.context.state)
      prepareStepState(state, input.context.stepIndex)

      if (input.context.stepType !== 'dialogue') {
        return []
      }

      const hasExplicitVoice = state.explicitVoiceStepIndex === input.context.stepIndex
      if (hasExplicitVoice) {
        return []
      }

      const chapter = state.currentChapter
      if (!chapter) {
        return []
      }

      const lineId = resolveLineId(state, input.context)
      const assetKey = chapter.voiceMap?.[lineId]
      if (!assetKey) {
        throw new Error(`Missing voiceMap entry for line "${lineId}" in @AudioChapter("${chapter.chapterId}").`)
      }

      const call = createPlayVoiceCall({
        assetKey,
        options: undefined,
        context: input.context,
        lineId,
        chapterId: chapter.chapterId,
      })
      state.currentLineId = lineId
      return [{
        call,
        runtimeHelpers: ['playVoiceWithEngine'],
      }]
    },
  }
}

export const scriptCompiler = {
  compilers: [createAudioDecoratorCompiler()],
} as const

export const decorators = audioDecoratorMappings

function ensureAudioCompileState(state: Record<string, unknown>): AudioCompileState {
  const existing = state.__quajsAudioCompileState as AudioCompileState | undefined
  if (existing) {
    return existing
  }
  const created: AudioCompileState = {
    currentChapter: undefined,
    currentLineId: undefined,
    lineIdOverride: undefined,
    stepIndex: -1,
    dialogueSequence: 0,
    explicitVoiceStepIndex: undefined,
  }
  state.__quajsAudioCompileState = created
  return created
}

function prepareStepState(state: AudioCompileState, stepIndex: number): void {
  if (state.stepIndex === stepIndex) {
    return
  }
  state.stepIndex = stepIndex
  state.currentLineId = undefined
  state.lineIdOverride = undefined
  state.explicitVoiceStepIndex = undefined
}

function applyChapterDirective(state: AudioCompileState, input: {
  decorator: { name: string, args: unknown[] }
}) {
  const chapterId = requireStringArg(input.decorator, input.decorator.args[0], 'chapter id')
  const options = input.decorator.args[1]
  const next = isPlainObject(options) ? options : undefined
  state.currentChapter = {
    chapterId,
    voiceMap: isPlainObject(next?.voiceMap) ? normalizeRecord(next!.voiceMap) : undefined,
    bgm: typeof next?.bgm === 'string' ? next.bgm : undefined,
    defaults: isPlainObject(next?.defaults) ? next.defaults as any : undefined,
    metadata: isPlainObject(next?.metadata) ? next.metadata as any : undefined,
  }
  state.dialogueSequence = 0
  state.currentLineId = undefined
  state.lineIdOverride = undefined
}

function compilePlayVoice(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}, state: AudioCompileState) {
  const chapter = state.currentChapter
  const assetArg = input.decorator.args[0]
  const optionsArg = input.decorator.args[1]
  const lineId = resolveLineId(state, input.context)
  const assetKey = typeof assetArg === 'string'
    ? assetArg
    : chapter?.voiceMap?.[lineId]

  if (!assetKey) {
    throw new Error(`@PlayVoice requires an asset key or a voiceMap entry for line "${lineId}".`)
  }

  state.currentLineId = lineId
  state.explicitVoiceStepIndex = input.context.stepIndex
  return {
    call: createPlayVoiceCall({
      assetKey,
      options: optionsArg,
      context: input.context,
      lineId,
      chapterId: chapter?.chapterId,
    }),
    runtimeHelpers: ['playVoiceWithEngine'],
  }
}

function compilePlayBgm(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}, state: AudioCompileState) {
  const assetKey = requireStringArg(input.decorator, input.decorator.args[0], 'asset key')
  const options = input.decorator.args[1]
  return {
    call: t.callExpression(t.identifier('playBGMWithEngine'), [
      engineArg(),
      t.stringLiteral(assetKey),
      audioOptionsExpression(options, state.currentChapter?.chapterId),
    ]),
    runtimeHelpers: ['playBGMWithEngine'],
  }
}

function compilePlaySfx(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}, state: AudioCompileState) {
  const assetKey = requireStringArg(input.decorator, input.decorator.args[0], 'asset key')
  const options = input.decorator.args[1]
  return {
    call: t.callExpression(t.identifier('playSFXWithEngine'), [
      engineArg(),
      t.stringLiteral(assetKey),
      audioOptionsExpression(options, state.currentChapter?.chapterId),
    ]),
    runtimeHelpers: ['playSFXWithEngine'],
  }
}

function compilePlayAmbient(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}, state: AudioCompileState) {
  const assetKey = requireStringArg(input.decorator, input.decorator.args[0], 'asset key')
  const options = input.decorator.args[1]
  return {
    call: t.callExpression(t.identifier('playAmbientWithEngine'), [
      engineArg(),
      t.stringLiteral(assetKey),
      audioOptionsExpression(options, state.currentChapter?.chapterId),
    ]),
    runtimeHelpers: ['playAmbientWithEngine'],
  }
}

function compileAudioChapter(
  input: {
    decorator: { name: string, args: unknown[] }
    context: {
      characterName?: string
      stepType: 'dialogue' | 'action'
      stepIndex: number
      stepUuid: string
      state: Record<string, unknown>
    }
  },
  state: AudioCompileState,
) {
  const chapterId = requireStringArg(input.decorator, input.decorator.args[0], 'chapter id')
  const options = input.decorator.args[1]
  applyChapterDirective(state, input)
  return {
    call: t.callExpression(t.identifier('configureAudioChapterWithEngine'), [
      engineArg(),
      t.stringLiteral(chapterId),
      audioChapterOptionsExpression(options),
    ]),
    runtimeHelpers: ['configureAudioChapterWithEngine'],
  }
}

function compileSetGain(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = requireStringArg(input.decorator, input.decorator.args[0], 'audio target')
  const value = input.decorator.args[1]
  const options = input.decorator.args[2]
  const call = t.callExpression(t.identifier('setAudioGainWithEngine'), [
    engineArg(),
    t.stringLiteral(target),
    toExpression(value),
    audioOptionsExpression(options),
  ])
  return {
    call,
    runtimeHelpers: ['setAudioGainWithEngine'],
  }
}

function compileSetEq(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = requireStringArg(input.decorator, input.decorator.args[0], 'audio target')
  const bands = input.decorator.args[1]
  const options = input.decorator.args[2]
  return {
    call: t.callExpression(t.identifier('setAudioEqWithEngine'), [
      engineArg(),
      t.stringLiteral(target),
      toExpression(bands),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: ['setAudioEqWithEngine'],
  }
}

function compileSetAutomation(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = requireStringArg(input.decorator, input.decorator.args[0], 'audio target')
  const propertyPath = requireStringArg(input.decorator, input.decorator.args[1], 'property path')
  const curve = input.decorator.args[2]
  const options = input.decorator.args[3]
  return {
    call: t.callExpression(t.identifier('setAudioAutomationWithEngine'), [
      engineArg(),
      t.stringLiteral(target),
      t.stringLiteral(propertyPath),
      toExpression(curve),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: ['setAudioAutomationWithEngine'],
  }
}

function compileStopAudio(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = input.decorator.args[0]
  const options = input.decorator.args[1]
  return {
    call: t.callExpression(t.identifier('stopAudioWithEngine'), [
      engineArg(),
      target === undefined ? t.identifier('undefined') : t.stringLiteral(String(target)),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: ['stopAudioWithEngine'],
  }
}

function compilePauseResume(helper: 'pauseAudioWithEngine' | 'resumeAudioWithEngine', input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = input.decorator.args[0]
  const options = input.decorator.args[1]
  return {
    call: t.callExpression(t.identifier(helper), [
      engineArg(),
      target === undefined ? t.identifier('undefined') : t.stringLiteral(String(target)),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: [helper],
  }
}

function compileSeek(input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}) {
  const target = input.decorator.args[0]
  const positionMs = input.decorator.args[1]
  const options = input.decorator.args[2]
  return {
    call: t.callExpression(t.identifier('seekAudioWithEngine'), [
      engineArg(),
      target === undefined ? t.identifier('undefined') : t.stringLiteral(String(target)),
      toExpression(positionMs),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: ['seekAudioWithEngine'],
  }
}

function compileStopAlias(helper: 'stopVoiceWithEngine' | 'stopBGMWithEngine' | 'stopSFXWithEngine' | 'stopAmbientWithEngine', input: {
  decorator: { name: string, args: unknown[] }
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
}, target: 'voice' | 'bgm' | 'sfx' | 'ambient') {
  const options = input.decorator.args[0]
  return {
    call: t.callExpression(t.identifier(helper), [
      engineArg(),
      t.stringLiteral(target),
      audioOptionsExpression(options),
    ]),
    runtimeHelpers: [helper],
  }
}

function createPlayVoiceCall(input: {
  assetKey: string
  options: unknown
  context: {
    characterName?: string
    stepType: 'dialogue' | 'action'
    stepIndex: number
    stepUuid: string
    state: Record<string, unknown>
  }
  lineId: string
  chapterId?: string
}) {
  return t.callExpression(t.identifier('playVoiceWithEngine'), [
    engineArg(),
    t.stringLiteral(input.assetKey),
    audioPlayVoiceOptionsExpression(input.options, {
      lineId: input.lineId,
      chapterId: input.chapterId,
      characterId: input.context.characterName,
    }),
  ])
}

function audioPlayVoiceOptionsExpression(
  options: unknown,
  context: { lineId: string, chapterId?: string, characterId?: string },
): t.Expression {
  const properties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('lineId'), t.stringLiteral(context.lineId)),
  ]
  if (context.chapterId) {
    properties.push(t.objectProperty(t.identifier('chapterId'), t.stringLiteral(context.chapterId)))
  }
  if (context.characterId) {
    properties.push(t.objectProperty(t.identifier('characterId'), t.stringLiteral(context.characterId)))
  }
  if (isPlainObject(options)) {
    return t.objectExpression([
      ...objectPropertiesFromRecord(options as Record<string, unknown>),
      ...properties,
    ])
  }
  if (options !== undefined) {
    properties.unshift(t.objectProperty(t.identifier('metadata'), toExpression(options)))
  }
  return t.objectExpression(properties)
}

function audioOptionsExpression(options: unknown, chapterId?: string): t.Expression {
  const properties: t.ObjectProperty[] = []
  if (chapterId) {
    properties.push(t.objectProperty(t.identifier('chapterId'), t.stringLiteral(chapterId)))
  }
  if (isPlainObject(options)) {
    properties.push(...objectPropertiesFromRecord(options as Record<string, unknown>))
  }
  else if (options !== undefined) {
    properties.push(t.objectProperty(t.identifier('metadata'), toExpression(options)))
  }
  return t.objectExpression(properties)
}

function audioChapterOptionsExpression(options: unknown): t.Expression {
  if (!isPlainObject(options)) {
    return options === undefined ? t.objectExpression([]) : toExpression(options)
  }

  const properties: t.ObjectProperty[] = []
  if (options.voiceMap !== undefined) {
    properties.push(t.objectProperty(t.identifier('voiceMap'), toExpression(options.voiceMap)))
  }
  if (options.bgm !== undefined) {
    properties.push(t.objectProperty(t.identifier('bgm'), toExpression(options.bgm)))
  }
  if (options.defaults !== undefined) {
    properties.push(t.objectProperty(t.identifier('defaults'), toExpression(options.defaults)))
  }
  if (options.metadata !== undefined) {
    properties.push(t.objectProperty(t.identifier('metadata'), toExpression(options.metadata)))
  }
  return t.objectExpression(properties)
}

function objectPropertiesFromRecord(record: Record<string, unknown>): t.ObjectProperty[] {
  return Object.entries(record).map(([key, value]) => t.objectProperty(t.identifier(key), toExpression(value)))
}

function toExpression(value: unknown): t.Expression {
  if (isBabelExpression(value)) {
    return value
  }
  if (typeof value === 'string') {
    return t.stringLiteral(value)
  }
  if (typeof value === 'number') {
    return t.numericLiteral(value)
  }
  if (typeof value === 'boolean') {
    return t.booleanLiteral(value)
  }
  if (value === null) {
    return t.nullLiteral()
  }
  if (Array.isArray(value)) {
    return t.arrayExpression(value.map(item => toExpression(item)))
  }
  if (isPlainObject(value)) {
    return t.objectExpression(objectPropertiesFromRecord(value))
  }
  return t.identifier('undefined')
}

function requireStringArg(decorator: { name: string }, arg: unknown, label: string): string {
  if (typeof arg === 'string' && arg.length > 0) {
    return arg
  }
  throw new Error(`@${decorator.name} requires ${label}.`)
}

function resolveLineId(state: AudioCompileState, context: { stepUuid: string }): string {
  if (state.lineIdOverride) {
    return state.lineIdOverride
  }
  const chapterId = state.currentChapter?.chapterId
  if (!chapterId) {
    return context.stepUuid
  }
  state.dialogueSequence += 1
  return `${chapterId}:${state.dialogueSequence}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isBabelExpression(value)
}

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}

function normalizeRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
}

function engineArg(): t.MemberExpression {
  return t.memberExpression(t.identifier('ctx'), t.identifier('engine'))
}

interface AudioCompileState {
  currentChapter?: AudioChapterProjectionLike
  currentLineId?: string
  lineIdOverride?: string
  stepIndex: number
  dialogueSequence: number
  explicitVoiceStepIndex?: number
}

interface AudioChapterProjectionLike {
  chapterId: string
  voiceMap?: Record<string, string>
  bgm?: string
  defaults?: AudioDefaultsProjectionLike
  metadata?: Record<string, unknown>
}

interface AudioDefaultsProjectionLike {
  master?: Record<string, unknown>
  bgm?: Record<string, unknown>
  voice?: Record<string, unknown>
  sfx?: Record<string, unknown>
  ambient?: Record<string, unknown>
}
