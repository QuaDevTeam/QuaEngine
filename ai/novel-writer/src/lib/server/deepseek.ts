import type { NovelWriterConfig, ToolCallRecord } from '$lib/types'

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  reasoning_content?: string | null
  tool_call_id?: string
  tool_calls?: DeepSeekToolCall[]
}

export interface DeepSeekToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface DeepSeekToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface RegisteredDeepSeekTool {
  definition: DeepSeekToolDefinition
  execute: (input: unknown) => Promise<unknown>
}

export interface DeepSeekRunResult<T> {
  content: T
  messages: DeepSeekMessage[]
  toolCalls: ToolCallRecord[]
}

export const defaultAgentRunTimeoutMs = 60 * 60 * 1000
export const defaultAgentContextMaxCharacters = 120_000

export class DeepSeekClient {
  constructor(private readonly config: NovelWriterConfig) {}

  async createJson<T>(options: {
    messages: DeepSeekMessage[]
    tools?: RegisteredDeepSeekTool[]
    agentId: string
    projectId: string
    reasoningEffort?: 'high' | 'max'
    maxToolRounds?: number
    runTimeoutMs?: number
    maxContextCharacters?: number
  }): Promise<DeepSeekRunResult<T>> {
    if (!this.config.deepSeekApiKey) {
      throw new Error('DeepSeek API key is not configured.')
    }

    let messages = [...options.messages]
    const toolCalls: ToolCallRecord[] = []
    const toolMap = new Map((options.tools || []).map(tool => [tool.definition.function.name, tool]))
    const maxToolRounds = options.maxToolRounds ?? 64
    const runTimeoutMs = options.runTimeoutMs ?? defaultAgentRunTimeoutMs
    const startedAt = Date.now()

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const assistant = await this.request(messages, {
        tools: options.tools?.map(tool => tool.definition),
        reasoningEffort: options.reasoningEffort,
        timeoutMs: remainingRunMs(startedAt, runTimeoutMs, options.agentId),
      })
      messages.push(assistant)

      if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
        const content = assistant.content || '{}'
        return {
          content: JSON.parse(content) as T,
          messages,
          toolCalls,
        }
      }

      for (const call of assistant.tool_calls) {
        remainingRunMs(startedAt, runTimeoutMs, options.agentId)
        const toolStartedAt = new Date().toISOString()
        const record: ToolCallRecord = {
          id: call.id,
          projectId: options.projectId,
          agentId: options.agentId,
          toolName: call.function.name,
          input: safeParse(call.function.arguments),
          startedAt: toolStartedAt,
        }
        try {
          const tool = toolMap.get(call.function.name)
          if (!tool) {
            throw new Error(`Tool is not registered: ${call.function.name}`)
          }
          const output = await tool.execute(record.input)
          record.output = output
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(output),
          })
        }
        catch (error) {
          record.error = error instanceof Error ? error.message : String(error)
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ error: record.error }),
          })
        }
        finally {
          record.endedAt = new Date().toISOString()
          toolCalls.push(record)
        }
      }

      messages = compactDeepSeekMessages(
        messages,
        toolCalls,
        options.maxContextCharacters ?? defaultAgentContextMaxCharacters,
        options.agentId,
      )
    }

    throw new Error(`DeepSeek tool call loop exceeded ${maxToolRounds} rounds.`)
  }

  private async request(messages: DeepSeekMessage[], options: {
    tools?: DeepSeekToolDefinition[]
    reasoningEffort?: 'high' | 'max'
    timeoutMs: number
  }): Promise<DeepSeekMessage> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    let response: Response
    try {
      response = await fetch(`${this.config.deepSeekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.deepSeekApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.deepSeekModel,
          messages,
          tools: options.tools && options.tools.length > 0 ? options.tools : undefined,
          thinking: { type: 'enabled' },
          reasoning_effort: options.reasoningEffort || this.config.defaultReasoningEffort,
          response_format: { type: 'json_object' },
        }),
      })
    }
    catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`DeepSeek request timed out after ${formatDuration(options.timeoutMs)}.`)
      }
      throw error
    }
    finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`DeepSeek request failed: ${response.status} ${text.slice(0, 500)}`)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: DeepSeekMessage }>
    }
    const message = payload.choices?.[0]?.message
    if (!message) {
      throw new Error('DeepSeek response did not include a message.')
    }
    return message
  }
}

export function compactDeepSeekMessages(
  messages: DeepSeekMessage[],
  toolCalls: ToolCallRecord[],
  maxCharacters = defaultAgentContextMaxCharacters,
  agentId = 'agent',
): DeepSeekMessage[] {
  if (estimateCharacters(messages) <= maxCharacters || messages.length <= 3) {
    return messages
  }

  const [systemMessage, userMessage, ...history] = messages
  const tailBudget = Math.max(12_000, Math.floor(maxCharacters * 0.45))
  const retainedTail = trimLeadingToolMessages(retainTail(history, tailBudget))
  const retainedToolIds = new Set(
    retainedTail
      .filter(message => message.role === 'tool' && message.tool_call_id)
      .map(message => message.tool_call_id as string),
  )
  const compactedToolCalls = toolCalls.filter(call => !retainedToolIds.has(call.id))
  const summary: DeepSeekMessage = {
    role: 'user',
    content: buildCompactionSummary(agentId, history.length - retainedTail.length, compactedToolCalls),
  }
  const compacted = [systemMessage, userMessage, summary, ...retainedTail].filter(Boolean)

  if (estimateCharacters(compacted) <= maxCharacters) {
    return compacted
  }
  return [systemMessage, userMessage, summary].filter(Boolean)
}

function retainTail(messages: DeepSeekMessage[], maxCharacters: number): DeepSeekMessage[] {
  const retained: DeepSeekMessage[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const size = estimateCharacters([message])
    if (retained.length > 0 && used + size > maxCharacters) {
      break
    }
    retained.unshift(message)
    used += size
  }
  return retained
}

function trimLeadingToolMessages(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  const firstNonTool = messages.findIndex(message => message.role !== 'tool')
  return firstNonTool <= 0 ? messages : messages.slice(firstNonTool)
}

function buildCompactionSummary(agentId: string, omittedMessages: number, toolCalls: ToolCallRecord[]): string {
  const lines = [
    `Compressed ReAct context for agent "${agentId}".`,
    `${Math.max(omittedMessages, 0)} older assistant/tool messages were compacted to preserve the current specialist's independent context.`,
  ]

  if (toolCalls.length > 0) {
    lines.push('Older tool-call summary:')
    for (const call of toolCalls.slice(-20)) {
      lines.push(`- ${call.toolName}: input=${summarizeValue(call.input)} output=${summarizeValue(call.output)} error=${call.error || 'none'}`)
    }
    if (toolCalls.length > 20) {
      lines.push(`- ... ${toolCalls.length - 20} earlier tool calls omitted from this compact summary.`)
    }
  }

  return lines.join('\n').slice(0, 8_000)
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    return value.slice(0, 240)
  }
  try {
    return JSON.stringify(value).slice(0, 240)
  }
  catch {
    return String(value).slice(0, 240)
  }
}

function estimateCharacters(messages: DeepSeekMessage[]): number {
  return JSON.stringify(messages).length
}

function remainingRunMs(startedAt: number, runTimeoutMs: number, agentId: string): number {
  const remaining = runTimeoutMs - (Date.now() - startedAt)
  if (remaining <= 0) {
    throw new Error(`Agent "${agentId}" exceeded the maximum runtime of ${formatDuration(runTimeoutMs)}.`)
  }
  return remaining
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function formatDuration(timeoutMs: number): string {
  if (timeoutMs >= 60 * 60 * 1000) {
    return `${Math.round(timeoutMs / 60 / 60 / 1000)} hour(s)`
  }
  if (timeoutMs >= 60 * 1000) {
    return `${Math.round(timeoutMs / 60 / 1000)} minute(s)`
  }
  return `${Math.round(timeoutMs / 1000)} second(s)`
}
