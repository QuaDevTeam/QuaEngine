import type { PreviewIdentity } from '@quajs/editor-core'
import type { TemplateResult } from 'lit'
import { element, html, nothing, render } from '@quajs/editor-controls'
import { workbenchEmpty } from '../../shared/empty-state'
import { jsonTree, splitConsoleJson } from './json'

const logTokenPattern = /https?:\/\/\S+|\b(?:ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\b|[\w./-]+\.(?:qs|tsx?|js|mjs|rs)(?::\d+(?::\d+)?)?/giu
function logTone(message: string): 'error' | 'warning' | 'success' | 'debug' | 'normal' {
  if (/error|fatal|exception|failed|failure|panic|uncaught|错误|失败|异常|渲染失败/iu.test(message))
    return 'error'
  if (/warn(?:ing)?|deprecated|警告|注意/iu.test(message))
    return 'warning'
  if (/success|ready|started|running|listening|完成|成功|已启动|已连接/iu.test(message))
    return 'success'
  if (/debug|trace|verbose/iu.test(message))
    return 'debug'
  return 'normal'
}
function logText(message: string): (string | TemplateResult)[] {
  let cursor = 0
  const parts: (string | TemplateResult)[] = []
  for (const match of message.matchAll(logTokenPattern)) {
    const token = match[0]
    const start = match.index ?? 0
    parts.push(message.slice(cursor, start))
    const tone = /https?:\/\//iu.test(token) ? 'log-token-url' : /\.(?:qs|tsx?|js|mjs|rs)/iu.test(token) ? 'log-token-file' : `log-token-${token.toLowerCase().replace(/[^a-z]+/gu, '')}`
    parts.push(html`<span class=${tone}>${token}</span>`)
    cursor = start + token.length
  }
  parts.push(message.slice(cursor))
  return parts
}

const maxJsonLength = 2 * 1024 * 1024
const maxRetainedLength = 4 * 1024 * 1024
interface LogEntry { identity: PreviewIdentity, message: string, node: HTMLElement, incomplete: boolean, structured: boolean }
/** Retain bounded raw text and stable DOM so new output does not collapse inspected JSON. */
export class DebugConsole {
  private readonly entries: LogEntry[] = []
  private size = 0
  private readonly empty = workbenchEmpty('terminal', '暂无调试输出', '运行预览后，构建信息和日志会显示在这里。')
  constructor(private readonly host: HTMLElement) {
    this.empty.element.classList.add('console-empty')
    host.after(this.empty.element)
  }

  clear(): void {
    this.entries.length = 0
    this.size = 0
    render(nothing, this.host)
    this.empty.element.hidden = false
  }

  append(identity: PreviewIdentity, message: string): void {
    if (!message)
      return
    this.empty.element.hidden = true
    message = message.slice(0, maxJsonLength)
    const pinned = this.host.scrollHeight - this.host.scrollTop - this.host.clientHeight < 32
    const previous = this.entries.at(-1)
    let entry: LogEntry
    if (previous && previous.identity.sessionId === identity.sessionId && previous.incomplete && previous.message.length + message.length <= (previous.structured ? maxJsonLength : 64000)) {
      entry = previous
      entry.message += message
    }
    else {
      entry = { identity, message, node: element(html`<div></div>`), incomplete: false, structured: false }
      this.entries.push(entry)
    }
    this.size += message.length
    const parsed = splitConsoleJson(entry.message)
    entry.structured = parsed.incomplete || parsed.segments.some(segment => segment.value)
    if (!entry.structured && entry.message.length > 64000) {
      this.size -= entry.message.length - 64000
      entry.message = entry.message.slice(-64000)
      parsed.segments = [{ text: entry.message }]
    }
    const limit = this.entries.some(item => item.structured) ? maxRetainedLength : 64000
    while ((this.size > limit || this.entries.length > 150) && this.entries.length > 1) {
      const removed = this.entries.shift()!
      this.size -= removed.message.length
    }
    entry.incomplete = parsed.incomplete || (!entry.message.endsWith('\n') && !parsed.segments.some(segment => segment.value))
    render(html`${parsed.segments.map((segment) => {
      if (segment.value) {
        return html`<div class="log-line console-json" data-target=${identity.target}>${jsonTree(segment.value)}
          <button type="button" class="console-json-copy" @click=${(event: Event) => {
            const button = event.currentTarget as HTMLButtonElement
            void navigator.clipboard.writeText(segment.text).then(() => {
              button.textContent = '已复制'
            }).catch(() => {
              button.textContent = '复制失败'
            })
          }}>复制 JSON</button></div>`
      }
      const text = parsed.incomplete && segment === parsed.segments.at(-1) && segment.text.length > 320
        ? `${segment.text.slice(0, 320)}\n…正在接收 JSON…`
        : segment.text
      return (text.match(/[^\n]*(?:\n|$)/gu)?.filter(Boolean) || [])
        .filter(chunk => chunk.trim() || !parsed.segments.some(segment => segment.value))
        .map(chunk => html`<span class=${`log-line log-${logTone(chunk)}`} data-target=${identity.target}>${logText(chunk)}</span>`)
    })}`, entry.node)
    render(html`${this.entries.map(entry => entry.node)}`, this.host)
    if (pinned)
      this.host.scrollTop = this.host.scrollHeight
  }
}
