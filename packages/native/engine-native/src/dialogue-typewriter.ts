import type {
  DialogueTypewriterProjection,
  RichTextBlockProjection,
  RichTextContent,
  RichTextSpanProjection,
  ViewDialogueProjection,
} from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'

export interface NativeDialogueTypewriterProjectResult {
  dialogue: ViewDialogueProjection
  revealing: boolean
  visibleCharacters: number
  totalCharacters: number
  durationMs: number
}

export interface NativeDialogueTypewriterControllerOptions {
  now?: () => number
  requestRender?: () => void
}

interface ActiveNativeDialogueReveal {
  key: string
  startedAt: number
  visibleCharacters: number
  totalCharacters: number
  revealedAll: boolean
  revealOnAdvance: boolean
}

const DEFAULT_CHARACTERS_PER_SECOND = 36
const MIN_REFRESH_DELAY_MS = 16

export class NativeDialogueTypewriterController {
  private active?: ActiveNativeDialogueReveal
  private timer?: unknown

  constructor(private readonly options: NativeDialogueTypewriterControllerOptions = {}) {}

  project(
    dialogue: Readonly<ViewDialogueProjection>,
    now = this.options.now?.() ?? Date.now(),
  ): NativeDialogueTypewriterProjectResult {
    const typewriter = dialogue.typewriter?.enabled ? dialogue.typewriter : undefined
    const totalCharacters = getTextLength(dialogue.text)
    if (!dialogue.visible || !typewriter) {
      this.clearTimer()
      this.active = undefined
      return {
        dialogue: dialogue as ViewDialogueProjection,
        revealing: false,
        visibleCharacters: totalCharacters,
        totalCharacters,
        durationMs: 0,
      }
    }

    const durationMs = resolveDurationMs(dialogue.text, typewriter)
    const key = createDialogueRevealKey(dialogue, totalCharacters)
    if (!this.active || this.active.key !== key) {
      this.active = {
        key,
        startedAt: now,
        visibleCharacters: 0,
        totalCharacters,
        revealedAll: totalCharacters === 0,
        revealOnAdvance: typewriter.revealOnAdvance !== false,
      }
    }

    const active = this.active
    active.totalCharacters = totalCharacters
    active.revealOnAdvance = typewriter.revealOnAdvance !== false
    const visibleCharacters = active.revealedAll
      ? totalCharacters
      : resolveVisibleCharacters(totalCharacters, durationMs, now - active.startedAt)
    active.visibleCharacters = visibleCharacters

    const revealing = visibleCharacters < totalCharacters
    if (revealing)
      this.scheduleRefresh(resolveNextRefreshDelayMs(totalCharacters, durationMs))
    else
      this.clearTimer()

    return {
      dialogue: {
        ...(dialogue as ViewDialogueProjection),
        text: sliceNativeRichTextContent(dialogue.text, visibleCharacters),
      },
      revealing,
      visibleCharacters,
      totalCharacters,
      durationMs,
    }
  }

  revealNow(): boolean {
    const active = this.active
    if (!active || !active.revealOnAdvance || active.visibleCharacters >= active.totalCharacters)
      return false
    active.revealedAll = true
    active.visibleCharacters = active.totalCharacters
    this.clearTimer()
    this.options.requestRender?.()
    return true
  }

  destroy(): void {
    this.clearTimer()
    this.active = undefined
  }

  private scheduleRefresh(delayMs: number): void {
    this.clearTimer()
    this.timer = this.runtime().setTimeout(() => {
      this.timer = undefined
      this.options.requestRender?.()
    }, Math.max(MIN_REFRESH_DELAY_MS, delayMs))
  }

  private clearTimer(): void {
    if (this.timer !== undefined)
      this.runtime().clearTimeout(this.timer)
    this.timer = undefined
  }

  private runtime(): {
    setTimeout: (callback: () => void, timeout: number) => unknown
    clearTimeout: (handle: unknown) => void
  } {
    return globalThis as unknown as {
      setTimeout: (callback: () => void, timeout: number) => unknown
      clearTimeout: (handle: unknown) => void
    }
  }
}

export function sliceNativeRichTextContent(content: RichTextContent, visibleCharacters: number): RichTextContent {
  const count = Math.max(0, Math.floor(visibleCharacters))
  if (count <= 0) {
    return isRichTextDocument(content)
      ? {
          ...content,
          blocks: content.blocks.map(block => ({ ...block, spans: [] })),
        }
      : ''
  }
  if (!isRichTextDocument(content))
    return graphemes(content).slice(0, count).join('')

  let remaining = count
  return {
    ...content,
    blocks: content.blocks.map((block) => {
      const next = sliceRichTextBlock(block, remaining)
      remaining -= getBlockTextLength(block)
      return next
    }),
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
    const characters = graphemes(span.text)
    const text = characters.slice(0, remaining).join('')
    if (text)
      spans.push({ ...span, text })
    remaining -= characters.length
  }
  return { ...block, spans }
}

function createDialogueRevealKey(dialogue: Readonly<ViewDialogueProjection>, totalCharacters: number): string {
  return JSON.stringify({
    revision: dialogue.revision,
    characterId: dialogue.characterId,
    characterName: dialogue.characterName,
    speaker: dialogue.speaker,
    mode: dialogue.mode,
    text: dialogue.text,
    typewriter: dialogue.typewriter,
    totalCharacters,
  })
}

function resolveDurationMs(content: RichTextContent, typewriter: Readonly<DialogueTypewriterProjection>): number {
  if (positiveNumber(typewriter.durationMs) !== undefined)
    return typewriter.durationMs!
  const totalCharacters = getTextLength(content)
  if (totalCharacters <= 0)
    return 0
  const charactersPerSecond = positiveNumber(typewriter.charactersPerSecond) ?? DEFAULT_CHARACTERS_PER_SECOND
  return Math.ceil((totalCharacters / charactersPerSecond) * 1000)
}

function resolveVisibleCharacters(totalCharacters: number, durationMs: number, elapsedMs: number): number {
  if (totalCharacters <= 0 || durationMs <= 0)
    return totalCharacters
  const raw = (Math.max(0, elapsedMs) / durationMs) * totalCharacters
  return Math.min(totalCharacters, Math.max(0, raw <= 0 ? 0 : Math.ceil(raw)))
}

function resolveNextRefreshDelayMs(totalCharacters: number, durationMs: number): number {
  if (totalCharacters <= 0 || durationMs <= 0)
    return MIN_REFRESH_DELAY_MS
  return Math.max(MIN_REFRESH_DELAY_MS, Math.floor(durationMs / totalCharacters))
}

function getTextLength(content: RichTextContent): number {
  if (!isRichTextDocument(content))
    return graphemes(content).length
  return content.blocks.reduce((total, block) => total + getBlockTextLength(block), 0)
}

function getBlockTextLength(block: Readonly<RichTextBlockProjection>): number {
  return block.spans.reduce((total, span) => total + graphemes(span.text).length, 0)
}

function graphemes(text: string): string[] {
  const Segmenter = (globalThis.Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity?: 'grapheme' }) => {
      segment: (value: string) => Iterable<{ segment: string }>
    }
  } | undefined)?.Segmenter
  if (!Segmenter)
    return Array.from(text)
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}
