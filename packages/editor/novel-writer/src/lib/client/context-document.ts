export interface ContextListItem {
  text: string
  children: ContextListItem[]
}

export type ContextBlock =
  | { type: 'heading', level: number, text: string }
  | { type: 'paragraph' | 'quote' | 'code', text: string }
  | { type: 'list', ordered: boolean, items: ContextListItem[] }

/** A text-only document projection. Project text is never interpreted as HTML or dialogue. */
export function contextBlocks(markdown: string): ContextBlock[] {
  const blocks: ContextBlock[] = []
  const lines = markdown.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) continue
    if (/^```/.test(line)) {
      const code: string[] = []
      while (++index < lines.length && !/^```/.test(lines[index])) code.push(lines[index])
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const listLine = /^(\s*)([-*+] |\d+\. )(.+)$/
    const first = listLine.exec(line)
    if (first) {
      const items: ContextListItem[] = []
      const stack: { indent: number, items: ContextListItem[] }[] = [{ indent: first[1].length, items }]
      do {
        const match = listLine.exec(lines[index])!
        const indent = match[1].length
        while (stack.length > 1 && indent < stack.at(-1)!.indent) stack.pop()
        let parent = stack.at(-1)!
        if (indent > parent.indent && parent.items.length) {
          parent = { indent, items: parent.items.at(-1)!.children }
          stack.push(parent)
        }
        parent.items.push({ text: match[3], children: [] })
        index++
      } while (index < lines.length && listLine.test(lines[index]))
      index--
      blocks.push({ type: 'list', ordered: /^\d/.test(first[2]), items })
      continue
    }
    const quote = /^>\s?/.test(line)
    const text = quote ? line.replace(/^>\s?/, '') : line
    const previous = blocks.at(-1)
    const type = quote ? 'quote' : 'paragraph'
    if (previous?.type === type && index > 0 && lines[index - 1].trim()) previous.text += `\n${text}`
    else blocks.push({ type, text })
  }
  return blocks
}
