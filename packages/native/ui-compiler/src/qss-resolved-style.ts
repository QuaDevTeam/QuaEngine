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
  resolveNativeQssLayoutMargin,
  resolveNativeQssLayoutMarginEdge,
} from './qss-resolved-style-helpers'
import {
  parseNativeQssAlignItems,
  parseNativeQssAlignSelf,
  parseNativeQssBackgroundGradient,
  parseNativeQssBackgroundImage,
  parseNativeQssBackdropFilter,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderImageRepeat,
  parseNativeQssBorderImageSlice,
  parseNativeQssBorderImageSource,
  parseNativeQssBorderImageWidth,
  parseNativeQssBorderStyle,
  parseNativeQssBoxSizing,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFilter,
  parseNativeQssFlexBasis,
  parseNativeQssFlexGrow,
  parseNativeQssFlexShrink,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssInteger,
  parseNativeQssJustifyContent,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssPointerEvents,
  parseNativeQssPosition,
  parseNativeQssBoxShadow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssTextShadow,
  parseNativeQssTransform,
  parseNativeQssTransformOrigin,
  parseNativeQssTranslate,
  parseNativeQssScale,
  parseNativeQssTransition,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export {
  parseNativeQssAlignItems,
  parseNativeQssAlignSelf,
  parseNativeQssBackdropFilter,
  parseNativeQssBackgroundGradient,
  parseNativeQssBackgroundImage,
  parseNativeQssBackgroundPosition,
  parseNativeQssBorderImageRepeat,
  parseNativeQssBorderImageSlice,
  parseNativeQssBorderImageSource,
  parseNativeQssBorderImageWidth,
  parseNativeQssBorderStyle,
  parseNativeQssBoxSizing,
  parseNativeQssColor,
  parseNativeQssCoordinateNumber,
  parseNativeQssDisplay,
  parseNativeQssEdgeInsets,
  parseNativeQssFilter,
  parseNativeQssFlexBasis,
  parseNativeQssFlexGrow,
  parseNativeQssFlexShrink,
  parseNativeQssFontFamilyList,
  parseNativeQssFontStyle,
  parseNativeQssFontWeight,
  parseNativeQssGap,
  parseNativeQssInteger,
  parseNativeQssJustifyContent,
  parseNativeQssLetterSpacing,
  parseNativeQssLogicalNumber,
  parseNativeQssObjectFit,
  parseNativeQssOpacity,
  parseNativeQssOverflow,
  parseNativeQssPointerEvents,
  parseNativeQssPosition,
  parseNativeQssBoxShadow,
  parseNativeQssTextAlign,
  parseNativeQssTextDecoration,
  parseNativeQssTextOverflow,
  parseNativeQssTextTransform,
  parseNativeQssTextShadow,
  parseNativeQssTransform,
  parseNativeQssTransformOrigin,
  parseNativeQssTranslate,
  parseNativeQssScale,
  parseNativeQssTransition,
  parseNativeQssVisibility,
  parseNativeQssWhiteSpace,
} from './qss-style-values'

export function resolveNativeQssDeclarations(
  declarations: readonly NativeQssDeclaration[],
): NativeQssResolvedNodeStyle {
  const resolved: NativeQssResolvedNodeStyle = {
    style: {},
  }
  let boxSizing: ReturnType<typeof parseNativeQssBoxSizing> | undefined
  let displayNone = false

  // Accumulate border-image sub-properties across multiple declarations.
  let borderImageSource: ReturnType<typeof parseNativeQssBorderImageSource> | undefined
  let borderImageSliceResult: ReturnType<typeof parseNativeQssBorderImageSlice> | undefined
  let borderImageWidth: ReturnType<typeof parseNativeQssBorderImageWidth> | undefined
  let borderImageRepeat: ReturnType<typeof parseNativeQssBorderImageRepeat> | undefined

  for (const declaration of declarations) {
    const value = declaration.value.trim()
    switch (declaration.name) {
      case 'backdrop-filter':
        resolved.style.backdropFilter = parseNativeQssBackdropFilter(value)
        break
      case 'align-items':
        resolved.layout = {
          ...resolved.layout,
          alignItems: parseNativeQssAlignItems(value),
        }
        break
      case 'align-self':
        resolved.layout = {
          ...resolved.layout,
          alignSelf: parseNativeQssAlignSelf(value),
        }
        break
      case 'flex-grow': {
        const grow = parseNativeQssFlexGrow(value)
        if (grow !== undefined)
          resolved.layout = { ...resolved.layout, flexGrow: grow }
        break
      }
      case 'flex-shrink': {
        const shrink = parseNativeQssFlexShrink(value)
        if (shrink !== undefined)
          resolved.layout = { ...resolved.layout, flexShrink: shrink }
        break
      }
      case 'flex-basis': {
        const basis = parseNativeQssFlexBasis(value)
        if (basis !== undefined)
          resolved.layout = { ...resolved.layout, flexBasis: basis }
        break
      }
      case 'background-color':
        resolved.style.backgroundColor = parseNativeQssColor(value)
        break
      case 'background-image':
        resolved.style.backgroundGradient = parseNativeQssBackgroundGradient(value)
        resolved.style.backgroundImage = resolved.style.backgroundGradient
          ? undefined
          : parseNativeQssBackgroundImage(value)
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
      case 'border-top-color':
        resolved.style.borderTopColor = parseNativeQssColor(value)
        break
      case 'border-right-color':
        resolved.style.borderRightColor = parseNativeQssColor(value)
        break
      case 'border-bottom-color':
        resolved.style.borderBottomColor = parseNativeQssColor(value)
        break
      case 'border-left-color':
        resolved.style.borderLeftColor = parseNativeQssColor(value)
        break
      case 'border-image-source':
        borderImageSource = parseNativeQssBorderImageSource(value)
        break
      case 'border-image-slice':
        borderImageSliceResult = parseNativeQssBorderImageSlice(value)
        break
      case 'border-image-width':
        borderImageWidth = parseNativeQssBorderImageWidth(value)
        break
      case 'border-image-repeat':
        borderImageRepeat = parseNativeQssBorderImageRepeat(value)
        break
      case 'border-radius':
        resolved.style.borderRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-top-left-radius':
        resolved.style.borderTopLeftRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-top-right-radius':
        resolved.style.borderTopRightRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-bottom-right-radius':
        resolved.style.borderBottomRightRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-bottom-left-radius':
        resolved.style.borderBottomLeftRadius = parseNativeQssLogicalNumber(value)
        break
      case 'border-style':
        resolved.style.borderStyle = parseNativeQssBorderStyle(value)
        break
      case 'border-width':
        resolved.style.borderWidth = parseNativeQssLogicalNumber(value)
        break
      case 'border-top-width':
        resolved.style.borderTopWidth = parseNativeQssLogicalNumber(value)
        break
      case 'border-right-width':
        resolved.style.borderRightWidth = parseNativeQssLogicalNumber(value)
        break
      case 'border-bottom-width':
        resolved.style.borderBottomWidth = parseNativeQssLogicalNumber(value)
        break
      case 'border-left-width':
        resolved.style.borderLeftWidth = parseNativeQssLogicalNumber(value)
        break
      case 'box-sizing':
        boxSizing = parseNativeQssBoxSizing(value)
        break
      case 'box-shadow':
        resolved.style.boxShadow = value.toLowerCase() === 'none' ? undefined : parseNativeQssBoxShadow(value)
        break
      case 'color':
        resolved.style.color = parseNativeQssColor(value)
        break
      case 'display':
        if (parseNativeQssDisplay(value) === false)
          displayNone = true
        break
      case 'filter':
        resolved.style.filter = parseNativeQssFilter(value)
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
      case 'margin':
        resolved.layout = resolveNativeQssLayoutMargin(resolved.layout, value)
        break
      case 'margin-bottom':
        resolved.layout = resolveNativeQssLayoutMarginEdge(resolved.layout, 'bottom', value)
        break
      case 'margin-left':
        resolved.layout = resolveNativeQssLayoutMarginEdge(resolved.layout, 'left', value)
        break
      case 'margin-right':
        resolved.layout = resolveNativeQssLayoutMarginEdge(resolved.layout, 'right', value)
        break
      case 'margin-top':
        resolved.layout = resolveNativeQssLayoutMarginEdge(resolved.layout, 'top', value)
        break
      case 'height':
        resolved.bounds = resolveNativeQssBound(resolved.bounds, 'height', value, parseNativeQssLogicalNumber)
        break
      case 'justify-content':
        resolved.layout = {
          ...resolved.layout,
          justifyContent: parseNativeQssJustifyContent(value),
        }
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
      case 'object-position':
        resolved.style.objectPosition = parseNativeQssBackgroundPosition(value)
        break
      case 'opacity':
        resolved.style.opacity = parseNativeQssOpacity(value)
        break
      case 'overflow':
        resolved.clipChildren = parseNativeQssOverflow(value)
        break
      case 'pointer-events':
        resolved.interactive = parseNativeQssPointerEvents(value)
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
      case 'position':
        resolved.layout = {
          ...resolved.layout,
          position: parseNativeQssPosition(value),
        }
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
      case 'text-shadow':
        resolved.style.textShadow = value.toLowerCase() === 'none' ? undefined : parseNativeQssTextShadow(value)
        break
      case 'transform': {
        const transform = parseNativeQssTransform(value)
        if (transform) {
          resolved.layout = {
            ...resolved.layout,
            transform: {
              ...transform,
              originX: resolved.layout?.transform?.originX ?? transform.originX,
              originY: resolved.layout?.transform?.originY ?? transform.originY,
            },
          }
          if (transform.rotateDeg !== undefined) {
            resolved.style.rotateDeg = transform.rotateDeg
          }
        }
        break
      }
      case 'transform-origin': {
        const origin = parseNativeQssTransformOrigin(value)
        if (origin) {
          resolved.layout = {
            ...resolved.layout,
            transform: {
              originX: origin.x,
              originY: origin.y,
              scaleX: resolved.layout?.transform?.scaleX ?? 1,
              scaleY: resolved.layout?.transform?.scaleY ?? 1,
              translateX: resolved.layout?.transform?.translateX ?? 0,
              translateY: resolved.layout?.transform?.translateY ?? 0,
            },
          }
        }
        break
      }
      case 'translate': {
        const translate = parseNativeQssTranslate(value)
        if (translate) {
          resolved.layout = {
            ...resolved.layout,
            transform: {
              originX: resolved.layout?.transform?.originX ?? 0.5,
              originY: resolved.layout?.transform?.originY ?? 0.5,
              scaleX: resolved.layout?.transform?.scaleX ?? 1,
              scaleY: resolved.layout?.transform?.scaleY ?? 1,
              translateX: translate.x,
              translateY: translate.y,
            },
          }
        }
        break
      }
      case 'transition':
        resolved.transitions = parseNativeQssTransition(value)
        break
      case 'scale': {
        const scale = parseNativeQssScale(value)
        if (scale) {
          resolved.layout = {
            ...resolved.layout,
            transform: {
              originX: resolved.layout?.transform?.originX ?? 0.5,
              originY: resolved.layout?.transform?.originY ?? 0.5,
              scaleX: scale.x,
              scaleY: scale.y,
              translateX: resolved.layout?.transform?.translateX ?? 0,
              translateY: resolved.layout?.transform?.translateY ?? 0,
            },
          }
        }
        break
      }
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

  // Merge border-image sub-properties into a single resolved value.
  if (borderImageSource && borderImageSliceResult) {
    resolved.style.borderImage = {
      source: borderImageSource,
      slice: borderImageSliceResult.slice,
      ...(borderImageSliceResult.fill ? { fill: true } : {}),
      ...(borderImageWidth ? { width: borderImageWidth } : {}),
      ...(borderImageRepeat ? { repeat: borderImageRepeat } : {}),
    }
  }

  return pruneUndefinedResolvedNodeStyle(resolved, boxSizing)
}
