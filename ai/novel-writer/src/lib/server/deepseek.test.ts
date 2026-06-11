import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekClient, compactDeepSeekMessages } from './deepseek'
import type { DeepSeekMessage } from './deepseek'
import type { ToolCallRecord } from '$lib/types'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeepSeek ReAct context compaction', () => {
  it('keeps the current agent prompt and task while compacting older tool loops', () => {
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: 'You are the outline expert.' },
      { role: 'user', content: JSON.stringify({ stage: 'outline', context: 'current task' }) },
      ...Array.from({ length: 20 }, (_, index): DeepSeekMessage => ({
        role: index % 2 === 0 ? 'assistant' : 'tool',
        content: `older message ${index} ${'x'.repeat(400)}`,
        tool_call_id: index % 2 === 1 ? `tool-${index}` : undefined,
      })),
    ]
    const toolCalls: ToolCallRecord[] = Array.from({ length: 10 }, (_, index) => ({
      id: `tool-${index * 2 + 1}`,
      projectId: 'p1',
      agentId: 'outline_writer',
      toolName: 'tavily_search',
      input: { query: `query ${index}` },
      output: { references: [`result ${index}`] },
      startedAt: '0',
      endedAt: '1',
    }))

    const compacted = compactDeepSeekMessages(messages, toolCalls, 6_000, 'outline_writer')

    expect(compacted[0]?.content).toBe('You are the outline expert.')
    expect(compacted[1]?.content).toContain('current task')
    expect(compacted.some(message => message.content?.includes('Compressed ReAct context'))).toBe(true)
    expect(JSON.stringify(compacted).length).toBeLessThanOrEqual(6_000)
  })

  it('streams assistant content deltas while preserving the final JSON result', async () => {
    const encoded = new TextEncoder()
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.stream).toBe(true)
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoded.encode('data: {"choices":[{"delta":{"content":"{\\"markdown\\":\\"# 标题"}}]}\n\n'))
          controller.enqueue(encoded.encode('data: {"choices":[{"delta":{"content":"\\\\n正文\\",\\"data\\":{\\"ok\\":true}}"}}]}\n\n'))
          controller.enqueue(encoded.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new DeepSeekClient({
      deepSeekApiKey: 'test-key',
      deepSeekBaseUrl: 'https://api.deepseek.com',
      deepSeekModel: 'deepseek-v4-pro',
      defaultReasoningEffort: 'high',
      tavilyBaseUrl: 'https://api.tavily.com',
      defaultMaxRevisionLoops: 50,
    })
    const deltas: string[] = []

    const result = await client.createJson<{ markdown: string, data: { ok: boolean } }>({
      projectId: 'p1',
      agentId: 'streaming_agent',
      messages: [{ role: 'user', content: 'stream json' }],
      onContentDelta: delta => {
        deltas.push(delta.content)
      },
    })

    expect(deltas).toEqual(['{"markdown":"# 标题', '\\n正文","data":{"ok":true}}'])
    expect(result.content).toEqual({
      markdown: '# 标题\n正文',
      data: { ok: true },
    })
  })
})
