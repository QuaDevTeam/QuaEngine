/** Real Chromium pixel check of shared character material math; no game state. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { characterLightingSvg } from '@quajs/renderer-web/plugins/character'

const output = resolve(process.env.QUA_LIGHTING_OUTPUT || '.generated/qa/environment-lighting/pixels')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] })
try {
  const page = await browser.newPage()
  const materials = [
    undefined,
    { ambient: [0.8, 0.9, 1] },
    { ambient: [1, 1, 1], shade: { color: [0.6, 0.8, 1], from: [0, 0], to: [1, 0] } },
  ].map((profile, i) => characterLightingSvg(`fixture-${i}`, profile))
  const result = await page.evaluate(async materials => {
    const ns = 'http://www.w3.org/2000/svg'
    const element = node => {
      const el = document.createElementNS(ns, node.tag)
      for (const [key, value] of Object.entries(node.attrs)) el.setAttribute(key, String(value))
      for (const child of node.children || []) el.append(element(child))
      return el
    }
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    // Identical RGB across rows; columns include transparent, soft and solid alpha.
    const image = ctx.createImageData(64, 16)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
      const index = (y * 64 + x) * 4
      image.data.set([200, 160, 120, [0, 32, 64, 128, 192, 224, 254, 255][x % 8]], index)
    }
    ctx.putImageData(image, 0, 0)
    const source = canvas.toDataURL()
    const outputs = []
    for (const [i, tree] of materials.entries()) {
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('width', '64'); svg.setAttribute('height', '16')
      if (tree) svg.append(element(tree.children[0]))
      const sourceImage = document.createElementNS(ns, 'image')
      sourceImage.setAttribute('href', source)
      sourceImage.setAttribute('width', '64'); sourceImage.setAttribute('height', '16')
      if (tree) sourceImage.setAttribute('filter', `url(#fixture-${i})`)
      svg.append(sourceImage)
      const img = new Image()
      img.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
      await img.decode()
      ctx.clearRect(0, 0, 64, 16); ctx.drawImage(img, 0, 0)
      outputs.push({ pixels: [...ctx.getImageData(0, 0, 64, 16).data], png: canvas.toDataURL().split(',')[1] })
    }
    return outputs
  }, materials)
  const report = { alphaMaxDifference: [], opaqueSamples: [], softEdgeMaxDifference: 0 }
  for (let i = 0; i < result.length; i++) {
    await writeFile(resolve(output, `fixture-${i}.png`), Buffer.from(result[i].png, 'base64'))
    let max = 0
    for (let p = 3; p < result[0].pixels.length; p += 4) max = Math.max(max, Math.abs(result[i].pixels[p] - result[0].pixels[p]))
    report.alphaMaxDifference.push(max)
    assert.equal(max, 0, 'grading must preserve every transparent/soft/opaque alpha texel')
    report.opaqueSamples.push([result[i].pixels.slice(7 * 4, 7 * 4 + 4), result[i].pixels.slice(63 * 4, 63 * 4 + 4)])
  }
  assert(Math.abs(report.opaqueSamples[1][0][0] - 160) <= 1, 'ambient red gain applies in sRGB')
  assert(report.opaqueSamples[2][0][0] > report.opaqueSamples[2][1][0] + 40, 'directional shade varies spatially')
  assert.equal(report.opaqueSamples[2][0][2], report.opaqueSamples[0][0][2], 'unmodified blue channel remains unchanged')
  // Alpha must not contaminate RGB with a white or black silhouette edge.
  for (let x = 0; x < 64; x++) {
    const p = x * 4, a = result[2].pixels[p + 3]
    if (!a) continue
    const expected = 200 * (1 - 0.4 * (x + 0.5) / 64)
    const difference = Math.abs(result[2].pixels[p] - expected)
    report.softEdgeMaxDifference = Math.max(report.softEdgeMaxDifference, difference)
    assert(difference <= 5, `unexpected halo at x=${x}, alpha=${a}`)
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await browser.close()
}
