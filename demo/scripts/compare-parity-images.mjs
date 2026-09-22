/**
 * Quantitative pixels from the real captures; geometry/content checks live in
 * the capture drivers. Antialiasing and CSS blur approximation have small errors.
 */
import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const dir = resolve(process.argv[2] || 'demo/dist/native/hud-parity')
const browser = await chromium.launch({ ...(process.env.QUA_PARITY_CHROMIUM ? { executablePath: process.env.QUA_PARITY_CHROMIUM } : { channel: 'chrome' }) })
const report = []
try {
  const page = await browser.newPage()
  for (const file of (await readdir(dir)).filter(n => /^web-.+\.png$/.test(n))) {
    const name = file.slice(4, -4)
    const data = await Promise.all([file, `native-${name}.png`].map(async name => `data:image/png;base64,${(await readFile(resolve(dir, name))).toString('base64')}`))
    const metrics = await page.evaluate(async (sources) => {
      const read = async (src) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, img.width, img.height)
        ctx.drawImage(img, 0, 0)
        return { width: img.width, height: img.height, bytes: ctx.getImageData(0, 0, img.width, img.height).data }
      }
      const [web, native] = await Promise.all(sources.map(read))
      if (web.width !== native.width || web.height !== native.height)
        throw new Error('Capture dimensions differ')
      const histogram = new Uint32Array(256)
      let total = 0
      let changed = 0
      const tiles = []
      for (let ty = 0; ty < 9; ty++) {
        for (let tx = 0; tx < 16; tx++) {
          let tileError = 0
          let samples = 0
          for (let y = Math.floor(ty * web.height / 9); y < Math.floor((ty + 1) * web.height / 9); y++) {
            for (let x = Math.floor(tx * web.width / 16); x < Math.floor((tx + 1) * web.width / 16); x++) {
              let peak = 0
              for (let c = 0; c < 3; c++) {
                const i = (y * web.width + x) * 4 + c
                const e = Math.abs(web.bytes[i] - native.bytes[i])
                histogram[e]++
                tileError += e
                peak = Math.max(peak, e)
                samples++
              }
              if (peak > 16)
                changed++
            }
          }
          total += tileError
          tiles.push({ tx, ty, mean: tileError / samples })
        }
      }
      let cumulative = 0
      let p95 = 0
      for (let i = 0; i < 256; i++) {
        cumulative += histogram[i]
        if (cumulative >= web.width * web.height * 3 * 0.95) {
          p95 = i
          break
        }
      }
      return { width: web.width, height: web.height, mean: total / (web.width * web.height * 3), p95, changedPixelFraction: changed / (web.width * web.height), worstTiles: tiles.sort((a, b) => b.mean - a.mean).slice(0, 5) }
    }, data)
    report.push({ name, ...metrics })
    console.warn(name, JSON.stringify(metrics))
  }
  await writeFile(resolve(dir, 'pixel-checks.json'), JSON.stringify(report, null, 2))
  if (!process.argv.includes('--measure-only'))
    assert(report.every(r => r.mean <= 3 && r.p95 <= 10), 'Visual difference exceeds review tolerance; see pixel-checks.json')
}
finally { await browser.close() }
