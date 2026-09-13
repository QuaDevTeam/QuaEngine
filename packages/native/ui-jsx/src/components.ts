import type {
  BackdropProps,
  BoxProps,
  ButtonProps,
  ColumnProps,
  DividerProps,
  GridProps,
  ImageProps,
  LayerProps,
  PanelProps,
  QuiNode,
  RichTextProps,
  RowProps,
  SafeAreaProps,
  ScrollProps,
  SelectProps,
  SliderProps,
  SpacerProps,
  StackProps,
  SwitchProps,
  TextProps,
  VideoProps,
} from './types'
import { createNode } from './jsx-runtime'

// ─── Container components ───────────────────────────────────────────────────

export function Stack({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: StackProps): QuiNode {
  return createNode('Stack', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Box({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: BoxProps): QuiNode {
  return createNode('Box', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Row({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: RowProps): QuiNode {
  return createNode('Row', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Column({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: ColumnProps): QuiNode {
  return createNode('Column', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Layer({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: LayerProps): QuiNode {
  return createNode('Layer', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Panel({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: PanelProps): QuiNode {
  return createNode('Panel', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Grid({ class: c, id, children, show, opacity, scrollX, scrollY, columns, rows, gap, columnGap, rowGap, ...rest }: GridProps): QuiNode {
  return createNode('Grid', { class: c, id, show, opacity, scrollX, scrollY, columns, rows, gap, columnGap, rowGap, ...rest }, children)
}

export function SafeArea({ class: c, id, children, show, opacity, scrollX, scrollY, ...rest }: SafeAreaProps): QuiNode {
  return createNode('SafeArea', { class: c, id, show, opacity, scrollX, scrollY, ...rest }, children)
}

export function Scroll({ class: c, id, children, show, opacity, scrollX, scrollY, direction, ...rest }: ScrollProps): QuiNode {
  return createNode('Scroll', { class: c, id, show, opacity, scrollX, scrollY, direction, ...rest }, children)
}

// ─── Void / leaf components ─────────────────────────────────────────────────

export function Spacer({ class: c, id, show, ...rest }: SpacerProps): QuiNode {
  return createNode('Spacer', { class: c, id, show, ...rest }, undefined)
}

export function Divider({ class: c, id, show, ...rest }: DividerProps): QuiNode {
  return createNode('Divider', { class: c, id, show, ...rest }, undefined)
}

// ─── Interactive components ─────────────────────────────────────────────────

export function Backdrop({ class: c, id, children, show, opacity, onDismiss, ...rest }: BackdropProps): QuiNode {
  return createNode('Backdrop', { class: c, id, show, opacity, onDismiss, ...rest }, children)
}

export function Button({ class: c, id, children, show, opacity, onClick, disabled, ...rest }: ButtonProps): QuiNode {
  // children (string | number) become the button's text content in the projection
  const text = children !== undefined && children !== null ? String(children) : undefined
  return createNode('Button', { class: c, id, show, opacity, text, onClick, disabled, ...rest }, undefined)
}

// ─── Text components ────────────────────────────────────────────────────────

export function Text({ class: c, id, show, opacity, children, ...rest }: TextProps): QuiNode {
  const text = children !== undefined && children !== null && children !== false
    ? String(children)
    : undefined
  return createNode('Text', { class: c, id, show, opacity, text, ...rest }, undefined)
}

export function RichText({ class: c, id, show, opacity, children, ...rest }: RichTextProps): QuiNode {
  return createNode('RichText', { class: c, id, show, opacity, text: children, ...rest }, undefined)
}

// ─── Media components ───────────────────────────────────────────────────────

export function Image({ class: c, id, show, opacity, src, objectFit, objectPosition, ...rest }: ImageProps): QuiNode {
  return createNode('Image', { class: c, id, show, opacity, src, objectFit, objectPosition, ...rest }, undefined)
}

export function Video({ class: c, id, show, opacity, src, assetType, objectFit, looped, muted, playbackRate, ...rest }: VideoProps): QuiNode {
  return createNode('Video', { class: c, id, show, opacity, src, assetType, objectFit, looped, muted, playbackRate, ...rest }, undefined)
}

// ─── Control components ─────────────────────────────────────────────────────

export function Slider({ class: c, id, show, opacity, selectedIndex, options, parts, ...rest }: SliderProps): QuiNode {
  return createNode('Slider', { class: c, id, show, opacity, selectedIndex, options, parts, ...rest }, undefined)
}

export function Switch({ class: c, id, show, opacity, selectedIndex, options, parts, ...rest }: SwitchProps): QuiNode {
  return createNode('Switch', { class: c, id, show, opacity, selectedIndex, options, parts, ...rest }, undefined)
}

export function Select({ class: c, id, show, opacity, selectedIndex, options, parts, ...rest }: SelectProps): QuiNode {
  return createNode('Select', { class: c, id, show, opacity, selectedIndex, options, parts, ...rest }, undefined)
}
