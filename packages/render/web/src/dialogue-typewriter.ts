import type { QuaAssets } from '@quajs/assets'
import type {
  DialogueTypewriterProjection,
  DialogueTypewriterSoundProjection,
  RichTextBlockProjection,
  RichTextContent,
  RichTextSpanProjection,
  ViewDialogueProjection,
} from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'
import { runtimePackageCandidatesFromMetadata, WebAssetUrlHandle } from './assets'

export interface DialogueTypewriterRuntimeOptions {
  getAssets?: () => QuaAssets | undefined
  getDocument?: () => Document | undefined
  refresh?: () => void
  now?: () => number
}

export interface DialogueTypewriterProjectResult {
  dialogue: ViewDialogueProjection
  revealing: boolean
  visibleCharacters: number
  totalCharacters: number
  durationMs: number
}

interface ActiveDialogueReveal {
  key: string
  startedAt: number
  visibleCharacters: number
  totalCharacters: number
  revealedAll: boolean
  revealOnAdvance: boolean
  lastSoundCharacter: number
  lastSoundAt: number
}

const DEFAULT_CHARACTERS_PER_SECOND = 36
const MIN_REFRESH_DELAY_MS = 16

export class DialogueTypewriterRuntime {
  private active?: ActiveDialogueReveal
  private refreshTimer?: ReturnType<typeof setTimeout>
  private soundHandle?: WebAssetUrlHandle
  private soundUrl?: string
  private soundSignature?: string

  constructor(private readonly options: DialogueTypewriterRuntimeOptions = {}) {}

  project(dialogue: Readonly<ViewDialogueProjection>, now = this.getNow()): DialogueTypewriterProjectResult {
    const typewriter = normalizeTypewriter(dialogue.typewriter)
    if (!dialogue.visible || !typewriter) {
      this.clearRefreshTimer()
      this.active = undefined
      return {
        dialogue: dialogue as ViewDialogueProjection,
        revealing: false,
        visibleCharacters: getTextLength(dialogue.text),
        totalCharacters: getTextLength(dialogue.text),
        durationMs: 0,
      }
    }

    const totalCharacters = getTextLength(dialogue.text)
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
        lastSoundCharacter: 0,
        lastSoundAt: 0,
      }
      this.prepareTypewriterSound(typewriter.sound)
    }

    const active = this.active
    active.totalCharacters = totalCharacters
    active.revealOnAdvance = typewriter.revealOnAdvance !== false
    const visibleCharacters = active.revealedAll
      ? totalCharacters
      : resolveVisibleCharacters(totalCharacters, durationMs, now - active.startedAt)

    if (visibleCharacters > active.visibleCharacters) {
      this.playTypewriterSound(typewriter.sound, active, visibleCharacters, now)
    }
    active.visibleCharacters = visibleCharacters

    const revealing = visibleCharacters < totalCharacters
    if (revealing) {
      this.scheduleRefresh(resolveNextRefreshDelayMs(totalCharacters, durationMs))
    }
    else {
      this.clearRefreshTimer()
    }

    return {
      dialogue: {
        ...(dialogue as ViewDialogueProjection),
        text: sliceRichTextContent(dialogue.text, visibleCharacters),
      },
      revealing,
      visibleCharacters,
      totalCharacters,
      durationMs,
    }
  }

  revealNow(): boolean {
    if (!this.active || !this.active.revealOnAdvance || this.active.visibleCharacters >= this.active.totalCharacters) {
      return false
    }
    this.active.revealedAll = true
    this.active.visibleCharacters = this.active.totalCharacters
    this.clearRefreshTimer()
    this.options.refresh?.()
    return true
  }

  destroy(): void {
    this.clearRefreshTimer()
    this.active = undefined
    this.disposeSoundHandle()
  }

  private getNow(): number {
    return this.options.now?.() ?? Date.now()
  }

  private scheduleRefresh(delayMs: number): void {
    this.clearRefreshTimer()
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.options.refresh?.()
    }, Math.max(MIN_REFRESH_DELAY_MS, delayMs))
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer === undefined) {
      return
    }
    clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  private playTypewriterSound(
    sound: Readonly<DialogueTypewriterSoundProjection> | undefined,
    active: ActiveDialogueReveal,
    visibleCharacters: number,
    now: number,
  ): void {
    if (!sound?.assetKey) {
      return
    }
    const everyCharacters = Math.max(1, Math.floor(sound.everyCharacters ?? 1))
    if (Math.floor(visibleCharacters / everyCharacters) <= Math.floor(active.lastSoundCharacter / everyCharacters)) {
      return
    }
    const intervalMs = Math.max(0, sound.intervalMs ?? 24)
    if (active.lastSoundAt > 0 && now - active.lastSoundAt < intervalMs) {
      return
    }
    const url = this.resolveSoundUrl(sound)
    if (!url) {
      return
    }
    const document = this.options.getDocument?.() || globalThis.document
    if (!document) {
      return
    }
    const audio = document.createElement('audio')
    audio.preload = 'auto'
    audio.src = url
    audio.volume = clamp(dbToGain(sound.gainDb ?? 0), 0, 1)
    audio.playbackRate = sound.playbackRate && Number.isFinite(sound.playbackRate) && sound.playbackRate > 0
      ? sound.playbackRate
      : 1
    active.lastSoundCharacter = visibleCharacters
    active.lastSoundAt = now
    void audio.play().catch(() => {})
  }

  private prepareTypewriterSound(sound: Readonly<DialogueTypewriterSoundProjection> | undefined): void {
    if (!sound?.assetKey) {
      return
    }
    this.resolveSoundUrl(sound)
  }

  private resolveSoundUrl(sound: Readonly<DialogueTypewriterSoundProjection>): string | undefined {
    const signature = JSON.stringify({
      assetKey: sound.assetKey,
      contentPackageId: sound.contentPackageId,
      metadata: sound.metadata || {},
    })
    if (this.soundSignature !== signature) {
      this.disposeSoundHandle()
      this.soundSignature = signature
      this.soundHandle = new WebAssetUrlHandle({
        getAssets: () => this.options.getAssets?.(),
        getType: () => 'audio',
        getName: () => sound.assetKey,
        getTargetPackageId: () => runtimePackageCandidatesFromMetadata({
          ...(sound.metadata || {}),
          ...(sound.contentPackageId ? { contentPackageId: sound.contentPackageId } : {}),
        }),
        onChange: state => this.soundUrl = state.url,
      })
      void this.soundHandle.load()
    }
    return this.soundUrl
  }

  private disposeSoundHandle(): void {
    this.soundHandle?.dispose()
    this.soundHandle = undefined
    this.soundUrl = undefined
    this.soundSignature = undefined
  }
}

export function sliceRichTextContent(content: RichTextContent, visibleCharacters: number): RichTextContent {
  if (visibleCharacters <= 0) {
    return isRichTextDocument(content)
      ? {
          ...content,
          blocks: content.blocks.map(block => ({
            ...block,
            spans: [],
          })),
        }
      : ''
  }
  if (!isRichTextDocument(content)) {
    return Array.from(content).slice(0, visibleCharacters).join('')
  }

  let remaining = visibleCharacters
  const blocks: RichTextBlockProjection[] = []
  for (const block of content.blocks) {
    const nextBlock = sliceRichTextBlock(block, remaining)
    blocks.push(nextBlock)
    remaining -= getBlockTextLength(block)
    if (remaining <= 0) {
      break
    }
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
  let remaining = Math.max(0, visibleCharacters)
  const spans: RichTextSpanProjection[] = []
  for (const span of block.spans) {
    if (remaining <= 0) {
      break
    }
    const chars = Array.from(span.text)
    const text = chars.slice(0, remaining).join('')
    if (text.length > 0) {
      spans.push({
        ...span,
        text,
      })
    }
    remaining -= chars.length
  }
  return {
    ...block,
    spans,
  }
}

function normalizeTypewriter(
  typewriter: Readonly<DialogueTypewriterProjection> | undefined,
): Readonly<DialogueTypewriterProjection> | undefined {
  if (!typewriter?.enabled) {
    return undefined
  }
  return typewriter
}

function resolveDurationMs(content: RichTextContent, typewriter: Readonly<DialogueTypewriterProjection>): number {
  if (typewriter.durationMs && Number.isFinite(typewriter.durationMs) && typewriter.durationMs > 0) {
    return typewriter.durationMs
  }
  const totalCharacters = getTextLength(content)
  if (totalCharacters <= 0) {
    return 0
  }
  const charactersPerSecond = typewriter.charactersPerSecond
    && Number.isFinite(typewriter.charactersPerSecond)
    && typewriter.charactersPerSecond > 0
    ? typewriter.charactersPerSecond
    : DEFAULT_CHARACTERS_PER_SECOND
  return Math.ceil((totalCharacters / charactersPerSecond) * 1000)
}

function resolveVisibleCharacters(totalCharacters: number, durationMs: number, elapsedMs: number): number {
  if (totalCharacters <= 0 || durationMs <= 0) {
    return totalCharacters
  }
  return clamp(Math.floor((Math.max(0, elapsedMs) / durationMs) * totalCharacters), 0, totalCharacters)
}

function resolveNextRefreshDelayMs(totalCharacters: number, durationMs: number): number {
  if (totalCharacters <= 0 || durationMs <= 0) {
    return MIN_REFRESH_DELAY_MS
  }
  return Math.max(MIN_REFRESH_DELAY_MS, Math.ceil(durationMs / totalCharacters))
}

function createDialogueRevealKey(dialogue: Readonly<ViewDialogueProjection>, totalCharacters: number): string {
  return JSON.stringify({
    revision: dialogue.revision,
    characterId: dialogue.characterId,
    characterName: dialogue.characterName,
    mode: dialogue.mode,
    totalCharacters,
    text: getContentSignature(dialogue.text),
    metadata: dialogue.metadata
      ? {
          contentPackageId: dialogue.metadata.contentPackageId,
          lineId: dialogue.metadata.lineId,
          stepId: dialogue.metadata.stepId,
        }
      : undefined,
  })
}

function getContentSignature(content: RichTextContent): string {
  if (!isRichTextDocument(content)) {
    return content
  }
  return content.blocks
    .map(block => block.spans.map(span => span.text).join(''))
    .join('\n')
}

function getTextLength(content: RichTextContent): number {
  if (!isRichTextDocument(content)) {
    return Array.from(content).length
  }
  return content.blocks.reduce((sum, block) => sum + getBlockTextLength(block), 0)
}

function getBlockTextLength(block: Readonly<RichTextBlockProjection>): number {
  return block.spans.reduce((sum, span) => sum + Array.from(span.text).length, 0)
}

function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
