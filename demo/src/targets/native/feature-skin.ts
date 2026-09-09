import type { NativeRendererFeatureSurfaceEntry, NativeRendererFeatureSurfaceOverlay } from '@quajs/engine-native'
import type { NativeUiSurfaceNodeProjection, NativeUiSurfaceRect } from '@quajs/native-ui-compiler'

const labels: Record<string, string> = {
  locale: '语言', textSpeedCps: '文字显示速度', autoAdvanceDelayMs: '自动阅读间隔',
  skipMode: '快进范围', confirmBeforeQuit: '退出前确认', frameRateLimit: '画面帧率',
  masterVolume: '总音量', bgmVolume: '音乐音量', sfxVolume: '音效音量', voiceVolume: '语音音量',
}
const descriptions: Record<string, string> = {
  textSpeedCps: '点击显示整句，再次点击继续。',
  autoAdvanceDelayMs: '显示整句后，到下一句的等待时间。', skipMode: '遇到选项时停止。',
}
const groups: Record<string, string> = { flowControl: '阅读', interaction: '操作', display: '显示', audio: '声音', volumes: '音量' }
const translations: Record<string, string> = {
  Config: '设置', RESET: '重置', Backlog: '记录', Close: '关闭', Jump: '回到这里', Voice: '重听',
  'No backlog entries': '还没有阅读记录', 'No player settings': '暂无设置',
  'Read Text': '仅已读', 'All Text': '全部', 'ON': '开', 'OFF': '关', '60 FPS (Default)': '60 帧（默认）', '30 FPS': '30 帧', '120 FPS': '120 帧', 'Unlimited': '不限', 'Read only': '仅已读', 'All text': '全部', 'Read': '仅已读', All: '全部', On: '开', Off: '关',
}

/** Restyle resolved plugin surfaces; keep all controls, package refs and pipeline intents. */
export function withDemoFeatureSkin(entry: NativeRendererFeatureSurfaceEntry): NativeRendererFeatureSurfaceEntry {
  return { ...entry, createOverlays(context) {
    const result = entry.createOverlays(context)
    if (!result) return result
    const skin = (overlay: NativeRendererFeatureSurfaceOverlay) => {
      const settings = entry.pluginId === 'settings'
      const scale = settings ? 1.25 : 1
      const rect = (bounds: NativeUiSurfaceRect): NativeUiSurfaceRect => ({
        x: context.logicalWidth / 2 + (bounds.x - context.logicalWidth / 2) * scale,
        y: context.logicalHeight / 2 + (bounds.y - context.logicalHeight / 2) * scale,
        width: bounds.width * scale, height: bounds.height * scale,
      })
      const visit = (source: NativeUiSurfaceNodeProjection): NativeUiSurfaceNodeProjection => {
        const node = { ...source, bounds: /-(root|backdrop)$/.test(source.id) ? source.bounds : rect(source.bounds) }
        const style = { ...source.style }
        for (const key of ['fontSize', 'lineHeight', 'letterSpacing', 'borderRadius'] as const) {
          if (typeof style[key] === 'number') style[key] *= scale
        }
        delete style.backgroundGradient
        delete style.textShadow
        if (style.boxShadow) style.boxShadow = { ...style.boxShadow, color: 'rgba(16,46,41,0.15)' }
        if (style.color) style.color = '#29453f'
        if (style.borderColor) style.borderColor = '#c7d2c5'
        if (style.backgroundColor && style.backgroundColor !== 'transparent') style.backgroundColor = '#fffdf7'
        if (node.id.endsWith('-panel')) style.backgroundColor = '#f5f3eb'
        if (node.kind === 'Backdrop') { style.backgroundColor = '#183b34'; style.opacity = 0.5 }
        if (/divider|slider-track/.test(node.id)) style.backgroundColor = '#c7d2c5'
        if (/slider-(progress|thumb)$|chevron/.test(node.id)) style.backgroundColor = '#42796e'
        if (/switch-track/.test(node.id)) { style.backgroundColor = '#dce7db'; style.borderColor = '#42796e' }
        if (/switch-thumb/.test(node.id)) style.backgroundColor = '#42796e'
        if (/thumb-halo/.test(node.id)) style.backgroundColor = '#dce7db'
        if (node.id.endsWith('-title')) { style.fontSize = 42; style.fontWeight = 400; style.fontFamily = ['Noto Serif'] }
        if (typeof node.text === 'string') node.text = translations[node.text] || node.text
        if (settings) {
          const field = Object.keys(labels).find(key => node.id.includes(`-${key}-`))
          if (field && node.id.endsWith('-label')) {
            node.text = labels[field]; style.fontSize = 22; style.fontWeight = 400; node.bounds.height = 32
          }
          if (field && node.id.endsWith('-description')) {
            node.text = descriptions[field] || ''; style.fontSize = 16; style.color = '#61736b'; node.bounds.height = 24
          }
          if (node.id.startsWith('settings-group-') && node.id.endsWith('-label')) {
            const group = Object.keys(groups).find(key => node.id.includes(`-${key}-`))
            if (group) node.text = groups[group]
            style.fontSize = 19; style.letterSpacing = 0; node.bounds.height = 28
          }
          if (/select-value|-value$/.test(node.id)) { style.fontSize = 20; node.bounds.height = Math.max(30, node.bounds.height) }
          if (node.id === 'settings-reset-all') { node.bounds.x -= 56; node.bounds.width += 56; style.fontSize = 20 }
        }
        if (/backlog-entry-\d+-metadata/.test(node.id) && typeof node.text === 'string') {
          node.text = node.text.replace(/^\d{2}:\d{2}:\d{2}\s*/, ''); style.color = '#42796e'
        }
        node.style = style
        if (node.stateStyles) node.stateStyles = Object.fromEntries(Object.entries(node.stateStyles).map(([key, value]) => [key, {
          ...value, ...(value.bounds ? { bounds: rect(value.bounds) } : {}),
          style: { ...value.style, backgroundGradient: undefined, backgroundColor: '#e3ebe2', borderColor: '#42796e', color: '#29453f' },
        }]))
        if (node.control) node.control = { ...node.control, options: node.control.options.map(option => ({ ...option, label: translations[option.label] || option.label.replace(/ cps$/, ' 字/秒').replace(/ ms$/, ' 毫秒') })) }
        node.children = source.children?.map(visit)
        return node
      }
      return { ...overlay, surface: { ...overlay.surface, root: visit(overlay.surface.root as unknown as NativeUiSurfaceNodeProjection) } }
    }
    return Array.isArray(result) ? result.map(skin) : skin(result as NativeRendererFeatureSurfaceOverlay)
  } }
}
