import { html } from '@quajs/editor-controls'

export type BuildLogTone = 'normal' | 'info' | 'success' | 'warning' | 'error'

/** Presentation only: progress and completion come exclusively from structured events. */
export function buildLogTone(line: string): BuildLogTone {
  const trimmed = line.trimStart()
  const prefix = trimmed.match(/^(?:\[[^\]\n]{1,80}\]\s*){1,3}/u)?.[0] ?? ''
  const text = trimmed.slice(prefix.length)
  if (/\[(?:error|fatal)\]/iu.test(prefix))
    return 'error'
  if (/\[warn(?:ing)?\]/iu.test(prefix))
    return 'warning'
  if (/^(?:(?:error(?:\[\w+\])?|fatal|panic(?:ked)?|failed|failure)(?=[:\s]|$)|\w*Error:|[×✖✗]|错误|失败|异常)|^thread .+ panicked\b/iu.test(text))
    return 'error'
  if (/^(?:(?:warn(?:ing)?|deprecated)(?=[:\s]|$)|\(!\)|⚠|警告|注意)/iu.test(text))
    return 'warning'
  if (/^(?:✓|✔|(?:success|finished)(?=[:\s]|$)|application ready:|build (?:completed|succeeded)\b|完成|成功|产物已生成)/iu.test(text))
    return 'success'
  if (/^(?:(?:info|building|bundling|compiling|checking|signing|pinning)(?=[:\s]|$)|native runtime:|vite v\d|正在)/iu.test(text))
    return 'info'
  return 'normal'
}

const tokens = /\[(?:info|warn(?:ing)?|error|fatal|debug|trace|success)\]|https?:\/\/[^\s<>]+|(?:[\p{L}\p{N}_@.+()~-]+[\\/])*[\p{L}\p{N}_@.+()~-]+\.(?:qs|[cm]?[jt]sx?|rs|json|ya?ml|toml|qpk|app|icns|wasm|css|html|png|webp)(?::\d+(?::\d+)?)?\b|\b\d+(?:\.\d+)?\s?(?:ms|s|secs?|seconds?|minutes?|[kMG]i?B)\b/giu

export function buildLogText(line: string) {
  // Minified bundles and unusually long diagnostics stay literal; never scan
  // arbitrary-length tool output with the presentation token expression.
  if (line.length > 2048)
    return [line]
  let cursor = 0
  const parts = []
  for (const match of line.matchAll(tokens)) {
    const token = match[0]
    parts.push(line.slice(cursor, match.index))
    const kind = token.startsWith('[') ? `level-${token.slice(1, -1).toLowerCase()}` : /^https?:/u.test(token) ? 'url' : /^\d+(?:\.\d+)?\s?(?:ms|s|secs?|seconds?|minutes?|[kMG]i?B)$/iu.test(token) ? 'metric' : 'file'
    parts.push(html`<span class=${`build-log-${kind}`}>${token}</span>`)
    cursor = match.index + token.length
  }
  parts.push(line.slice(cursor))
  return parts
}

export function buildLogView(log: string) {
  // Bound nodes even when the host's 64 kB tail contains thousands of empty lines.
  const lines = log.slice(-64000).match(/[^\n]*(?:\n|$)/gu)?.filter(Boolean) ?? []
  const retained = lines.slice(-1200)
  return html`${lines.length > retained.length ? html`<span class="build-log-truncated">仅显示最近 1200 行。\n</span>` : ''}${retained.map(line => html`<span class="build-log-line" data-tone=${buildLogTone(line)}>${buildLogText(line)}</span>`)}`
}
