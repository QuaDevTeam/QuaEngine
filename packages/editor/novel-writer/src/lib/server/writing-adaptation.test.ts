import type { EditorWritingDocument } from '@quajs/editor-core'
import type { NovelWriterConfig } from '$lib/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeAdaptationCount, adaptWriting } from './writing-adaptation'
import { DeepSeekClient } from './deepseek'

const config = vi.hoisted(() => ({ deepSeekApiKey: 'test-only', deepSeekBaseUrl: 'https://example.invalid', deepSeekModel: 'deepseek-v4-pro', defaultReasoningEffort: 'high', tavilyBaseUrl: 'https://example.invalid', defaultMaxRevisionLoops: 50 } as NovelWriterConfig))
vi.mock('./store', () => ({ readConfig: async () => config }))
afterEach(() => {
  vi.unstubAllGlobals()
  delete config.codeModel
  delete config.codeReasoningEffort
})
const document: EditorWritingDocument = { root: '/p', path: '/p/a.qs', text: '@Node("a")\n凛: 原稿\n', revision: 'disk', start: 0, end: 0 }
const good = { summary: '将新增段落安排在同一个故事节点中。', assignments: [{ line: 0, anchor: 0, expressions: [] }, { line: 1, anchor: 0, expressions: [] }] }
const response = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] }))

describe('DeepSeek writing adapter', () => {
  it('routes adaptation to the code model while prose keeps its own model and reasoning', async () => {
    config.codeModel = 'deepseek-v4-flash'
    config.codeReasoningEffort = 'max'
    const calls: { model: string, reasoning_effort: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      return response(good)
    }))
    await adaptWriting(document, '凛：新稿\n旁白：新增段落', undefined)
    await new DeepSeekClient(config).createJson({ agentId: 'writer', projectId: 'p', messages: [{ role: 'user', content: '写作' }] })
    expect(calls.map(({ model, reasoning_effort }) => ({ model, reasoning_effort }))).toEqual([
      { model: 'deepseek-v4-flash', reasoning_effort: 'max' },
      { model: 'deepseek-v4-pro', reasoning_effort: 'high' },
    ])
  })
  it('repairs invalid assignments using validator feedback and returns only validated source/plan', async () => {
    const mock = vi.fn().mockResolvedValueOnce(response({ ...good, assignments: [] })).mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body.messages[0].content).toContain('运行时')
      expect(body.messages.at(-1).content).toContain('校验')
      expect(body.thinking).toEqual({ type: 'enabled' })
      expect(body.model).toBe('deepseek-v4-pro')
      return response(good)
    })
    vi.stubGlobal('fetch', mock)
    const result = await adaptWriting(document, '凛：新稿\n旁白：新增段落', undefined)
    expect(mock).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('@Node("a")\n凛: 新稿\n新增段落\n')
    expect(activeAdaptationCount()).toBe(0)
  })
  it('does not retry or fabricate a patch when the model identifies an incompatible branch change', async () => {
    const mock = vi.fn(async () => response({ blockedReason: '新稿要求进入不存在的分支。' }))
    vi.stubGlobal('fetch', mock)
    await expect(adaptWriting(document, '凛：新稿', undefined)).rejects.toThrow('不存在的分支')
    expect(mock).toHaveBeenCalledTimes(1)
    expect(activeAdaptationCount()).toBe(0)
  })
  it('bounds failed repair attempts and never produces a partial result', async () => {
    const mock = vi.fn(async () => response({ ...good, assignments: [] }))
    vi.stubGlobal('fetch', mock)
    await expect(adaptWriting(document, '凛：新稿', undefined)).rejects.toThrow('源文件未修改')
    expect(mock).toHaveBeenCalledTimes(3)
  })
  it('repairs malformed model JSON without leaking partial output', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{broken' } }] })))
      .mockResolvedValueOnce(response(good))
    vi.stubGlobal('fetch', mock)
    expect((await adaptWriting(document, '凛：新稿\n旁白：第二句', undefined)).plan).toEqual(good)
    expect(mock).toHaveBeenCalledTimes(2)
  })
  it('cancels provider work when the request is aborted', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort()
      expect(init.signal?.aborted).toBe(true)
      throw new Error('aborted')
    }))
    await expect(adaptWriting(document, '凛：新稿', undefined, controller.signal)).rejects.toThrow('aborted')
    expect(activeAdaptationCount()).toBe(0)
  })
})
