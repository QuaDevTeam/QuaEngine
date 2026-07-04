import type {
  NativeQssDeclaration,
  NativeQssResolvedNodeStyle,
} from './types'
import {
  pruneUndefinedResolvedNodeStyle,
  resolveNativeQssBound,
  resolveNativeQssEdgeInset,
  resolveNativeQssGap,
  resolveNativeQssInset,
  resolveNativeQssLayoutGap,
} from './qss-resolved-style-helpers'
import {
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssInteger,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export {
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderStyle,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssGap,
  parseNativeQssInteger,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export function resolveNativeQssDeclarations(
  declarations: readonly NativeQssDeclaration[],
): NativeQssResolvedNodeStyle {
  const resolved: NativeQssResolvedNodeStyle = {
    style: {},
  }
  let displayNone = false

  for (const declaration of declarations) {
    const value = declaration.value.trim()
    switch (declaration.name) {
      case 'background-color':
        resolved.style.backgroundColor = parseNativeQssColor(value)
        break
      case 'background-image':
        resolved.style.backgroundImage = parseNativeQssBackgroundImage(value)
        break
      case 'background-position':
        resolved.style.backgroundPosition = parseNativeQssBackgroundPosition(value)
        break
      case 'background-size':
        resolved.style.backgroundSize = parseNativeQssObjectFit(value)
        break
      case 'border-color':
        resolved.style.borderColor = parseNativeQssColor(value)
        break
      case 'border-radius':
        resolved.style.borderRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-style':
        resolved.style.borderStyle = parseNativeQssBorderStyle(value)
        break
      case 'border-width':
        resolved.style.borderWidth = parseNativeQssLogicalNumber(value)
        break
      case 'color':
        resolved.style.color = parseNativeQssColor(value)
        break
      case 'display':
        if (parseNativeQssDisplay(value) === false)
          displayNone = true
        break
      case 'font-family':
        resolved.style.fontFamily = parseNativeQssFontFamilyList(value)
        break
      case 'font-size':
        resolved.style.fontSize = parseNativeQssLogicalNumber(value)
        break
      case 'font-style':
        resolved.style.fontStyle = parseNativeQssFontStyle(value)
        break
      case 'font-weight':
        resolved.style.fontWeight = parseNativeQssFontWeight(value)
        break
      case 'gap':
        resolved.layout = resolveNativeQssGap(resolved.layout, value)
        break
      case 'letter-spacing':
        resolved.style.letterSpacing = parseNativeQssLetterSpacing(value)
        break
      case 'line-height':
        resolved.style.lineHeight = parseNativeQssLogicalNumber(value)
        break
      case 'height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'height', value, parseNativeQssLogicalNumber)
        break
      case 'inset':
        resolved.bounds = resolveNativeQssInset(resolved.bounds, value)
        break
      case 'left':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'x', value, parseNativeQssCoordinateNumber)
        break
      case 'max-height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'maxHeight', value, parseNativeQssLogicalNumber)
        break
      case 'max-width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'maxWidth', value, parseNativeQssLogicalNumber)
        break
      case 'min-height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'minHeight', value, parseNativeQssLogicalNumber)
        break
      case 'min-width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'minWidth', value, parseNativeQssLogicalNumber)
        break
      case 'object-fit':
        resolved.style.objectFit = parseNativeQssObjectFit(value)
        break
      case 'opacity':
        resolved.style.opacity = parseNativeQssOpacity(value)
        break
      case 'overflow':
        resolved.clipChildren = parseNativeQssOverflow(value)
        break
      case 'padding':
        resolved.style.padding = parseNativeQssEdgeInsets(value)
        break
      case 'padding-bottom':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'bottom', value)
        break
      case 'padding-left':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'left', value)
        break
      case 'padding-right':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'right', value)
        break
      case 'padding-top':
        resolved.style.padding = resolveNativeQssEdgeInset(resolved.style.padding, 'top', value)
        break
      case 'column-gap':
        resolved.layout = resolveNativeQssLayoutGap(resolved.layout, 'columnGap', value)
        break
      case 'right':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'right', value, parseNativeQssLogicalNumber)
        break
      case 'row-gap':
        resolved.layout = resolveNativeQssLayoutGap(resolved.layout, 'rowGap', value)
        break
      case 'bottom':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'bottom', value, parseNativeQssLogicalNumber)
        break
      case 'top':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'y', value, parseNativeQssCoordinateNumber)
        break
      case 'text-align':
        resolved.style.textAlign = parseNativeQssTextAlign(value)
        break
      case 'text-decoration':
        resolved.style.textDecoration = parseNativeQssTextDecoration(value)
        break
      case 'text-overflow':
        resolved.style.textOverflow = parseNativeQssTextOverflow(value)
        break
      case 'text-transform':
        resolved.style.textTransform = parseNativeQssTextTransform(value)
        break
      case 'visibility':
        resolved.visible = parseNativeQssVisibility(value)
        break
      case 'white-space':
        resolved.style.whiteSpace = parseNativeQssWhiteSpace(value)
        break
      case 'width':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'width', value, parseNativeQssLogicalNumber)
        break
      case 'z-index':
        resolved.zIndex = parseNativeQssInteger(value)
        break
    }
  }

  if (displayNone)
    resolved.visible = false

  return pruneUndefinedResolvedNodeStyle(resolved)
}
