import type { NativeUiSurfaceNodeProjection as Node, NativeUiSurfaceRect as Rect } from '@quajs/native-ui-compiler'

const paper = '#f5f3eb'
const sheet = '#fffdf7'
const ink = '#29453f'
const sea = '#42796e'
const line = '#c7d2c5'
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

/**
 * Product layout of the official settings controls. Every value/option and
 * intent still comes from the settings plugin; this holds no preference state.
 */
export function layoutDemoSettings(root: Node, width: number, height: number): Node {
  const nodes = new Map<string, Node>()
  const collect = (node: Node) => {
    nodes.set(node.id, node)
    node.children?.forEach(collect)
  }
  collect(root)
  const panelWidth = 1360
  const panelHeight = 796.15
  const px = (width - panelWidth) / 2
  const py = (height - panelHeight) / 2
  const left = px + 53
  const top = py + 45
  const content = panelWidth - 106
  const firstWidth = (content - 48) * 1.12 / 2.12
  const secondWidth = content - 48 - firstWidth
  const secondX = left + firstWidth + 48
  const textStyle = (fontSize: number, lineHeight: number, color = ink) => ({ fontFamily: ['Noto Sans'], fontSize, lineHeight, color, letterSpacing: 0 })
  const make = (source: Node, bounds: Rect, style: Node['style'], text = source.text, children?: Node[]): Node => ({
    ...source,
    bounds,
    style,
    text,
    children,
    stateStyles: source.stateStyles
      ? Object.fromEntries(Object.keys(source.stateStyles).map(key => [key, { bounds, style: { borderColor: sea, backgroundColor: '#e3ebe2' } }]))
      : undefined,
  })
  const get = (id: string) => {
    const node = nodes.get(id)
    if (!node)
      throw new Error(`Missing demo settings projection ${id}`)
    return node
  }
  const named = (id: string, bounds: Rect, style: Node['style'], text?: string, children?: Node[]) => make(get(id), bounds, style, text, children)
  const divider = (id: string, bounds: Rect): Node => ({ id, kind: 'Divider', bounds, visible: true, style: { backgroundColor: line } })
  const group = (key: string, label: string, x: number, y: number, w: number): Node[] => [
    { id: `demo-settings-group-${key}`, kind: 'Text', bounds: rect(x + 16, y + 8, w - 32, 29), text: label, visible: true, style: textStyle(19, 29, sea) },
    divider(`demo-settings-group-${key}-line`, rect(x, y + 49, w, 1)),
  ]
  const field = (key: string, x: number, y: number, w: number, h: number, description?: string): Node => {
    const source = [...nodes.values()].find(n => n.id.startsWith('settings-field-') && n.id.endsWith(`-${key}`))!
    if (!source)
      throw new Error(`Missing settings field ${key}`)
    const id = source.id
    const innerX = x + 16
    const innerWidth = w - 32
    const children: Node[] = [
      make(get(`${id}-label`), rect(innerX, y + 22, innerWidth, 34.5), textStyle(23, 34.5)),
      divider(`${id}-divider`, rect(x, y + h - 1, w, 1)),
    ]
    if (description)
      children.push({ id: `${id}-description`, kind: 'Text', bounds: rect(innerX, y + 64.5, innerWidth, 28.05), text: description, visible: true, style: textStyle(17, 28.05, '#61736b'), provenance: source.provenance })
    const cy = y + (description ? 112.55 : 76.5)
    const slider = nodes.get(`${id}-slider-control`)
    const select = nodes.get(`${id}-select`)
    const toggle = nodes.get(`${id}-switch-track`)
    if (slider?.control) {
      const format = (label: string) => key === 'textSpeedCps' ? `每秒 ${Math.round(Number.parseFloat(label))} 字` : `${(Number.parseFloat(label) / 1000).toFixed(1)} 秒`
      const options = slider.control.options.map(o => ({ ...o, label: format(o.label) }))
      const value = options[slider.control.selectedIndex]?.label || ''
      const progress = slider.control.selectedIndex / Math.max(1, options.length - 1)
      const tw = innerWidth - 116 - 26
      const tx = innerX + (tw - 23) * progress + 11.5
      const ty = cy + 24
      children.push(make({ ...slider, control: { ...slider.control, options } }, rect(innerX + 11.5, cy + 3, tw - 23, 42), { backgroundColor: 'transparent' }, undefined, [
        named(`${id}-slider-track`, rect(innerX, ty - 2.5, tw, 5), { backgroundColor: line, borderRadius: 3 }),
        named(`${id}-slider-progress`, rect(innerX, ty - 2.5, tw * progress, 5), { backgroundColor: sea, borderRadius: 3 }),
        named(`${id}-slider-thumb-halo`, rect(tx - 12.5, ty - 12.5, 25, 25), { backgroundColor: paper, borderColor: sea, borderWidth: 1, borderRadius: 13 }),
        named(`${id}-slider-thumb`, rect(tx - 11.5, ty - 11.5, 23, 23), { backgroundColor: sea, borderColor: paper, borderWidth: 4, borderRadius: 12 }),
      ]))
      // A Text leaf cannot paint its own CSS box; preserve the value part id
      // for optimistic feedback and put its paper field in a separate panel.
      children.push({ id: `${id}-output-box`, kind: 'Panel', bounds: rect(innerX + innerWidth - 116, cy, 116, 48), visible: true, style: { backgroundColor: sheet, borderColor: line, borderWidth: 1, borderRadius: 3 } })
      children.push(named(`${id}-value`, rect(innerX + innerWidth - 116, cy + 10, 116, 27), { ...textStyle(18, 27), textAlign: 'center' }, value))
    }
    else if (select?.control) {
      const options = select.control.options.map(o => ({ ...o, label: key === 'skipMode'
        ? (/all|全部/i.test(o.label) ? '全部文字' : '仅已读文字')
        : key === 'frameRateLimit' ? (Number.isFinite(Number.parseInt(o.label)) ? `${Number.parseInt(o.label)} 帧` : '不限') : o.label }))
      children.push(make({ ...select, control: { ...select.control, options } }, rect(innerX, cy, innerWidth, 60), { backgroundColor: sheet, borderColor: '#b8c9bd', borderWidth: 1, borderRadius: 5 }, undefined, [
        named(`${id}-select-value`, rect(innerX + 20, cy + 13, innerWidth - 86, 33), textStyle(22, 33), options[select.control.selectedIndex]?.label),
        named(`${id}-select-chevron`, rect(innerX + innerWidth - 39, cy + 26, 13, 8), { backgroundColor: sea }),
      ]))
    }
    else if (toggle?.control) {
      const on = toggle.control.selectedIndex === 1
      children.push(make(toggle, rect(innerX, cy + 9, 60, 30), { backgroundColor: on ? sea : '#94a298', borderRadius: 20 }))
      children.push(named(`${id}-switch-thumb`, rect(innerX + (on ? 34 : 4), cy + 13, 22, 22), { backgroundColor: sheet, borderRadius: 11 }))
      children.push(named(`${id}-value`, rect(innerX + 78, cy + 9, 48, 30), textStyle(20, 30), on ? '开' : '关'))
    }
    return make(source, rect(x, y, w, h), {}, undefined, children)
  }
  const contentY = top + 95
  const body: Node[] = [
    ...group('flowControl', '阅读', left, contentY, firstWidth),
    field('textSpeedCps', left, contentY + 50, firstWidth, 183.05, '点击可显示整句，再次点击继续。'),
    field('autoAdvanceDelayMs', left, contentY + 233.05, firstWidth, 183.05, '显示整句后，到下一句的等待时间。'),
    field('skipMode', left, contentY + 416.1, firstWidth, 195.05, '遇到选项时停止。'),
    ...group('interaction', '操作', secondX, contentY, secondWidth),
    field('locale', secondX, contentY + 50, secondWidth, 159),
    field('confirmBeforeQuit', secondX, contentY + 209, secondWidth, 147),
    ...group('display', '显示', secondX, contentY + 392.062, secondWidth),
    field('frameRateLimit', secondX, contentY + 442.062, secondWidth, 159),
  ]
  return { ...root, children: [
    named('settings-backdrop', rect(0, 0, width, height), { backgroundColor: '#183b344d', backdropFilter: { blurRadius: 12 } }),
    named('settings-panel', rect(px, py, panelWidth, panelHeight), { backgroundColor: paper, backgroundImage: { assetType: 'images', assetName: 'ui/paper-grain.png' }, backgroundSize: 'none', backgroundPosition: { x: 0, y: 0 }, borderColor: line, borderWidth: 1, borderRadius: 4, boxShadow: { offsetX: 0, offsetY: 18, blurRadius: 64, spreadRadius: 0, color: '#102e2926', inset: false } }, undefined, [
      named('settings-title', rect(left, top, content - 220, 54), { fontFamily: ['Noto Serif'], fontSize: 40, lineHeight: 54, fontWeight: 500, letterSpacing: 0.8, color: ink }, '设置'),
      named('settings-reset-all', rect(left + content - 226, top, 132, 52), { ...textStyle(19, 28.5, '#61736b'), textAlign: 'center' }, '恢复默认'),
      named('settings-close', rect(left + content - 80, top, 80, 52), { ...textStyle(19, 28.5), textAlign: 'center', borderColor: line, borderWidth: 1, borderRadius: 3 }, '关闭'),
      divider('settings-header-divider', rect(left, top + 80, content, 1)),
      ...body,
    ]),
  ] }
}
