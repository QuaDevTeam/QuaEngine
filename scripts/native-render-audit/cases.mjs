export const background = '#20252b'
const rect = (x = 50, y = 55, width = 320, height = 150) => ({ x, y, width, height })
const node = (id, kind, style = {}, extra = {}) => ({ id, kind, visible: true, bounds: rect(), style, ...extra })
const box = (id, style, extra) => node(id, 'Box', style, extra)
const image = (id, style = {}, extra = {}) => node(id, 'Image', style, {
  image: { assetType: 'images', assetName: 'backgrounds/morning-city.jpg' }, ...extra,
})
const text = (id, value, style = {}) => node(id, 'Text', {
  fontFamily: ['Noto Sans'], fontSize: 26, lineHeight: 38, fontWeight: 400,
  color: '#ffffff', whiteSpace: 'normal', ...style,
}, { text: value })
const stops = colors => colors.map((color, i) => ({ color, position: i / (colors.length - 1) }))
const shadow = (blurRadius, inset = false) => ({ offsetX: 8, offsetY: 12, blurRadius, spreadRadius: 4, color: '#ffbe55', inset })

export const cases = [
  box('solid-color', { backgroundColor: '#cc4455' }),
  box('rgba-source-over', { backgroundColor: 'rgba(255,60,110,0.5)' }),
  box('single-opacity', { backgroundColor: '#f03070', opacity: 0.5 }),
  box('group-opacity', { backgroundColor: '#ff0000', opacity: 0.5 }, {
    children: [box('opaque-child', { backgroundColor: '#00ff00' }, { bounds: rect(100, 80, 160, 90) })],
  }),
  box('linear-gradient-90', { backgroundGradient: { kind: 'linear', angleDegrees: 90, stops: stops(['#ff0000', '#0000ff']) } }),
  box('linear-gradient-35', { backgroundGradient: { kind: 'linear', angleDegrees: 35, stops: stops(['#ff0000', '#00ff00', '#0000ff']) } }),
  box('transparent-gradient', { backgroundGradient: { kind: 'linear', angleDegrees: 90, stops: stops(['#ff0000', 'transparent']) } }),
  box('gradient-over-color', { backgroundColor: '#cc2244', backgroundGradient: { kind: 'linear', angleDegrees: 90, stops: stops(['rgba(0,255,0,0.5)', 'rgba(0,0,255,0.5)']) } }),
  box('radial-ellipse', { backgroundGradient: { kind: 'radial', centerX: 0.5, centerY: 0.5, radius: Math.SQRT1_2, shape: 'ellipse', stops: stops(['#fff000', '#0022ff']) } }),
  box('rounded-corners', { backgroundColor: '#43da91', borderRadius: 40 }),
  box('per-corner-radius', { backgroundColor: '#43da91', borderTopLeftRadius: 55, borderTopRightRadius: 10, borderBottomRightRadius: 35, borderBottomLeftRadius: 0 }),
  box('uniform-border', { backgroundColor: '#273955', borderRadius: 30, borderColor: '#f28ca4', borderWidth: 8 }),
  box('per-side-border', { backgroundColor: '#273955', borderTopColor: '#ff0000', borderRightColor: '#00ff00', borderBottomColor: '#0000ff', borderLeftColor: '#ffff00', borderTopWidth: 12, borderRightWidth: 8, borderBottomWidth: 12, borderLeftWidth: 8 }),
  box('outer-shadow', { backgroundColor: '#f8f8f8', borderRadius: 30, boxShadow: shadow(32) }),
  box('inset-shadow', { backgroundColor: '#f8f8f8', borderRadius: 30, boxShadow: shadow(32, true) }),
  box('hard-shadow', { backgroundColor: '#f8f8f8', borderRadius: 30, boxShadow: shadow(0) }),
  box('rounded-clip', { borderRadius: 50, backgroundColor: '#ff0000' }, {
    clipChildren: true, children: [box('clip-fill', { backgroundColor: '#00ff00' })],
  }),
  box('overflow-visible', { borderRadius: 50 }, { children: [box('visible-fill', { backgroundColor: '#00ff00' })] }),
  box('nested-clip', { borderRadius: 45 }, {
    clipChildren: true,
    children: [box('inner-clip', { borderRadius: 45 }, { bounds: rect(150, 30, 230, 150), clipChildren: true,
      children: [box('nested-fill', { backgroundColor: '#00aaff' })] })],
  }),
  box('z-order', {}, { children: [
    box('z-front', { backgroundColor: '#00ff00' }, { zIndex: 2, bounds: rect(90, 85, 220, 100) }),
    box('z-back', { backgroundColor: '#ff0000' }, { zIndex: 1 }),
  ] }),
  box('rotation', { backgroundColor: '#00cdaa', rotateDeg: 15 }),
  image('image-cover', { objectFit: 'cover' }),
  image('image-contain', { objectFit: 'contain' }),
  image('image-fill', { objectFit: 'fill' }),
  image('image-origin', { objectFit: 'cover', objectPosition: { x: 1, y: 0 } }),
  image('image-opacity', { objectFit: 'cover', opacity: 0.5 }),
  image('image-rounded-clip', { objectFit: 'cover', borderRadius: 45 }),
  image('image-webp', { objectFit: 'cover' }, { image: { assetType: 'images', assetName: 'cg/title.webp' } }),
  ...[
    ['brightness', { brightness: 0.5 }], ['saturate', { saturate: 0.1 }],
    ['contrast', { contrast: 1.6 }], ['grayscale', { grayscale: 1 }],
    ['sepia', { sepia: 1 }], ['hue-rotate', { hueRotate: 90 }],
    ['invert', { invert: 1 }], ['blur', { blur: 8 }],
  ].map(([id, filter]) => image(`image-${id}`, { objectFit: 'cover', filter: { brightness: 1, saturate: 1, ...filter } })),
  box('background-image', { backgroundImage: { assetType: 'images', assetName: 'backgrounds/morning-city.jpg' }, backgroundSize: 'cover', backgroundPosition: { x: 0.5, y: 0.5 }, borderRadius: 30 }),
  text('latin-text', 'Hello, QuaEngine!'),
  text('cjk-text', '\u539f\u751f\u6e32\u67d3\u4e0e\u6d4f\u89c8\u5668\u5bf9\u7167'),
  text('multiline', 'First line\nSecond line', { whiteSpace: 'pre-wrap' }),
  text('word-wrap', 'One two three four five six seven eight nine ten eleven twelve.'),
  text('letter-spacing', 'AVATAR office', { letterSpacing: 3 }),
  text('align-center', 'Centered text', { textAlign: 'center' }),
  text('align-right', 'Aligned right', { textAlign: 'right' }),
  text('text-bold', 'Weight 700 office', { fontWeight: 700 }),
  text('text-italic', 'Italic office AV', { fontStyle: 'italic' }),
  text('text-underline', 'Underlined text', { textDecoration: 'underline' }),
  text('text-strike', 'Deleted text', { textDecoration: 'line-through' }),
  text('text-uppercase', 'Mixed case text', { textTransform: 'uppercase' }),
  text('text-ellipsis', 'This is a very long line that must end with an ellipsis.', { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
  text('text-shadow', 'Shadow text', { textShadow: { offsetX: 2, offsetY: 3, blurRadius: 4, spreadRadius: 0, color: '#ff00ff', inset: false } }),
  text('ligatures', 'office affinity ffi fi fl'),
  text('bidi-arabic', '\u0645\u0631\u062d\u0628\u0627 123 ABC \u0628\u0627\u0644\u0639\u0627\u0644\u0645'),
  image('image-none', { objectFit: 'none' }),
  image('image-scale-down', { objectFit: 'scale-down' }),
  box('backdrop-filter', {}, { children: [
    image('backdrop-source', { objectFit: 'cover' }),
    box('backdrop-glass', { backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: { blurRadius: 8 } },
      { bounds: rect(90, 85, 230, 85) }),
  ] }),
  ...[
    ['linebox-latin', 'Hello, QuaEngine!', {}],
    ['linebox-cjk', '\u539f\u751f\u6e32\u67d3\u4e0e\u6d4f\u89c8\u5668\u5bf9\u7167', {}],
    ['linebox-italic', 'Italic office AV', { fontStyle: 'italic' }],
    ['linebox-underline', 'Underlined text', { textDecoration: 'underline' }],
    ['linebox-ligatures', 'office affinity ffi fi fl', {}],
  ].map(([id, value, style]) => ({ ...text(id, value, style), bounds: rect(50, 55, 320, 38) })),
  text('combining-marks', 'Cafe\u0301 A\u030angstro\u0308m'),
  text('nowrap-clip', 'This is a very long line that will be clipped.', { whiteSpace: 'nowrap', textOverflow: 'clip' }),
  text('justify', 'One two three four five six seven eight nine ten eleven twelve.', { textAlign: 'justify' }),
  box('nested-group-opacity', { backgroundColor: '#ff0000', opacity: 0.5 }, {
    children: [box('nested-opacity-parent', { backgroundColor: '#00ff00', opacity: 0.5 }, {
      bounds: rect(100, 80, 160, 90), children: [box('nested-opacity-child', { backgroundColor: '#0000ff' }, {
        bounds: rect(150, 100, 80, 50),
      })],
    })],
  }),
  box('opacity-stacking-context', {}, { children: [
    box('context-back', { backgroundColor: '#ff0000', opacity: 0.5 }, { children: [
      box('context-local-front', { backgroundColor: '#00ff00' }, { zIndex: 100, bounds: rect(100, 80, 160, 90) }),
    ] }),
    box('context-front', { backgroundColor: '#0000ff' }, { zIndex: 1, bounds: rect(150, 100, 180, 100) }),
  ] }),
  ...[false, true].map(own => box(`backdrop-${own ? 'own' : 'parent'}-opacity`, {}, { children: [
    image(`glass-image-${own}`, { objectFit: 'cover' }),
    box(`glass-group-${own}`, { opacity: 0.5, ...(own ? { backdropFilter: { blurRadius: 8 } } : {}) }, { children: [
      box(`glass-red-${own}`, { backgroundColor: '#ff0000' }, { bounds: rect(80, 75, 120, 90) }),
      box(`glass-panel-${own}`, { backgroundColor: 'rgba(255,255,255,0.2)', ...(own ? {} : { backdropFilter: { blurRadius: 8 } }) },
        { bounds: rect(100, 95, 230, 85) }),
    ] }),
  ] })),
  text('italic-clipped-shadow', 'Italic office very long clipped text', { fontStyle: 'italic', whiteSpace: 'nowrap',
    textShadow: { offsetX: 2, offsetY: 3, blurRadius: 4, spreadRadius: 0, color: '#ff00ff', inset: false } }),
  box('gradient-opacity', { opacity: 0.5, backgroundColor: '#cc2244',
    backgroundGradient: { kind: 'linear', angleDegrees: 90, stops: stops(['rgba(0,255,0,0.5)', 'rgba(0,0,255,0.5)']) } }),
]

export function translateNode(source, x, y) {
  return { ...source, bounds: { ...source.bounds, x: source.bounds.x + x, y: source.bounds.y + y },
    children: source.children?.map(child => translateNode(child, x, y)) }
}

// This is a CSS oracle for already-resolved geometry, not an implementation of
// the native layout compiler. Browser layout is measured separately.
export function projectBrowserNode(node, parent, urls, origin = { x: 0, y: 0 }) {
  const element = document.createElement(node.kind === 'Image' ? 'img' : 'div')
  const b = node.bounds
  const s = node.style || {}
  element.id = node.id
  Object.assign(element.style, {
    position: 'absolute', boxSizing: 'border-box',
    left: `${b.x - origin.x}px`, top: `${b.y - origin.y}px`, width: `${b.width}px`, height: `${b.height}px`,
    opacity: (node.opacity ?? 1) * (s.opacity ?? 1),
    zIndex: String(node.zIndex || 0),
    backgroundColor: s.backgroundColor || 'transparent',
    overflow: node.kind === 'Image' || node.clipChildren || s.textOverflow ? 'hidden' : 'visible',
  })
  for (const key of ['color', 'textAlign', 'textDecoration', 'textTransform', 'whiteSpace', 'textOverflow', 'fontStyle', 'fontWeight', 'objectFit']) {
    if (s[key] !== undefined) element.style[key] = s[key]
  }
  for (const key of ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'fontSize', 'lineHeight', 'letterSpacing']) {
    if (s[key] !== undefined) element.style[key] = `${s[key]}px`
  }
  for (const side of ['', 'Top', 'Right', 'Bottom', 'Left']) {
    if (s[`border${side}Width`] !== undefined) {
      element.style[`border${side}Width`] = `${s[`border${side}Width`]}px`
      element.style[`border${side}Style`] = 'solid'
      element.style[`border${side}Color`] = s[`border${side}Color`] || s.borderColor || 'transparent'
    }
  }
  if (s.fontFamily) element.style.fontFamily = s.fontFamily.map(f => `"${f}"`).join(',')
  if (s.rotateDeg) element.style.transform = `rotate(${s.rotateDeg}deg)`
  for (const kind of ['boxShadow', 'textShadow']) {
    const v = s[kind]
    if (v) element.style[kind] = `${v.inset ? 'inset ' : ''}${v.offsetX}px ${v.offsetY}px ${v.blurRadius}px ${kind === 'boxShadow' ? `${v.spreadRadius}px ` : ''}${v.color}`
  }
  if (s.backgroundGradient) {
    const g = s.backgroundGradient
    const colors = g.stops.map(stop => `${stop.color} ${stop.position * 100}%`).join(',')
    element.style.backgroundImage = g.kind === 'linear'
      ? `linear-gradient(${g.angleDegrees}deg,${colors})`
      : `radial-gradient(ellipse at ${(g.centerX ?? 0.5) * 100}% ${(g.centerY ?? 0.5) * 100}%,${colors})`
  }
  if (s.backgroundImage) {
    element.style.backgroundImage = `url("${urls[s.backgroundImage.assetName]}")`
    element.style.backgroundSize = s.backgroundSize || 'cover'
    element.style.backgroundPosition = `${(s.backgroundPosition?.x ?? 0.5) * 100}% ${(s.backgroundPosition?.y ?? 0.5) * 100}%`
  }
  if (s.filter) {
    const f = s.filter
    element.style.filter = `brightness(${f.brightness ?? 1}) saturate(${f.saturate ?? 1}) contrast(${f.contrast ?? 1}) grayscale(${f.grayscale ?? 0}) sepia(${f.sepia ?? 0}) hue-rotate(${f.hueRotate ?? 0}deg) invert(${f.invert ?? 0}) blur(${f.blur ?? 0}px)`
  }
  if (s.backdropFilter) element.style.backdropFilter = `blur(${s.backdropFilter.blurRadius}px)`
  if (node.image) {
    element.src = urls[node.image.assetName]
    element.style.objectPosition = `${(s.objectPosition?.x ?? 0.5) * 100}% ${(s.objectPosition?.y ?? 0.5) * 100}%`
  }
  if (node.text) element.textContent = node.text
  parent.append(element)
  for (const child of node.children || []) projectBrowserNode(child, element, urls, b)
}
