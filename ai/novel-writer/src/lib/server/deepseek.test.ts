import { describe, expect, it } from 'vitest'
import { compactDeepSeekMessages } from './deepseek'
import type { DeepSeekMessage } from './deepseek'
import type { ToolCallRecord } from '$lib/types'

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
})
