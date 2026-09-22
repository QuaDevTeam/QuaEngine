export interface WritingDiffLine {
  kind: 'same' | 'added' | 'removed' | 'gap'
  text: string
  before?: number
  after?: number
}

/** Bounded look-ahead keeps large drafts responsive. Every line is retained,
 * even when repeated lines have more than one valid visual alignment. */
export function writingDiff(before: string, after: string): { rows: WritingDiffLine[], added: number, removed: number, truncated: boolean } {
  const a = before ? before.split(/\r?\n/u) : []
  const b = after ? after.split(/\r?\n/u) : []
  const rows: WritingDiffLine[] = []
  let i = 0; let j = 0; let added = 0; let removed = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i], before: ++i, after: ++j })
      continue
    }
    const next = new Map<string, number>()
    for (let n = j; n < Math.min(j + 80, b.length); n++) if (!next.has(b[n])) next.set(b[n], n)
    let match: { x: number, y: number } | undefined
    for (let n = i; n < Math.min(i + 80, a.length); n++) {
      const y = next.get(a[n])
      if (y !== undefined && (!match || n - i + y - j < match.x - i + match.y - j)) match = { x: n, y }
    }
    const endA = match?.x ?? Math.min(i + 80, a.length)
    const endB = match?.y ?? Math.min(j + 80, b.length)
    while (i < endA) { rows.push({ kind: 'removed', text: a[i], before: ++i }); removed++ }
    while (j < endB) { rows.push({ kind: 'added', text: b[j], after: ++j }); added++ }
  }
  const compact: WritingDiffLine[] = []
  for (let index = 0; index < rows.length;) {
    if (rows[index].kind !== 'same') { compact.push(rows[index++]); continue }
    let end = index
    while (end < rows.length && rows[end].kind === 'same') end++
    if (end - index > 8) {
      compact.push(...rows.slice(index, index + 3), { kind: 'gap', text: `${end - index - 6} 行未修改` }, ...rows.slice(end - 3, end))
    }
    else compact.push(...rows.slice(index, end))
    index = end
  }
  return { rows: compact.slice(0, 2000), added, removed, truncated: compact.length > 2000 }
}
