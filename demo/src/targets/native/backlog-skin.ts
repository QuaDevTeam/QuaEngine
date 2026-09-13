import type { BacklogEntry } from '@quajs/plugin-backlog'
import type { NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler'

const paper = '#f5f3eb', ink = '#29453f', sea = '#42796e', line = '#c7d2c5'
const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
const text = (id: string, value: string, rect: Node['bounds'], fontSize: number, lineHeight: number, color = ink): Node => ({
  id, kind: 'Text', bounds: rect, visible: true, text: value,
  style: { fontFamily: ['Noto Sans'], fontSize, lineHeight, color, whiteSpace: 'pre-wrap' },
})

/** Continuous transcript of the plugin's readonly entries. Reuse official
 * replay/rewind intents and provenance; scroll navigation is renderer-local. */
export function layoutDemoBacklog(root: Node, entries: readonly BacklogEntry[], width: number, height: number): Node {
  const nodes = new Map<string, Node>()
  const collect = (n: Node) => { nodes.set(n.id, n); n.children?.forEach(collect) }
  collect(root)
  const px = (width - 1460) / 2, py = (height - 930) / 2
  const left = px + 67, top = py + 41, contentWidth = 1326
  const scrollY = top + 83, scrollHeight = 709
  let y = scrollY + 30
  const rows = entries.map((entry, index) => {
    const original = nodes.get(`backlog-entry-${entries.length - 1 - index}`)!
    const id = `backlog-entry-${index}`
    const speaker = entry.speaker || ''
    const isChoice = entry.kind === 'choice'
    const body = isChoice ? (entry.choices || []).map(choice => choice.text).join('\n') : entry.text || ''
    const bodyWidth = 1288 - (speaker ? 188 : 0) - (isChoice ? 54 : 0)
    const font = isChoice ? 25 : 27, lineHeight = isChoice ? 45 : 51.3
    const lines = body.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(
      [...line].reduce((ems, c) => ems + (c.charCodeAt(0) < 128 ? 0.55 : 1), 0) * font / bodyWidth,
    )), 0)
    const h = lines * lineHeight + (isChoice ? 36 : 24)
    if (isChoice) y += 18
    const x = left + 8, bodyX = x + (speaker ? 188 : 0) + (isChoice ? 28 : 0)
    const bodyY = y + (isChoice ? 18 : 12)
    const children: Node[] = [text(`${id}-body`, body, bounds(bodyX, bodyY, bodyWidth, lines * lineHeight), font, lineHeight, speaker ? ink : '#5b6a62')]
    if (speaker) children.push({ ...text(`${id}-speaker`, speaker, bounds(x, bodyY + 3, 156, 44.4), 24, 44.4, sea), style: { ...text('', '', bounds(0, 0, 0, 0), 24, 44.4, sea).style, fontWeight: 500 } })
    const jump = original?.children?.find(n => n.id.endsWith('-jump'))
    const voice = original?.children?.find(n => n.id.endsWith('-voice'))
    if (voice) children.push({ ...voice, id: `${id}-voice`, bounds: bounds(x + 1182, y + h - 44, 106, 44), style: { color: sea, fontSize: 18, textAlign: 'center' }, text: '重听' })
    const row: Node = { ...original, id, kind: 'Panel', bounds: bounds(x, y, 1288, h), visible: true,
      style: isChoice ? { backgroundColor: '#e3ebe25e', borderLeftWidth: 2, borderLeftColor: sea } : {},
      children, ...(jump ? { intent: jump.intent, interactive: true } : {}),
    }
    y += h + (isChoice ? 18 : 0)
    return row
  })
  const footerY = py + 833
  const button = (id: string, label: string, x: number, edge: string): Node => ({
    id, kind: 'Button', bounds: bounds(x, footerY + 19, 122, 52), text: label, visible: true,
    style: { fontFamily: ['Noto Sans'], fontSize: 20, lineHeight: 30, color: ink, textAlign: 'center', borderColor: line, borderWidth: 1, borderRadius: 3 },
    stateStyles: { hover: { bounds: bounds(x, footerY + 19, 122, 52), style: { backgroundColor: '#e3ebe2', borderColor: sea } }, 'focus-visible': { bounds: bounds(x, footerY + 19, 122, 52), style: { borderColor: sea } } },
    intent: { event: 'ui/intent', action: 'demo-backlog-scroll', metadata: { nodeId: 'backlog-scroll', edge } },
  })
  return { ...root, children: [
    { ...nodes.get('backlog-backdrop')!, bounds: bounds(0, 0, width, height), style: { backgroundColor: '#183b344d', backdropFilter: { blurRadius: 12 } } },
    { ...nodes.get('backlog-panel')!, bounds: bounds(px, py, 1460, 930), style: { backgroundColor: paper, backgroundImage: { assetType: 'images', assetName: 'ui/paper-grain.png' }, backgroundSize: 'none', backgroundPosition: { x: 0, y: 0 }, borderColor: line, borderWidth: 1, borderRadius: 4,
      boxShadow: { offsetX: 0, offsetY: 18, blurRadius: 64, spreadRadius: 0, color: '#102e2926', inset: false } }, children: [
      { ...text('backlog-title', '对话记录', bounds(left, top + 2, 1000, 54), 40, 54), style: { color: ink, fontFamily: ['Noto Serif'], fontSize: 40, lineHeight: 54, fontWeight: 500, letterSpacing: 0.8 } },
      { ...nodes.get('backlog-close')!, bounds: bounds(left + contentWidth - 142, top, 142, 58), text: '返回阅读', style: { color: ink, fontFamily: ['Noto Sans'], fontSize: 22, lineHeight: 32, textAlign: 'center', borderColor: line, borderWidth: 1, borderRadius: 3 } },
      { id: 'backlog-divider', kind: 'Panel', visible: true, bounds: bounds(left, top + 82, contentWidth, 1), style: { backgroundColor: line } },
      { ...nodes.get('backlog-scroll')!, bounds: bounds(left, scrollY, contentWidth, scrollHeight), clipChildren: true,
        scrollOffsetY: Math.max(0, y + 30 - scrollY - scrollHeight),
        children: [...rows, { id: 'backlog-bottom-padding', kind: 'Box', visible: true, bounds: bounds(left, y, 1, 30) }],
      },
      { id: 'backlog-footer-divider', kind: 'Panel', visible: true, bounds: bounds(left, footerY, contentWidth, 1), style: { backgroundColor: line } },
      text('backlog-hint', '向上滚动，查看前文', bounds(left, footerY + 31, 800, 27), 18, 27, '#61736b'),
      button('backlog-earliest', '最早记录', left + contentWidth - 256, 'start'),
      button('backlog-latest', '最近记录', left + contentWidth - 122, 'end'),
    ] },
  ] }
}
