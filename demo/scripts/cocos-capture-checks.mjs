import assert from 'node:assert/strict'
import sharp from 'sharp'

// Check the captured framebuffer, including the area outside the logical stage.
export async function assertBlackBars(path, layout) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const sx = info.width / layout.containerWidth
  const sy = info.height / layout.containerHeight
  const left = layout.viewportX * sx
  const top = layout.viewportY * sy
  const right = left + layout.logicalWidth * layout.scale * sx
  const bottom = top + layout.logicalHeight * layout.scale * sy
  let checked = 0
  let brightest = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x >= left - 2 && x <= right + 2 && y >= top - 2 && y <= bottom + 2)
        continue
      const index = (y * info.width + x) * info.channels
      brightest = Math.max(brightest, data[index], data[index + 1], data[index + 2])
      checked++
    }
  }
  assert(checked > 0, 'The capture must contain a letterbox region')
  assert(brightest <= 3, `Content leaked outside the logical stage: brightest black-bar channel ${brightest}`)
  return { checkedPixels: checked, brightestChannel: brightest }
}
