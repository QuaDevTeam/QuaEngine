import type {
  DialogueTypewriterProjection,
  RichTextBlockProjection,
  RichTextContent,
  RichTextSpanProjection,
  ViewDialogueProjection,
} from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'

export interface CocosDialogueTypewriterProjectResult {
  dialogue: ViewDialogueProjection
  revealing: boolean
  visibleCharacters: number
}

export interface CocosDialogueTypewriterRuntimeOptions {
  now: () => number
  onSound?: (sound: NonNullable<DialogueTypewriterProjection['sound']>, visibleCharacters: number) => void
}

interface ActiveTypewriter {
  signature: string
  startedAt: number
  durationMs: number
  revealOnAdvance: boolean
  revealed: boolean
  lastSoundAt: number
  lastSoundCharacters: number
}

export class CocosDialogueTypewriterRuntime {
  private active?: ActiveTypewriter

  constructor(private readonly options: CocosDialogueTypewriterRuntimeOptions) {}

  project(dialogue: ViewDialogueProjection): CocosDialogueTypewriterProjectResult {
    const typewriter = normalizeTypewriter(dialogue.typewriter)
    if (!dialogue.visible || !typewriter) {
      this.active = undefined
      return {
        dialogue,
        revealing: false,
        visibleCharacters: getTextLength(dialogue.text),
      }
    }

    const now = this.options.now()
    const signature = getDialogueSignature(dialogue)
    const durationMs = resolveDurationMs(dialogue.text, typewriter)
    if (!this.active || this.active.signature !== signature) {
      this.active = {
        signature,
        startedAt: now,
        durationMs,
        revealOnAdvance: typewriter.revealOnAdvance !== false,
        revealed: false,
        lastSoundAt: 0,
        lastSoundCharacters: 0,
      }
    }

    this.active.durationMs = durationMs
    this.active.revealOnAdvance = typewriter.revealOnAdvance !== false

    const totalCharacters = getTextLength(dialogue.text)
    const elapsed = Math.max(0, now - this.active.startedAt)
    const visibleCharacters = this.active.revealed || durationMs <= 0
      ? totalCharacters
      : Math.min(totalCharacters, Math.floor((elapsed / durationMs) * totalCharacters))
    const revealing = visibleCharacters < totalCharacters

    if (revealing && typewriter.sound) {
      this.playTypewriterSound(typewriter.sound, visibleCharacters, now)
    }

    return {
      dialogue: {
        ...dialogue,
        text: sliceRichTextContent(dialogue.text, visibleCharacters),
      },
      revealing,
      visibleCharacters,
    }
  }

  revealNow(): boolean {
    if (!this.active || this.active.revealed || !this.active.revealOnAdvance)
      return false
    this.active.revealed = true
    return true
  }

  destroy(): void {
    this.active = undefined
  }

  private playTypewriterSound(
    sound: NonNullable<DialogueTypewriterProjection['sound']>,
    visibleCharacters: number,
    now: number,
  ): void {
    if (!this.active || visibleCharacters <= this.active.lastSoundCharacters)
      return
    const everyCharacters = positiveInteger(sound.everyCharacters, 1)
    if (visibleCharacters % everyCharacters !== 0)
      return
    const intervalMs = positiveNumber(sound.intervalMs, 32)
    if (now - this.active.lastSoundAt < intervalMs)
      return
    this.active.lastSoundAt = now
    this.active.lastSoundCharacters = visibleCharacters
    this.options.onSound?.(sound, visibleCharacters)
  }
}

export function sliceRichTextContent(content: RichTextContent, visibleCharacters: number): RichTextContent {
  const count = Math.max(0, Math.floor(visibleCharacters))
  if (!isRichTextDocument(content))
    return content.slice(0, count)

  let remaining = count
  const blocks: RichTextBlockProjection[] = []
  for (const block of content.blocks) {
    if (remaining <= 0)
      break
    const next = sliceRichTextBlock(block, remaining)
    remaining -= getBlockTextLength(next)
    blocks.push(next)
  }
  return {
    ...content,
    blocks,
  }
}

function sliceRichTextBlock(
  block: Readonly<RichTextBlockProjection>,
  visibleCharacters: number,
): RichTextBlockProjection {
  let remaining = visibleCharacters
  const spans: RichTextSpanProjection[] = []
  for (const span of block.spans) {
    if (remaining <= 0)
      break
    const text = span.text.slice(0, remaining)
    remaining -= text.length
    spans.push({
      ...span,
      text,
    })
  }
  return {
    ...block,
    spans,
  }
}

function normalizeTypewriter(
  typewriter: Readonly<DialogueTypewriterProjection> | undefined,
): Readonly<DialogueTypewriterProjection> | undefined {
  if (!typewriter?.enabled)
    return undefined
  return typewriter
}

function resolveDurationMs(content: RichTextContent, typewriter: Readonly<DialogueTypewriterProjection>): number {
  if (typewriter.durationMs && Number.isFinite(typewriter.durationMs) && typewriter.durationMs > 0)
    return typewriter.durationMs

  const charactersPerSecond = typewriter.charactersPerSecond
    && Number.isFinite(typewriter.charactersPerSecond)
    && typewriter.charactersPerSecond > 0
    ? typewriter.charactersPerSecond
    : 36
  return Math.max(0, (getTextLength(content) / charactersPerSecond) * 1000)
}

function getDialogueSignature(dialogue: Readonly<ViewDialogueProjection>): string {
  return JSON.stringify({
    revision: dialogue.revision,
    characterId: dialogue.characterId,
    characterName: dialogue.characterName,
    mode: dialogue.mode,
    text: dialogue.text,
    typewriter: dialogue.typewriter,
  })
}

function getTextLength(content: RichTextContent): number {
  if (!isRichTextDocument(content))
    return content.length
  return content.blocks.reduce((total, block) => total + getBlockTextLength(block), 0)
}

function getBlockTextLength(block: Readonly<RichTextBlockProjection>): number {
  return block.spans.reduce((total, span) => total + span.text.length, 0)
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = positiveNumber(value, fallback)
  return Math.max(1, Math.floor(number))
}
