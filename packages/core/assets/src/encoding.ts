export function utf8ToBytes(value: string): Uint8Array {
  const TextEncoderCtor = (globalThis as unknown as { TextEncoder?: new () => { encode: (input: string) => Uint8Array } }).TextEncoder
  if (TextEncoderCtor) {
    return new TextEncoderCtor().encode(value)
  }

  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    let codePoint = value.charCodeAt(i)
    if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 1 < value.length) {
      const next = value.charCodeAt(++i)
      codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (next - 0xDC00)
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint)
    }
    else if (codePoint < 0x800) {
      bytes.push(0xC0 | (codePoint >> 6), 0x80 | (codePoint & 0x3F))
    }
    else if (codePoint < 0x10000) {
      bytes.push(0xE0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F))
    }
    else {
      bytes.push(0xF0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3F), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F))
    }
  }
  return new Uint8Array(bytes)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  const TextDecoderCtor = (globalThis as unknown as { TextDecoder?: new () => { decode: (input: Uint8Array) => string } }).TextDecoder
  if (TextDecoderCtor) {
    return new TextDecoderCtor().decode(bytes)
  }

  let result = ''
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++]
    if (first < 0x80) {
      result += String.fromCharCode(first)
    }
    else if (first < 0xE0) {
      const second = bytes[i++] & 0x3F
      result += String.fromCharCode(((first & 0x1F) << 6) | second)
    }
    else if (first < 0xF0) {
      const second = bytes[i++] & 0x3F
      const third = bytes[i++] & 0x3F
      result += String.fromCharCode(((first & 0x0F) << 12) | (second << 6) | third)
    }
    else {
      const second = bytes[i++] & 0x3F
      const third = bytes[i++] & 0x3F
      const fourth = bytes[i++] & 0x3F
      const codePoint = ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth
      const adjusted = codePoint - 0x10000
      result += String.fromCharCode(0xD800 + (adjusted >> 10), 0xDC00 + (adjusted & 0x3FF))
    }
  }
  return result
}

export interface ConsoleLike {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function getConsole(): ConsoleLike {
  return ((globalThis as unknown as { console?: ConsoleLike }).console || {
    log() {},
    warn() {},
    error() {},
  })
}
