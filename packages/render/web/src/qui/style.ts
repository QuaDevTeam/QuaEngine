import type { NativeQssResolvedStyle as Style } from '@quajs/native-ui-compiler'

/** Only resolved paint is translated here. Layout was already resolved in logical units. */
export function applyQuiStyle(css: CSSStyleDeclaration, style: Style) {
  for (const key of ['backgroundColor', 'color', 'borderColor', 'borderStyle', 'fontStyle', 'textAlign', 'textDecoration', 'textOverflow', 'textTransform', 'whiteSpace'] as const) {
    if (style[key] !== undefined)
      css[key] = style[key]!
  }
  for (const key of ['borderWidth', 'borderRadius', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'fontSize', 'letterSpacing', 'lineHeight'] as const) {
    if (style[key] !== undefined)
      css[key] = `${style[key]}px`
  }
  for (const key of ['borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'] as const) {
    if (style[key] !== undefined)
      css[key] = style[key]!
  }
  if (style.fontFamily)
    css.fontFamily = style.fontFamily.map(f => JSON.stringify(f)).join(',')
  if (style.fontWeight !== undefined)
    css.fontWeight = String(style.fontWeight)
  if (style.opacity !== undefined)
    css.opacity = String(style.opacity)
  if (style.rotateDeg)
    css.transform = `rotate(${style.rotateDeg}deg)`
  if (style.padding)
    css.padding = `${style.padding.top}px ${style.padding.right}px ${style.padding.bottom}px ${style.padding.left}px`
  if (style.boxShadow) {
    const s = style.boxShadow
    css.boxShadow = `${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blurRadius}px ${s.spreadRadius}px ${s.color}`
  }
  if (style.textShadow) {
    const s = style.textShadow
    css.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blurRadius}px ${s.color}`
  }
  if (style.backdropFilter)
    css.backdropFilter = `blur(${style.backdropFilter.blurRadius}px)`
  if (style.filter) {
    const f = style.filter
    css.filter = `brightness(${f.brightness}) saturate(${f.saturate}) blur(${f.blur || 0}px) contrast(${f.contrast ?? 1}) grayscale(${f.grayscale || 0}) sepia(${f.sepia || 0}) hue-rotate(${f.hueRotate || 0}deg) invert(${f.invert || 0})`
  }
  if (style.backgroundGradient) {
    const g = style.backgroundGradient
    const stops = g.stops.map(stop => `${stop.color} ${stop.position * 100}%`).join(',')
    css.backgroundImage = g.kind === 'linear'
      ? `linear-gradient(${g.angleDegrees ?? 180}deg,${stops})`
      : `radial-gradient(${g.shape || 'ellipse'} at ${(g.centerX ?? 0.5) * 100}% ${(g.centerY ?? 0.5) * 100}%,${stops})`
  }
  if (style.backgroundPosition)
    css.backgroundPosition = `${style.backgroundPosition.x * 100}% ${style.backgroundPosition.y * 100}%`
  if (style.backgroundSize)
    css.backgroundSize = style.backgroundSize === 'fill' ? '100% 100%' : style.backgroundSize === 'none' ? 'auto' : style.backgroundSize
  css.backgroundRepeat = 'no-repeat'
  css.objectFit = style.objectFit || 'contain'
  if (style.objectPosition)
    css.objectPosition = `${style.objectPosition.x * 100}% ${style.objectPosition.y * 100}%`
}
