#!/usr/bin/env node
// Samples the same logical points from the native WGPU capture and a Web
// screenshot so main-menu parity work can be checked numerically instead of by
// eye. Both inputs are expected to show the same 1920x1080 logical stage.
//
// Usage:
//   node scripts/native-web-parity-probe.mjs <native.png> <web.png> [source.jpg]
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright'

const CHROMIUM_PATH = process.env.QUA_PARITY_CHROMIUM
  ?? '/Volumes/BRData/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'

const STAGE_WIDTH = 1920
const STAGE_HEIGHT = 1080

// Points chosen to cover the scrim gradient across the stage: menu column,
// title band, centre, right edge, and the lower-right reflection.
const SAMPLE_POINTS = [
  [100, 200],
  [300, 150],
  [960, 300],
  [1700, 300],
  [1500, 900],
  [300, 900],
]

async function samplePixels(page, file, points) {
  await page.goto('about:blank')
  const dataUrl = `data:image/png;base64,${readFileSync(file).toString('base64')}`
  return page.evaluate(async ({ dataUrl, points, stageWidth, stageHeight }) => {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d', { colorSpace: 'srgb' })
    context.drawImage(image, 0, 0)
    return points.map(([x, y]) => {
      const sourceX = Math.round((x * image.width) / stageWidth)
      const sourceY = Math.round((y * image.height) / stageHeight)
      const pixel = context.getImageData(sourceX, sourceY, 1, 1).data
      return [pixel[0], pixel[1], pixel[2], pixel[3]]
    })
  }, { dataUrl, points, stageWidth: STAGE_WIDTH, stageHeight: STAGE_HEIGHT })
}

function formatRgb(pixel) {
  return `(${pixel.slice(0, 3).map(value => String(value).padStart(3)).join(',')})`
}

const [nativePath, webPath, sourcePath] = process.argv.slice(2)
if (!nativePath || !webPath) {
  console.error('usage: native-web-parity-probe.mjs <native.png> <web.png> [source.jpg]')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
try {
  const native = await samplePixels(page, nativePath, SAMPLE_POINTS)
  const web = await samplePixels(page, webPath, SAMPLE_POINTS)
  const source = sourcePath ? await samplePixels(page, sourcePath, SAMPLE_POINTS) : undefined

  console.log(`point${' '.repeat(7)}${source ? `source${' '.repeat(11)}` : ''}native           web              delta`)
  let worst = 0
  let total = 0
  SAMPLE_POINTS.forEach(([x, y], index) => {
    const deltas = [0, 1, 2].map(channel => Math.abs(native[index][channel] - web[index][channel]))
    const maxDelta = Math.max(...deltas)
    worst = Math.max(worst, maxDelta)
    total += maxDelta
    const columns = [
      `${x},${y}`.padEnd(12),
      source ? `${formatRgb(source[index])}${' '.repeat(6)}` : '',
      `${formatRgb(native[index])}  `,
      `${formatRgb(web[index])}  `,
      `max ${String(maxDelta).padStart(3)}`,
    ]
    console.log(columns.join(''))
  })
  console.log(`\nworst channel delta: ${worst}`)
  console.log(`mean of per-point worst deltas: ${(total / SAMPLE_POINTS.length).toFixed(1)}`)

  const opaque = native.every(pixel => pixel[3] === 255)
  if (!opaque) {
    // Capture encodes premultiplied RGB as straight alpha, so translucent
    // pixels would make the comparison meaningless rather than merely noisy.
    console.log('\nWARNING: native capture has pixels with alpha < 255; RGB comparison is unreliable there.')
  }
}
finally {
  await browser.close()
}
