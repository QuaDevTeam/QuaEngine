import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const uiPaint = process.argv.includes('--ui')
const fixturePath = resolve(
  root,
  `packages/native/test-fixtures/renderer/${uiPaint ? 'ui-paint' : 'box-shadow-feather'}-frame.json`,
)
const capturePath = resolve(root, `packages/native/target/${uiPaint ? 'ui-paint' : 'box-shadow'}-lab.png`)
const dev = process.argv.includes('--dev')

if (!existsSync(fixturePath)) {
  throw new Error(`Native box-shadow fixture is missing: ${fixturePath}`)
}
if (!dev) {
  rmSync(capturePath, { force: true })
}

const env = {
  ...process.env,
  QUA_NATIVE_APP_NAME: 'Qua Native Box Shadow Lab',
  QUA_NATIVE_BUNDLE_ID: 'dev.quajs.renderer.boxshadow',
  QUA_NATIVE_APP_VERSION: '0.1.0',
  QUA_NATIVE_BUILD_NUMBER: '1',
  QUA_NATIVE_RENDERER_WINDOW_SMOKE: '1',
  QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAME: fixturePath,
  QUA_NATIVE_RENDERER_WINDOW_SMOKE_FRAMES: '2',
  QUA_NATIVE_RENDERER_WINDOW_TITLE: 'Qua Native Box Shadow Lab',
}

delete env.QUA_NATIVE_TARGET_BUNDLE_MANIFEST
delete env.QUA_NATIVE_RENDERER_WINDOW_DEV_QPK
delete env.QUA_NATIVE_RENDERER_WINDOW_DEMO_E2E
delete env.QUA_NATIVE_QUICKJS_BRIDGE
delete env.QUA_NATIVE_PRODUCT_BRIDGE

if (dev) {
  env.QUA_NATIVE_RENDERER_WINDOW_DEV = '1'
}
else {
  delete env.QUA_NATIVE_RENDERER_WINDOW_DEV
  env.QUA_NATIVE_RENDERER_WINDOW_CAPTURE_PATH = capturePath
}

const result = spawnSync(
  'cargo',
  [
    'run',
    '--locked',
    '--manifest-path',
    'packages/native/Cargo.toml',
    '-p',
    'quajs_native_app',
    '--features',
    'native-window',
    '--quiet',
  ],
  {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: dev ? 'inherit' : 'pipe',
  },
)

if (dev) {
  process.exitCode = result.status ?? 1
}
else {
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Native box-shadow renderer exited with status ${result.status}`)
  }
  if (!existsSync(capturePath)) {
    throw new Error(`Native box-shadow renderer did not write ${capturePath}`)
  }

  const image = decodeRgbaPng(readFileSync(capturePath))
  const scaleX = image.width / 1920
  const scaleY = image.height / 1080
  if (Math.abs(scaleX - scaleY) > 0.01) {
    throw new Error(`Unexpected box-shadow capture scale ${scaleX} x ${scaleY}`)
  }

  const sample = (x, y) => pixelAt(image, x * scaleX, y * scaleY)
  const background = sample(40, 540)
  const outerSamples = [650, 670, 690, 710, 730, 750, 770, 778].map(x => ({
    x,
    rgba: sample(x, 510),
  }))
  const outerDeltas = outerSamples.map(({ rgba }) => colorDistance(rgba, background))
  assertMonotonicRise(outerDeltas, 'soft outer shadow')
  if (new Set(outerDeltas.map(value => Math.round(value / 3))).size < 5) {
    throw new Error(`Soft outer shadow did not produce enough feather levels: ${outerDeltas}`)
  }
  if (outerDeltas[0] > 4 || outerDeltas.at(-1) < 40) {
    throw new Error(`Soft outer shadow did not transition from background to a visible tail: ${outerDeltas}`)
  }

  const hardOutside = colorDistance(sample(190, 510), background)
  const hardRing = colorDistance(sample(205, 510), background)
  if (hardOutside > 4 || hardRing < 80) {
    throw new Error(`Hard control shadow is not a sharp visible baseline: outside=${hardOutside}, ring=${hardRing}`)
  }

  const insetFill = sample(1520, 510)
  const insetDeltas = [1344, 1352, 1368, 1392, 1432].map(x =>
    colorDistance(sample(x, 510), insetFill),
  )
  assertMonotonicFall(insetDeltas, 'soft inset shadow')
  if (new Set(insetDeltas.map(value => Math.round(value / 3))).size < 4) {
    throw new Error(`Soft inset shadow did not produce enough feather levels: ${insetDeltas}`)
  }

  if (uiPaint) {
    const checks = [
      [400, 150, [0, 255, 0], 'gradient above opaque background color'],
      [224, 804, background, 'rounded child corner'],
      [400, 890, [0, 255, 0], 'rounded child center'],
      [925, 805, background, 'nested clip corner'],
      [1030, 890, [0, 170, 255], 'nested clip center'],
      [1344, 804, [255, 0, 255], 'overflow visible remains square'],
    ]
    for (const [x, y, expected, label] of checks) {
      const actual = sample(x, y)
      if (colorDistance(actual, expected) > 12)
        throw new Error(`${label}: expected ${expected}, got ${actual}`)
    }
  }

  if (uiPaint && process.argv.includes('--web')) {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ channel: process.env.QUA_PARITY_BROWSER || 'chrome' })
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
      const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
      const rootNode = fixture.view.ui.overlays[0].surface.root
      await page.setContent('<style>html,body{margin:0;background:#20252b}div{position:absolute;box-sizing:border-box}</style>')
      await page.evaluate(root => {
        function project(node, parent, origin = { x: 0, y: 0 }) {
          const element = document.createElement('div')
          const b = node.bounds
          const s = node.style || {}
          Object.assign(element.style, {
            left: `${b.x - origin.x}px`, top: `${b.y - origin.y}px`,
            width: `${b.width}px`, height: `${b.height}px`,
            backgroundColor: s.backgroundColor || 'transparent',
            borderRadius: `${s.borderRadius || 0}px`,
            overflow: node.clipChildren ? 'hidden' : 'visible',
          })
          if (s.boxShadow) {
            const v = s.boxShadow
            element.style.boxShadow = `${v.inset ? 'inset ' : ''}${v.offsetX}px ${v.offsetY}px ${v.blurRadius}px ${v.spreadRadius}px ${v.color}`
          }
          if (s.backgroundGradient) {
            const g = s.backgroundGradient
            element.style.backgroundImage = `linear-gradient(${g.angleDegrees}deg, ${g.stops.map(stop => `${stop.color} ${stop.position * 100}%`).join(', ')})`
          }
          parent.append(element)
          for (const child of node.children || []) project(child, element, b)
        }
        project(root, document.body)
      }, rootNode)
      const webPath = resolve(root, 'packages/native/target/ui-paint-web.png')
      await page.screenshot({ path: webPath })
      const webImage = decodeRgbaPng(readFileSync(webPath))
      if (webImage.width !== image.width || webImage.height !== image.height)
        throw new Error('Native/Web UI paint capture dimensions differ')
      const comparisons = [
        ['hard-shadow', [180, 300, 620, 710], 1.5],
        ['outer-shadow', [620, 220, 1300, 800], 5],
        ['inset-shadow', [1340, 360, 1700, 660], 5],
        ['rounded-overflow', [200, 780, 600, 1000], 1.5],
        ['nested-overflow', [760, 760, 1160, 1000], 1.5],
        ['background-order', [200, 80, 600, 220], 1.5],
      ].map(([name, [left, top, right, bottom], tolerance]) => {
        let total = 0
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const offset = (y * image.width + x) * 4
            for (let channel = 0; channel < 3; channel++)
              total += Math.abs(image.rgba[offset + channel] - webImage.rgba[offset + channel])
          }
        }
        const meanChannelError = total / ((right - left) * (bottom - top) * 3)
        return { name, meanChannelError, tolerance, passed: meanChannelError <= tolerance }
      })
      writeFileSync(resolve(root, 'packages/native/target/ui-paint-comparison.json'), JSON.stringify(comparisons, null, 2))
      if (comparisons.some(check => !check.passed))
        throw new Error(`Native/Web UI paint regression: ${JSON.stringify(comparisons)}`)
      const reviewPath = resolve(root, 'packages/native/target/ui-paint-review.html')
      writeFileSync(reviewPath, `<!doctype html><meta charset="utf-8"><title>Native / Web UI paint</title>
<style>body{background:#20252b;color:white;font:16px sans-serif}section{position:relative;width:100%}img{width:100%;display:block}#native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:100%}</style>
<p>Native 左 / Web 右。比较阴影、圆角、嵌套裁剪与背景绘制顺序；相同逻辑坐标，不代表完整 CSS 布局兼容。</p>
<section><img src="ui-paint-web.png"><img id="native" src="ui-paint-lab.png"></section>
<input type="range" value="50" oninput="document.getElementById('native').style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'">`)
      console.log(`Browser reference and comparison: ${reviewPath}`)
    } finally { await browser.close() }
  }

  console.log(JSON.stringify({
    test: uiPaint ? 'native.ui.real-gpu.paint' : 'native.box-shadow.real-gpu.feather',
    capturePath,
    dimensions: `${image.width}x${image.height}`,
    outerDeltas,
    insetDeltas,
    result: 'passed',
  }))
}

function assertMonotonicRise(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] + 3 < values[index - 1]) {
      throw new Error(`${label} is not a continuous rising profile: ${values}`)
    }
  }
}

function assertMonotonicFall(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1] + 3) {
      throw new Error(`${label} is not a continuous falling profile: ${values}`)
    }
  }
}

function colorDistance(left, right) {
  return Math.round(
    Math.abs(left[0] - right[0])
    + Math.abs(left[1] - right[1])
    + Math.abs(left[2] - right[2]),
  )
}

function pixelAt(image, x, y) {
  const pixelX = Math.max(0, Math.min(image.width - 1, Math.round(x)))
  const pixelY = Math.max(0, Math.min(image.height - 1, Math.round(y)))
  const offset = (pixelY * image.width + pixelX) * 4
  return Array.from(image.rgba.subarray(offset, offset + 4))
}

function decodeRgbaPng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!bytes.subarray(0, 8).equals(signature)) {
    throw new Error('Box-shadow capture is not a PNG')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    }
    else if (type === 'IDAT') {
      idat.push(data)
    }
    offset += length + 12
    if (type === 'IEND') {
      break
    }
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(
      `Expected a non-interlaced 8-bit RGB/RGBA PNG, got ${width}x${height} depth=${bitDepth} type=${colorType}`,
    )
  }

  const packed = inflateSync(Buffer.concat(idat))
  const bytesPerPixel = colorType === 6 ? 4 : 3
  const stride = width * bytesPerPixel
  const rgba = Buffer.alloc(stride * height)
  let sourceOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset]
    sourceOffset += 1
    const rowOffset = y * stride
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[sourceOffset]
      sourceOffset += 1
      const left = x >= bytesPerPixel ? rgba[rowOffset + x - bytesPerPixel] : 0
      const up = y > 0 ? rgba[rowOffset + x - stride] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? rgba[rowOffset + x - stride - bytesPerPixel]
        : 0
      rgba[rowOffset + x] = (raw + filterPredictor(filter, left, up, upperLeft)) & 0xff
    }
  }
  if (bytesPerPixel === 4) return { width, height, rgba }
  const expanded = Buffer.alloc(width * height * 4, 255)
  for (let i = 0; i < width * height; i++) rgba.copy(expanded, i * 4, i * 3, i * 3 + 3)
  return { width, height, rgba: expanded }
}

function filterPredictor(filter, left, up, upperLeft) {
  switch (filter) {
    case 0: return 0
    case 1: return left
    case 2: return up
    case 3: return Math.floor((left + up) / 2)
    case 4: return paeth(left, up, upperLeft)
    default: throw new Error(`Unsupported PNG filter ${filter}`)
  }
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
  if (upDistance <= upperLeftDistance) return up
  return upperLeft
}
