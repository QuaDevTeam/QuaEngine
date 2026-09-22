export const defaults = {
  colorTheme: 'qua',
  colorMode: 'system',
  fontSize: 13,
  fontFamily: 'system',
  lineHeight: 1.7,
  fontLigatures: false,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: true,
  lineNumbers: true,
  minimap: true,
  whitespace: 'selection',
  indentGuides: true,
  bracketColors: true,
  stickyScroll: false,
  smoothScrolling: false,
  cursorBlinking: 'blink',
  formatOnSave: false,
  terminalFontSize: 12,
  terminalScrollback: 2000,
  terminalCursorBlink: true,
  restoreLayout: true,
  density: 'compact',
  reducedMotion: false,
}
export type Preferences = typeof defaults
export type SettingKey = keyof Preferences
export type Category = 'appearance' | 'editor' | 'terminal' | 'preview' | 'workspace' | 'shortcuts'
export interface Setting {
  key: SettingKey
  category: Category
  title: string
  description: string
  options?: readonly (readonly [string | number, string])[]
  min?: number
  max?: number
  step?: number
  unit?: string
}
export const categories: readonly { id: Category, title: string, description: string }[] = [
  { id: 'appearance', title: '外观', description: '颜色主题与明暗模式' },
  { id: 'editor', title: '代码编辑器', description: '字体、阅读与编辑行为' },
  { id: 'terminal', title: '终端', description: '终端显示与滚动记录' },
  { id: 'preview', title: '预览', description: '游戏预览的显示性能' },
  { id: 'workspace', title: '工作区', description: '界面与布局偏好' },
  { id: 'shortcuts', title: '快捷键', description: '常用操作的键盘快捷键' },
]
export const settings: readonly Setting[] = [
  { key: 'colorTheme', category: 'appearance', title: '颜色主题', description: 'Qua 使用柔和的纸色与樱花色；石墨使用中性灰与蓝色。', options: [['qua', 'Qua'], ['graphite', '石墨']] },
  { key: 'colorMode', category: 'appearance', title: '明暗模式', description: '跟随系统，或固定使用浅色、深色。', options: [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] },
  { key: 'fontSize', category: 'editor', title: '字体大小', description: '代码编辑器的文字大小。', min: 10, max: 32, step: 1, unit: 'px' },
  { key: 'fontFamily', category: 'editor', title: '代码字体', description: '使用本机已安装的字体；缺失时回退到等宽字体。', options: [['system', '系统等宽字体'], ['jetbrains', 'JetBrains Mono'], ['fira', 'Fira Code'], ['cascadia', 'Cascadia Code']] },
  { key: 'lineHeight', category: 'editor', title: '行高', description: '相对于字体大小的倍数。', min: 1.2, max: 2.4, step: 0.1, unit: '倍' },
  { key: 'fontLigatures', category: 'editor', title: '字体连字', description: '使用字体提供的运算符连字。' },
  { key: 'wordWrap', category: 'editor', title: '自动换行', description: '较长的代码和对话在编辑器宽度内换行。' },
  { key: 'lineNumbers', category: 'editor', title: '显示行号', description: '在代码左侧显示行号。' },
  { key: 'minimap', category: 'editor', title: '显示代码缩略图', description: '在代码右侧显示文档全貌。' },
  { key: 'stickyScroll', category: 'editor', title: '固定作用域标题', description: '滚动时在顶部保留当前函数或代码块标题。' },
  { key: 'whitespace', category: 'editor', title: '空白字符', description: '显示空格和制表符标记的范围。', options: [['none', '不显示'], ['selection', '选中时显示'], ['boundary', '边界空白'], ['all', '全部显示']] },
  { key: 'indentGuides', category: 'editor', title: '缩进参考线', description: '帮助辨认嵌套层级。' },
  { key: 'bracketColors', category: 'editor', title: '括号配对着色', description: '用颜色区分嵌套的括号。' },
  { key: 'tabSize', category: 'editor', title: '缩进宽度', description: '新输入使用的缩进宽度。', options: [[2, '2 个空格'], [4, '4 个空格'], [8, '8 个空格']] },
  { key: 'insertSpaces', category: 'editor', title: '使用空格缩进', description: '按 Tab 时插入空格；关闭后插入制表符。' },
  { key: 'formatOnSave', category: 'editor', title: '保存时格式化 QuaScript', description: '保存前按项目语言规则格式化当前 QuaScript 文件。' },
  { key: 'smoothScrolling', category: 'editor', title: '平滑滚动', description: '平滑过渡代码滚动位置。减少动态效果开启时暂停。' },
  { key: 'cursorBlinking', category: 'editor', title: '光标动画', description: '代码编辑器插入光标的显示方式。', options: [['blink', '闪烁'], ['smooth', '渐变'], ['solid', '常亮']] },
  { key: 'terminalFontSize', category: 'terminal', title: '终端字体大小', description: '同时更新已打开的终端。', min: 10, max: 28, step: 1, unit: 'px' },
  { key: 'terminalScrollback', category: 'terminal', title: '滚动记录行数', description: '每个终端保留的历史输出上限。减少此值会释放较早记录。', min: 500, max: 20000, step: 500, unit: '行' },
  { key: 'terminalCursorBlink', category: 'terminal', title: '终端光标闪烁', description: '让终端的输入光标闪烁。' },
  { key: 'density', category: 'workspace', title: '控件密度', description: '调整表单和工具按钮的高度。', options: [['compact', '紧凑'], ['comfortable', '舒适']] },
  { key: 'restoreLayout', category: 'workspace', title: '恢复工作区布局', description: '下次启动时恢复视图分组和位置；不会恢复终端进程。' },
  { key: 'reducedMotion', category: 'workspace', title: '减少动态效果', description: '减少编辑器界面的动画和光标闪烁，不改变游戏效果。' },
]

export function validSetting(key: SettingKey, value: unknown): boolean {
  const setting = settings.find(setting => setting.key === key)!
  if (typeof value !== typeof defaults[key])
    return false
  if (setting.options)
    return setting.options.some(([candidate]) => value === candidate)
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= setting.min! && value <= setting.max!
      && Math.abs((value - setting.min!) / setting.step! - Math.round((value - setting.min!) / setting.step!)) < 0.000001
  }
  return typeof value === 'boolean'
}

export function readPreferences(raw: unknown): Preferences {
  const result = { ...defaults }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return result
  for (const key of Object.keys(defaults) as SettingKey[]) {
    const value = (raw as Record<string, unknown>)[key]
    if (validSetting(key, value))
      Object.assign(result, { [key]: value })
  }
  return result
}

export const fontFamilies: Record<string, string> = {
  system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  jetbrains: '"JetBrains Mono", ui-monospace, monospace',
  fira: '"Fira Code", ui-monospace, monospace',
  cascadia: '"Cascadia Code", ui-monospace, monospace',
}
