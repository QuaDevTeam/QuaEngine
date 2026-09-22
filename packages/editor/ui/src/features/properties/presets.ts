import type { EditorAuthoring } from '@quajs/editor-core'

export interface VisualPreset {
  name: string
  label: string
  module: string
  binding: string
  fields: { label: string, value: string, kind: 'string' | 'number', source?: 'image' | 'audio' | 'character' | 'expression' }[]
  args: (values: string[]) => string
}
const quoted = (value: string) => JSON.stringify(value)
const asset = (source: 'image' | 'audio') => ({ label: '资源', value: '', kind: 'string' as const, source })
const character = { label: '角色', value: '', kind: 'string' as const, source: 'character' as const }
const number = (label: string, value: string) => ({ label, value, kind: 'number' as const })
const presets: VisualPreset[] = [
  { name: 'SetBackground', label: '背景图片', module: '@quajs/plugin-background', binding: 'setBackgroundWithEngine', fields: [asset('image')], args: values => quoted(values[0]) },
  { name: 'ClearBackground', label: '清除背景', module: '@quajs/plugin-background', binding: 'clearBackgroundWithEngine', fields: [], args: () => '' },
  { name: 'PlayVoice', label: '本句语音', module: '@quajs/plugin-audio', binding: 'playVoiceWithEngine', fields: [asset('audio')], args: values => quoted(values[0]) },
  { name: 'PlayBGM', label: '背景音乐', module: '@quajs/plugin-audio', binding: 'playBGMWithEngine', fields: [asset('audio')], args: values => quoted(values[0]) },
  { name: 'ShowCharacter', label: '角色登场', module: '@quajs/character', binding: 'show', fields: [character, number('不透明度', '1')], args: values => `${quoted(values[0])}, { opacity: ${values[1]} }` },
  { name: 'HideCharacter', label: '角色退场', module: '@quajs/character', binding: 'hide', fields: [character], args: values => quoted(values[0]) },
  { name: 'SetExpression', label: '角色表情', module: '@quajs/character', binding: 'expression', fields: [{ label: '表情', value: '', kind: 'string', source: 'expression' }, character], args: values => `${quoted(values[0])}, ${quoted(values[1])}` },
  { name: 'SetSprite', label: '角色立绘', module: '@quajs/character', binding: 'sprite', fields: [asset('image'), character], args: values => `${quoted(values[0])}, ${quoted(values[1])}` },
  { name: 'MoveCharacter', label: '角色位置', module: '@quajs/character', binding: 'move', fields: [character, number('X（逻辑坐标）', '0'), number('Y（逻辑坐标）', '0')], args: values => `${quoted(values[0])}, ${values[1]}, ${values[2]}` },
]

/** Only offer known DSL calls when the compiler resolved the matching provider. */
export function visualPresets(authoring: EditorAuthoring): VisualPreset[] {
  return presets.filter(preset => authoring.decorators.some(item => item.name === preset.name && item.module === preset.module && item.binding === preset.binding))
}

export function visualFieldLabel(label: string): string {
  return label.split('.').map(part => ({ asset: '资源', character: '角色', expression: '表情', options: '选项', position: '位置', transition: '转场', type: '类型', duration: '时长（ms）', opacity: '不透明度', scale: '缩放', rotation: '旋转', visible: '显示', loop: '循环', volume: '音量', x: 'X（逻辑坐标）', y: 'Y（逻辑坐标）' } as Record<string, string>)[part] || part).join(' / ')
}
export function visualDecoratorLabel(name: string): string {
  return presets.find(item => item.name === name)?.label || name
}
