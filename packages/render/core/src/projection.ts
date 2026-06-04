import type {
  ActiveAnimationProjection,
  QuaViewProjection,
  RichTextBlockProjection,
  RichTextContent,
  RichTextDocumentProjection,
  RichTextSpanProjection,
  ViewBackgroundProjection,
  ViewCharacterProjection,
  ViewChoiceProjection,
  ViewDialogueProjection,
  ViewEffectProjection,
} from './index'
import { isRichTextDocument } from './index'
import { applyTrackValues, cloneBackground, cloneCharacter, cloneUnknownRecord, collectTrackValues } from './animation'

export type MotionProjection = Readonly<Record<string, unknown>>

export function projectBackground(
  background: Readonly<ViewBackgroundProjection> | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewBackgroundProjection | undefined {
  if (!background)
    return undefined

  const mainTracks = collectTrackValues(animations, 'background:main', now)
  const next = cloneBackground(background)
  if (mainTracks.length > 0) {
    applyTrackValues(next as unknown as Record<string, unknown>, mainTracks)
  }

  if (next.layers?.length) {
    next.layers = next.layers.map((layer) => {
      const layerTracks = collectTrackValues(animations, `backgroundLayer:${layer.id}`, now)
      if (layerTracks.length === 0)
        return layer
      const projected = {
        ...layer,
        composition: layer.composition ? cloneUnknownRecord(layer.composition) : undefined,
        transition: layer.transition ? { ...layer.transition } : undefined,
        metadata: layer.metadata ? { ...layer.metadata } : undefined,
      }
      applyTrackValues(projected as unknown as Record<string, unknown>, layerTracks)
      return projected
    })
  }

  return next
}

export function projectCharacter(
  character: Readonly<ViewCharacterProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewCharacterProjection {
  const tracks = collectTrackValues(animations, `character:${character.id}`, now)
  if (tracks.length === 0)
    return character as ViewCharacterProjection

  const next = cloneCharacter(character)
  applyTrackValues(next as unknown as Record<string, unknown>, tracks)
  return next
}

export function projectCharacters(
  characters: readonly Readonly<ViewCharacterProjection>[],
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewCharacterProjection[] {
  return characters.map(character => projectCharacter(character, animations, now))
}

export function projectStageMotion(
  view: Readonly<QuaViewProjection>,
  now: number,
): { stage: MotionProjection, camera: MotionProjection } {
  return {
    stage: projectMotionTarget(view.plugins.stage as MotionProjection | undefined, view.animations, 'stage:main', now),
    camera: projectMotionTarget(view.plugins.camera as MotionProjection | undefined, view.animations, 'camera:main', now),
  }
}

export function projectDialogue(
  dialogue: Readonly<ViewDialogueProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
  base?: MotionProjection,
): ViewDialogueProjection {
  const projection = {
    ...(base ? cloneUnknownRecord(base) : {}),
    ...(dialogue as unknown as Record<string, unknown>),
  }
  const projected = projectMotionTarget(projection, animations, 'dialogue:box', now) as unknown as ViewDialogueProjection
  projected.text = projectRichText(projected.text, animations, now, 'dialogue')
  return projected
}

export function projectRichText(
  content: RichTextContent,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
  targetPrefix = 'text',
): RichTextContent {
  if (!isRichTextDocument(content)) {
    return content
  }

  const document = cloneRichTextDocument(content)
  applyTrackValues(document as unknown as Record<string, unknown>, collectTrackValues(animations, `richText:${targetPrefix}`, now))
  document.blocks = document.blocks.map((block, blockIndex) => {
    const projectedBlock = cloneRichTextBlock(block)
    applyTrackValues(
      projectedBlock as unknown as Record<string, unknown>,
      collectTrackValues(animations, `richTextBlock:${targetPrefix}:${richTextItemId(block.id, blockIndex)}`, now),
    )
    projectedBlock.spans = projectedBlock.spans.map((span, spanIndex) => {
      const projectedSpan = cloneRichTextSpan(span)
      applyTrackValues(
        projectedSpan as unknown as Record<string, unknown>,
        collectTrackValues(animations, `richTextSpan:${targetPrefix}:${richTextItemId(span.id, spanIndex)}`, now),
      )
      return projectedSpan
    })
    return projectedBlock
  })
  return document
}

export function projectChoices(
  choices: readonly Readonly<ViewChoiceProjection>[],
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
  base?: MotionProjection,
): { panel: MotionProjection, choices: ViewChoiceProjection[] } {
  const choiceBaseMap = base?.choices && typeof base.choices === 'object' && !Array.isArray(base.choices)
    ? base.choices as Readonly<Record<string, unknown>>
    : undefined
  return {
    panel: projectMotionTarget(base, animations, 'choices:panel', now),
    choices: choices.map((choice) => {
      const choiceBase = choiceBaseMap?.[choice.id]
      const projection = {
        ...(choiceBase && typeof choiceBase === 'object' && !Array.isArray(choiceBase)
          ? cloneUnknownRecord(choiceBase as Readonly<Record<string, unknown>>)
          : {}),
        ...(choice as unknown as Record<string, unknown>),
      }
      return projectMotionTarget(projection, animations, `choice:${choice.id}`, now) as unknown as ViewChoiceProjection
    }),
  }
}

export function projectUiOverlay(
  overlay: Readonly<Record<string, unknown>>,
  elementId: string,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): Record<string, unknown> {
  return projectMotionTarget(overlay, animations, `ui:${elementId}`, now) as Record<string, unknown>
}

export function projectEffect(
  effect: Readonly<ViewEffectProjection>,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  now: number,
): ViewEffectProjection {
  return projectMotionTarget(effect as unknown as MotionProjection, animations, `effect:${effect.id}`, now) as unknown as ViewEffectProjection
}

export function projectAudioProjection<T = unknown>(
  view: Readonly<QuaViewProjection>,
  now: number,
): T | undefined {
  const audio = view.plugins.audio as Readonly<Record<string, unknown>> | undefined
  if (!audio)
    return undefined

  const projected = cloneUnknownRecord(audio)
  const buses = projected.buses
  if (buses && typeof buses === 'object' && !Array.isArray(buses)) {
    const busMap = buses as Record<string, unknown>
    for (const busId of Object.keys(buses)) {
      const bus = busMap[busId]
      if (bus && typeof bus === 'object' && !Array.isArray(bus)) {
        busMap[busId] = projectMotionTarget(bus as MotionProjection, view.animations, `audioBus:${busId}`, now)
      }
    }
  }

  if (projected.bgm && typeof projected.bgm === 'object' && !Array.isArray(projected.bgm)) {
    const id = (projected.bgm as Record<string, unknown>).id
    if (typeof id === 'string') {
      projected.bgm = projectMotionTarget(projected.bgm as MotionProjection, view.animations, `audioTrack:${id}`, now)
    }
  }

  for (const collection of ['voices', 'sfx', 'ambients']) {
    const tracks = projected[collection]
    if (!Array.isArray(tracks))
      continue
    projected[collection] = tracks.map((track) => {
      if (!track || typeof track !== 'object' || Array.isArray(track))
        return track
      const id = (track as Record<string, unknown>).id
      return typeof id === 'string'
        ? projectMotionTarget(track as MotionProjection, view.animations, `audioTrack:${id}`, now)
        : track
    })
  }

  return projected as T
}

export function projectMotionTarget(
  base: MotionProjection | undefined,
  animations: readonly Readonly<ActiveAnimationProjection>[],
  target: string,
  now: number,
): Record<string, unknown> {
  const next = base ? cloneUnknownRecord(base) : {}
  const tracks = collectTrackValues(animations, target, now)
  if (tracks.length > 0) {
    applyTrackValues(next, tracks)
  }
  return next
}

function cloneRichTextDocument(document: Readonly<RichTextDocumentProjection>): RichTextDocumentProjection {
  return {
    ...document,
    metadata: document.metadata ? cloneUnknownRecord(document.metadata) : undefined,
    blocks: document.blocks.map(block => cloneRichTextBlock(block)),
  }
}

function cloneRichTextBlock(block: Readonly<RichTextBlockProjection>): RichTextBlockProjection {
  return {
    ...block,
    metadata: block.metadata ? cloneUnknownRecord(block.metadata) : undefined,
    spans: block.spans.map(span => cloneRichTextSpan(span)),
  }
}

function cloneRichTextSpan(span: Readonly<RichTextSpanProjection>): RichTextSpanProjection {
  return {
    ...span,
    metadata: span.metadata ? cloneUnknownRecord(span.metadata) : undefined,
  }
}

function richTextItemId(id: string | undefined, index: number): string {
  return id || String(index)
}

