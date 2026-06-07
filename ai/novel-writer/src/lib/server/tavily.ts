import type { NovelWriterConfig, SearchReference } from '$lib/types'

export interface TavilySearchInput {
  query: string
  search_depth?: 'basic' | 'advanced'
  topic?: 'general' | 'news' | 'finance'
  time_range?: 'day' | 'week' | 'month' | 'year'
  include_answer?: boolean
  include_raw_content?: boolean | 'markdown' | 'text'
  include_domains?: string[]
  exclude_domains?: string[]
  max_results?: number
}

interface TavilySearchResult {
  title?: string
  url?: string
  content?: string
  raw_content?: string
  score?: number
  published_date?: string
}

interface TavilySearchResponse {
  answer?: string
  results?: TavilySearchResult[]
}

export class TavilySearchTool {
  constructor(private readonly config: NovelWriterConfig) {}

  definition() {
    return {
      type: 'function' as const,
      function: {
        name: 'tavily_search',
        description: 'Search the web for factual references, background research, and setting details.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            search_depth: { type: 'string', enum: ['basic', 'advanced'] },
            topic: { type: 'string', enum: ['general', 'news', 'finance'] },
            time_range: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
            include_answer: { type: 'boolean' },
            include_raw_content: {
              anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['markdown', 'text'] }],
            },
            include_domains: { type: 'array', items: { type: 'string' } },
            exclude_domains: { type: 'array', items: { type: 'string' } },
            max_results: { type: 'number' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    }
  }

  async search(input: TavilySearchInput): Promise<{ answer?: string, references: SearchReference[] }> {
    if (!this.config.tavilyApiKey) {
      throw new Error('Tavily API key is not configured.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    let response: Response
    try {
      response = await fetch(`${this.config.tavilyBaseUrl.replace(/\/$/, '')}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.tavilyApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          query: input.query,
          search_depth: input.search_depth || 'basic',
          topic: input.topic || 'general',
          time_range: input.time_range,
          include_answer: input.include_answer ?? true,
          include_raw_content: input.include_raw_content ?? 'markdown',
          include_domains: input.include_domains,
          exclude_domains: input.exclude_domains,
          max_results: input.max_results ?? 5,
        }),
      })
    }
    catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Tavily request timed out after 60 seconds.')
      }
      throw error
    }
    finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Tavily request failed: ${response.status} ${text.slice(0, 500)}`)
    }

    const payload = await response.json() as TavilySearchResponse
    return {
      answer: payload.answer,
      references: normalizeTavilyReferences(input.query, payload.results || []),
    }
  }
}

export function normalizeTavilyReferences(query: string, results: TavilySearchResult[]): SearchReference[] {
  return results
    .filter(result => result.title && result.url)
    .map(result => ({
      title: result.title || 'Untitled',
      url: result.url || '',
      content: result.content,
      rawContent: result.raw_content,
      score: result.score,
      publishedDate: result.published_date,
      query,
      source: 'tavily',
    }))
}
