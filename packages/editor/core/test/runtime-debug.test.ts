import { createMemoryAssetsAdapter } from '@quajs/assets-memory'
import { QuaEngine, RenderToLogicEvents } from '@quajs/engine'
import { afterEach, expect, it, vi } from 'vitest'
import { validateDebugRequest } from '../src/preview/debug.js'
import { createPreviewDebugger } from '../src/preview/runtime-debug.js'

let engine: QuaEngine
let debug: ReturnType<typeof createPreviewDebugger>
afterEach(async () => {
  debug?.dispose()
  await engine?.destroy()
  QuaEngine.resetInstance()
})
it('retains originating steps, separates speakers and blocks gameplay while picking', async () => {
  engine = new QuaEngine({ assets: { adapter: createMemoryAssetsAdapter() } })
  await engine.init()
  let audio = [{ id: 'voice', kind: 'voice' as const, state: 'playing', assetKey: 'voice.wav' }]
  const controlAudio = vi.fn(async () => {})
  debug = createPreviewDebugger(engine, { getAudio: () => audio, controlAudio })
  const pipeline = engine.getPipeline()
  const source = { path: '/project/story.qs', stepIndex: 0, line: 1, start: 0, end: 8, expectedText: 'Hero: Hi' }
  await pipeline.emit('editor/preview/step', { source, stepId: 'one' })
  await engine.showCharacter({ id: 'hero' })
  await engine.setBackgroundProjection({ mode: 'image', assetName: 'room.png' })
  await engine.showDialogue({ characterName: 'Hero', text: 'Hi' })
  await pipeline.emit('editor/preview/step', { source: { ...source, stepIndex: 1 }, stepId: 'two' })
  await engine.showDialogue({ characterName: 'Other', text: 'Hello' })
  await debug.request({ kind: 'pick', enabled: true })
  const advance = vi.fn()
  pipeline.on(RenderToLogicEvents.USER_ADVANCE, advance)
  await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, { source: 'pointer' })
  expect(advance).not.toHaveBeenCalled()
  await pipeline.emit('editor/preview/inspect', { kind: 'character', target: 'hero' })
  await pipeline.emit('editor/preview/inspect', { kind: 'background' })
  await pipeline.emit('editor/preview/inspect', { kind: 'dialogue' })
  const snapshot = await debug.request({ kind: 'read', after: 0 })
  expect(snapshot.requests.map(item => item.source?.stepIndex)).toEqual([0, 0, 1])
  expect(snapshot.clips.filter(item => item.kind === 'dialogue').map(item => item.lane)).toEqual(['Hero', 'Other'])
  expect(snapshot.clips.find(item => item.kind === 'voice')?.lane).toBe('Hero，配音')
  expect(snapshot.clips.find(item => item.kind === 'voice')?.playback).toBeUndefined()
  await debug.request({ kind: 'audio', action: 'pause', target: 'voice' })
  expect(controlAudio).toHaveBeenCalledWith({ kind: 'audio', action: 'pause', target: 'voice', positionMs: undefined })
  audio = []
  expect((await debug.request({ kind: 'read', after: snapshot.requests.at(-1)!.id })).requests).toEqual([])
  expect((await debug.request({ kind: 'read', after: 0 })).clips.find(item => item.kind === 'voice')?.endMs).toBeDefined()
  const reply = vi.fn()
  pipeline.on('editor/preview/edit-result', reply)
  await pipeline.emit('editor/preview/inspect', { kind: 'dialogue', text: 'Changed', expectedText: 'Hi', stepId: 'one' })
  expect(reply.mock.calls[0][0].event.payload.error).toBe(true)
  await debug.request({ kind: 'pick', enabled: false })
  await pipeline.emit(RenderToLogicEvents.USER_ADVANCE, { source: 'pointer' })
  expect(advance).toHaveBeenCalledTimes(1)
})
it('rejects arbitrary or unbounded control payloads', () => {
  for (const value of [{ kind: 'audio', action: 'seek', target: 'master', positionMs: -1 }, { kind: 'read', after: Number.NaN }, { kind: 'eval', code: 'x' }])
    expect(() => validateDebugRequest(value)).toThrow()
})

it('splits replacement music on a reused track id and preserves its source when clearing the trace', async () => {
  engine = new QuaEngine({ assets: { adapter: createMemoryAssetsAdapter() } })
  await engine.init()
  let audio = [{ id: 'bgm', kind: 'bgm' as const, state: 'playing', assetKey: 'one.wav' }]
  debug = createPreviewDebugger(engine, { getAudio: () => audio })
  const source = { path: '/story.qs', stepIndex: 0, line: 1, start: 0, end: 8, expectedText: 'Hero: Hi' }
  await engine.getPipeline().emit('editor/preview/step', { source, stepId: 'one' })
  await debug.request({ kind: 'read', after: 0 })
  await engine.getPipeline().emit('editor/preview/step', { source: { ...source, stepIndex: 1 }, stepId: 'two' })
  audio = [{ ...audio[0], assetKey: 'two.wav' }]
  const snapshot = await debug.request({ kind: 'read', after: 0 })
  expect(snapshot.clips.map(clip => [clip.label, clip.source?.stepIndex])).toEqual([['one.wav', 0], ['two.wav', 1]])
  expect(snapshot.clips[0].endMs).toBeDefined()
  expect(snapshot.clips[1].endMs).toBeUndefined()
  const cleared = await debug.request({ kind: 'clear' })
  expect(cleared.clips).toHaveLength(1)
  expect(cleared.clips[0].source?.stepIndex).toBe(1)
  for (let i = 0; i < 410; i++)
    await engine.showDialogue({ characterName: 'Hero', text: `Line ${i}` })
  const bounded = await debug.request({ kind: 'read', after: 0 })
  expect(bounded.clips).toHaveLength(400)
  expect(bounded.truncated).toBe(true)
  expect(bounded.clips[0].label).toBe('two.wav')
})
