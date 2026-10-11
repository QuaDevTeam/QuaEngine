/**
 * Creator 3.8 TTF labels omit spacingX. Adapt only their owned drawing context;
 * native Canvas and Creator's Web Canvas use the same label layout path.
 */
export function installCreatorLetterSpacing(label: any, spacing: number): (() => void) | undefined {
  if (!spacing || !label.updateRenderData || !label.font)
    return undefined
  label.updateRenderData(true)
  const context = label._assemblerData?.context
  if (!context?.measureText || !context.fillText)
    return undefined
  const measure = context.measureText
  const fill = context.fillText
  const sourceFont = label.font
  const font = new sourceFont.constructor()
  font.name = sourceFont.name
  // safeMeasureText caches by font description. Keep spacing variants disjoint.
  font._nativeAsset = `${sourceFont._nativeAsset}, "qua-spacing-${spacing}"`
  const scaledSpacing = () => spacing * (Number(/([\d.]+)px/.exec(context.font || '')?.[1]) || label.fontSize) / label.fontSize
  context.measureText = function (text: string) {
    const metrics = measure.call(this, text)
    return { ...metrics, width: metrics.width + Array.from(text).length * scaledSpacing() }
  }
  context.fillText = function (text: string, x: number, y: number) {
    const chars = Array.from(text)
    const space = scaledSpacing()
    const align = this.textAlign
    const width = measure.call(this, text).width + chars.length * space
    const start = x - (align === 'center' ? width / 2 : align === 'right' || align === 'end' ? width : 0)
    this.textAlign = 'left'
    let prefix = ''
    try {
      chars.forEach((char, index) => {
        fill.call(this, char, start + measure.call(this, prefix).width + index * space, y)
        prefix += char
      })
    }
    finally {
      this.textAlign = align
    }
  }
  label.font = font
  label.updateRenderData(true)
  return () => {
    context.measureText = measure
    context.fillText = fill
    font.destroy?.()
  }
}
