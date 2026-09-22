import { element, html, nothing, render } from '@quajs/editor-controls'

export interface ConsoleSegment { text: string, value?: object }

/** Recognize strict JSON within ordinary log prefixes; never evaluate logged code. */
export function splitConsoleJson(text: string): { segments: ConsoleSegment[], incomplete: boolean } {
  const segments: ConsoleSegment[] = []
  let plain = 0
  let attempts = 0
  for (let start = 0; start < text.length && attempts < 100; start++) {
    if (text[start] !== '{' && text[start] !== '[')
      continue
    attempts++
    let depth = 0
    let quoted = false
    let escaped = false
    let end = start
    for (; end < text.length; end++) {
      const char = text[end]
      if (quoted) {
        if (escaped)
          escaped = false
        else if (char === '\\')
          escaped = true
        else if (char === '"')
          quoted = false
      }
      else if (char === '"') {
        quoted = true
      }
      else if (char === '{' || char === '[') {
        depth++
      }
      else if ((char === '}' || char === ']') && --depth === 0) {
        break
      }
    }
    if (depth !== 0) {
      // Only retain a plausible JSON prefix across process stdout chunks.
      if (/^(?:\{\s*(?:"|$)|\[\s*(?:[\d\-"{[\]]|true|false|null|$))/u.test(text.slice(start))) {
        segments.push({ text: text.slice(plain) })
        return { segments, incomplete: true }
      }
      continue
    }
    const raw = text.slice(start, end + 1)
    try {
      const value = JSON.parse(raw) as object
      if (start > plain)
        segments.push({ text: text.slice(plain, start) })
      segments.push({ text: raw, value })
      plain = end + 1
      start = end
    }
    catch { /* Ordinary brackets and non-JSON log output remain text. */ }
  }
  if (plain < text.length)
    segments.push({ text: text.slice(plain) })
  return { segments, incomplete: false }
}

/** Children are created only when expanded, with paging for wide arrays/objects. */
export function jsonTree(value: unknown, key?: string, depth = 0): HTMLElement {
  const composite = value !== null && typeof value === 'object'
  const keys = composite ? Object.keys(value) : []
  const label = html`${key === undefined ? nothing : html`<span class="console-json-key">${key}: </span>`}
    <span class=${`console-json-${value === null ? 'null' : typeof value}`}>${composite ? Array.isArray(value) ? `Array(${keys.length}) […]` : `Object {${keys.length}}` : JSON.stringify(value)}</span>`
  if (!composite)
    return element(html`<div class="console-json-node">${label}</div>`)
  let offset = 0
  const nodes: HTMLElement[] = []
  const children = element(html`<div class="console-json-children"></div>`)
  const appendPage = (): void => {
    const end = Math.min(offset + 100, keys.length)
    for (; offset < end; offset++) {
      const name = keys[offset]
      nodes.push(jsonTree((value as Record<string, unknown>)[name], name, depth + 1))
    }
    render(html`${nodes}${offset < keys.length ? html`<button type="button" class="console-json-more" @click=${appendPage}>再显示 ${Math.min(100, keys.length - offset)} 项（剩余 ${keys.length - offset}）</button>` : nothing}`, children)
  }
  return element(html`<details class="console-json-node" @toggle=${(event: Event) => {
    if (!(event.currentTarget as HTMLDetailsElement).open) {
      nodes.length = 0
      offset = 0
      render(nothing, children)
    }
    else if (!offset) {
      if (depth >= 80)
        render('已达到 80 层展开上限；可复制原始 JSON 查看。', children)
      else appendPage()
    }
  }}><summary>${label}</summary>${children}</details>`)
}
