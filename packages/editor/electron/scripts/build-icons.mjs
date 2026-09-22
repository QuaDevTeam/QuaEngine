import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = new URL('../../../../assets/brand/quaeditor-icon.png', import.meta.url)
const output = new URL('../dist/icons/', import.meta.url)
const artwork = await readFile(source)
const metadata = await sharp(artwork).metadata()
if (metadata.width !== 1024 || metadata.height !== 1024 || !metadata.hasAlpha)
  throw new Error('Editor icon must be a 1024 × 1024 RGBA PNG.')
await mkdir(output, { recursive: true })
await writeFile(new URL('quaeditor.png', output), artwork)

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const images = new Map(await Promise.all(sizes.map(async size => [
  size,
  await sharp(artwork).resize(size, size).png().toBuffer(),
])))

// Modern ICNS stores PNG representations, including explicit Retina slots.
// Build it on every host, without requiring Apple's iconutil in CI.
const representations = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]
const chunks = representations.map(([type, size]) => {
  const png = images.get(size)
  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32BE(png.length + 8, 4)
  return Buffer.concat([header, png])
})
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 4, 'ascii')
icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
await writeFile(new URL('quaeditor.icns', output), Buffer.concat([icnsHeader, ...chunks]))

// Windows Vista+ accepts PNG payloads in ICO at all these pixel sizes.
const windowsSizes = sizes.filter(size => size <= 256)
const icoHeader = Buffer.alloc(6 + windowsSizes.length * 16)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(windowsSizes.length, 4)
let offset = icoHeader.length
const windowsImages = windowsSizes.map((size, index) => {
  const png = images.get(size)
  const entry = 6 + index * 16
  icoHeader[entry] = icoHeader[entry + 1] = size === 256 ? 0 : size
  icoHeader.writeUInt16LE(1, entry + 4)
  icoHeader.writeUInt16LE(32, entry + 6)
  icoHeader.writeUInt32LE(png.length, entry + 8)
  icoHeader.writeUInt32LE(offset, entry + 12)
  offset += png.length
  return png
})
await writeFile(new URL('quaeditor.ico', output), Buffer.concat([icoHeader, ...windowsImages]))
process.stdout.write('Editor icons: dist/icons/quaeditor.{png,icns,ico}\n')
