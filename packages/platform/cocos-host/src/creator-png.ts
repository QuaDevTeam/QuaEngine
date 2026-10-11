/** PNG encoding for Creator readPixels. Uses stored DEFLATE blocks, without Node or DOM. */
export function encodeCreatorPng(rgba: Uint8Array, width: number, height: number, flipY = true): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4)
    throw new Error('Invalid Creator capture dimensions.')
  const raw = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const row = flipY ? height - y - 1 : y
    raw.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const blocks = Math.ceil(raw.length / 65535)
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  zlib.set([0x78, 0x01])
  let offset = 2
  for (let i = 0; i < raw.length; i += 65535) {
    const length = Math.min(65535, raw.length - i)
    zlib.set([i + length === raw.length ? 1 : 0, length & 255, length >> 8, (~length) & 255, ((~length) >> 8) & 255], offset)
    offset += 5
    zlib.set(raw.subarray(i, i + length), offset)
    offset += length
  }
  let a = 1
  let b = 0
  for (const value of raw) {
    a = (a + value) % 65521
    b = (b + a) % 65521
  }
  new DataView(zlib.buffer).setUint32(offset, (b << 16) | a)
  const chunk = (type: string, bytes: Uint8Array) => {
    const out = new Uint8Array(bytes.length + 12)
    const view = new DataView(out.buffer)
    view.setUint32(0, bytes.length)
    out.set(Array.from(type, char => char.charCodeAt(0)), 4)
    out.set(bytes, 8)
    let crc = 0xFFFFFFFF
    for (const value of out.subarray(4, -4)) {
      crc ^= value
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0)
    }
    view.setUint32(out.length - 4, (crc ^ 0xFFFFFFFF) >>> 0)
    return out
  }
  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, width)
  headerView.setUint32(4, height)
  header[8] = 8
  header[9] = 6
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(chunks.reduce((sum, value) => sum + value.length, 0))
  offset = 0
  for (const value of chunks) {
    out.set(value, offset)
    offset += value.length
  }
  return out
}
