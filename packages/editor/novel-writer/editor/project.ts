import type { EditorDocument, EditorProject, EditorStoryNode, EditorWritingContext } from '@quajs/editor-core'
import { dialogues } from './source.js'

/** Uses the editor's existing index, never executes project code or scans another tree. */
export async function extractWritingContext(project: EditorProject, read: (path: string) => Promise<EditorDocument>): Promise<EditorWritingContext> {
  const result: EditorWritingContext = { root: project.root, name: project.name, outline: '', worldbuilding: '', characters: '', sources: [], warnings: [] }
  const outline: string[] = ['> 已保存源码的 Story Tree；分组顺序不代表运行顺序。', '']
  let nodes = 0
  const visit = (items: EditorStoryNode[], depth: number): void => {
    for (const item of items) {
      if (++nodes > 1000 || depth > 20)
        continue
      outline.push(`${'  '.repeat(depth)}- ${item.kind}: ${item.title} [${item.id}]${item.filePath ? ` (${item.filePath}:${item.line ?? 1})` : ''}`)
      if (item.filePath)
        result.sources.push({ path: item.filePath, line: item.line ?? 1, kind: 'story' })
      visit(item.children, depth + 1)
    }
  }
  visit(project.story, 0)
  if (nodes) result.outline = outline.join('\n').slice(0, 48000)
  if (nodes > 1000) result.warnings.push('Story Tree 超过 1000 项，已截取。')
  const docs = project.entries.filter(entry => entry.kind === 'document' && /\.(?:md|txt|json)$/iu.test(entry.path)
    && /(?:worldbuilding|story[-_]?background|characters?|世界观|故事背景|角色设定|人物设定)(?:[./_-]|$)/iu.test(entry.path))
  for (const entry of docs.slice(0, 16)) {
    if (entry.size > 48000) {
      result.warnings.push(`${entry.path} 超过设定读取上限，未读取。`)
      continue
    }
    try {
      const document = await read(entry.path)
      const field = /character|角色|人物/iu.test(entry.path) ? 'characters' : 'worldbuilding'
      result[field] += `\n# ${entry.path}\n${document.text}\n`
      result[field] = result[field].slice(0, 48000)
      result.sources.push({ path: entry.path, line: 1, kind: field })
    }
    catch { result.warnings.push(`${entry.path} 读取失败。`) }
  }
  const catalog = project.plugins?.['qua.character']?.data as { characters?: { id: { value: string }, displayName: { value: string }, aliases: string[], source: { path: string, line: number } }[] } | undefined
  if (!result.characters && catalog?.characters?.length) {
    result.characters = `> 静态角色信息；未定义的性格、生平仍待补充。\n\n${catalog.characters.slice(0, 200).map(item => `## ${item.displayName.value}\n- 标识：${item.id.value}${item.aliases.length ? `\n- 别名：${item.aliases.join('、')}` : ''}\n- 来源：${item.source.path}:${item.source.line}`).join('\n\n')}`.slice(0, 48000)
  }
  if (!result.worldbuilding || !result.characters) {
    const excerpts: string[] = []
    const speakers = new Set<string>()
    let remaining = 18000
    for (const entry of project.entries.filter(entry => entry.path.endsWith('.qs')).slice(0, 40)) {
      if (remaining <= 0) break
      try {
        const document = await read(entry.path)
        const content = dialogues(document.text)
        for (const line of content) if (line.character) speakers.add(line.character)
        const excerpt = content.map(line => `${line.character ?? '旁白'}：${line.text}`).join('\n').slice(0, Math.min(2400, remaining))
        remaining -= excerpt.length
        excerpts.push(`### ${entry.path}\n${excerpt}`)
        result.sources.push({ path: entry.path, line: 1, kind: 'excerpt' })
      }
      catch { result.warnings.push(`${entry.path} 无法解析，未当作空故事处理。`) }
    }
    if (!result.worldbuilding && excerpts.length)
      result.worldbuilding = `> 尚无独立背景设定。以下是有限的 QS 正文证据，不代表完整设定。\n\n${excerpts.join('\n\n')}`
    if (!result.characters && speakers.size)
      result.characters = `> 尚无角色设定，以下为正文中已出现的角色与摘录。\n\n## 出场角色\n${[...speakers].map(speaker => `- ${speaker}`).join('\n')}\n\n## 正文摘录\n${excerpts.join('\n\n')}`
    if (project.entries.filter(entry => entry.path.endsWith('.qs')).length > 40 || remaining <= 0)
      result.warnings.push('背景和角色提取仅使用有界正文摘录，并非全稿分析。')
  }
  result.warnings.push(...project.diagnostics.filter(item => item.severity === 'error').slice(0, 10).map(item => item.message))
  return result
}
