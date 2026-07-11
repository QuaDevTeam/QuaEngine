import { RenderToLogicEvents } from '@quajs/engine'
import { describe, expect, it, vi } from 'vitest'
import {
  emitNativeRendererIntentToPipeline,
  NativeDialogueTypewriterController,
  sliceNativeRichTextContent,
} from '../src'
import { createTestPipeline } from './fixtures'

describe('native dialogue typewriter', () => {
  it('reveals grapheme clusters at a deterministic frame time', () => {
    const controller = new NativeDialogueTypewriterController()
    const dialogue = {
      visible: true,
      text: 'A👩‍💻中文',
      typewriter: { enabled: true, durationMs: 400 },
    } as const

    expect(controller.project(dialogue, 1_000).dialogue.text).toBe('')
    const midpoint = controller.project(dialogue, 1_200)
    expect(midpoint.dialogue.text).toBe('A👩‍💻')
    expect(midpoint.visibleCharacters).toBe(2)
    expect(midpoint.totalCharacters).toBe(4)
    expect(midpoint.revealing).toBe(true)
    expect(controller.project(dialogue, 1_400).dialogue.text).toBe('A👩‍💻中文')
    controller.destroy()
  })

  it('preserves rich-text block and span styles while slicing content', () => {
    const content = {
      kind: 'rich-text' as const,
      blocks: [{
        id: 'line',
        spans: [
          { text: 'Hello', color: '#fff' },
          { text: '世界', fontWeight: 700 },
        ],
      }],
    }
    expect(sliceNativeRichTextContent(content, 6)).toEqual({
      kind: 'rich-text',
      blocks: [{
        id: 'line',
        spans: [
          { text: 'Hello', color: '#fff' },
          { text: '世', fontWeight: 700 },
        ],
      }],
    })
  })

  it('consumes the first advance command to reveal text before engine progression', async () => {
    const controller = new NativeDialogueTypewriterController()
    controller.project({
      visible: true,
      text: 'Reveal before advancing.',
      typewriter: { enabled: true, durationMs: 1_000, revealOnAdvance: true },
    }, 1_000)
    const pipeline = createTestPipeline()
    const interceptor = vi.fn(() => controller.revealNow())
    const event = {
      type: RenderToLogicEvents.USER_INPUT_COMMAND,
      payloadJson: JSON.stringify({
        command: 'advance',
        device: 'keyboard',
        source: 'keyboard:Space',
        pressed: true,
        repeat: false,
        timestamp: 1_050,
      }),
    }

    const first = await emitNativeRendererIntentToPipeline(pipeline as any, event, {
      interceptInputCommand: interceptor,
    })
    expect(first).toEqual({ handled: true, emittedEvents: [] })
    expect(pipeline.emit).not.toHaveBeenCalled()

    const second = await emitNativeRendererIntentToPipeline(pipeline as any, event, {
      interceptInputCommand: interceptor,
    })
    expect(second.emittedEvents).toEqual([
      expect.objectContaining({ type: RenderToLogicEvents.USER_INPUT_COMMAND }),
    ])
    expect(pipeline.emit).toHaveBeenCalledTimes(1)
    controller.destroy()
  })
})
