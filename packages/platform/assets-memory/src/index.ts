import type {
  AssetFetchResult,
  AssetRuntimeAdapter,
  AssetStorage,
  QuaAssetsConfig,
} from '@quajs/assets'
import { MemoryAssetStorage, QuaAssets } from '@quajs/assets'

export interface MemoryAssetsAdapterOptions {
  files?: Record<string, Uint8Array | ArrayBuffer | string>
  storage?: AssetStorage
  now?: () => number
}

export interface MemoryAssetsRuntimeAdapter extends AssetRuntimeAdapter {
  setFile: (url: string, data: Uint8Array | ArrayBuffer | string) => void
  deleteFile: (url: string) => void
  clearFiles: () => void
}

export function createMemoryAssetsAdapter(options: MemoryAssetsAdapterOptions = {}): MemoryAssetsRuntimeAdapter {
  const files = new Map<string, Uint8Array>()
  for (const [url, data] of Object.entries(options.files || {})) {
    files.set(normalizeMemoryUrl(url), toBytes(data))
  }

  const adapter: MemoryAssetsRuntimeAdapter = {
    name: 'memory',
    storage: options.storage || new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url): Promise<AssetFetchResult> {
        const normalized = normalizeMemoryUrl(url)
        const data = files.get(normalized)
        if (!data) {
          throw new Error(`Memory asset not found: ${url}`)
        }
        return {
          data: new Uint8Array(data),
          size: data.byteLength,
        }
      },
      async fetchJSON<T = unknown>(url: string): Promise<T> {
        const data = files.get(normalizeMemoryUrl(url))
        if (!data) {
          throw new Error(`Memory JSON asset not found: ${url}`)
        }
        return JSON.parse(bytesToUtf8(data)) as T
      },
    },
    crypto: {
      sha256,
    },
    now: options.now,
    setFile(url, data) {
      files.set(normalizeMemoryUrl(url), toBytes(data))
    },
    deleteFile(url) {
      files.delete(normalizeMemoryUrl(url))
    },
    clearFiles() {
      files.clear()
    },
  }

  return adapter
}

export function createMemoryAssets(config: Omit<QuaAssetsConfig, 'adapter'> & {
  adapter?: MemoryAssetsRuntimeAdapter
  files?: Record<string, Uint8Array | ArrayBuffer | string>
} = {}): QuaAssets {
  const adapter = config.adapter || createMemoryAssetsAdapter({ files: config.files })
  return new QuaAssets({
    ...config,
    adapter,
  })
}

function normalizeMemoryUrl(url: string): string {
  return url.replace(/^memory:\/\//, '').replace(/^\/+/, '')
}

function toBytes(data: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof data === 'string')
    return utf8ToBytes(data)
  if (data instanceof Uint8Array)
    return new Uint8Array(data)
  return new Uint8Array(data)
}

// Small platform-neutral SHA-256 implementation for tests and lightweight runtimes.
async function sha256(data: Uint8Array): Promise<string> {
  const hash = sha256Bytes(data)
  return Array.from(hash).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function sha256Bytes(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
  ])
  const k = new Uint32Array([
    0x428A2F98,
    0x71374491,
    0xB5C0FBCF,
    0xE9B5DBA5,
    0x3956C25B,
    0x59F111F1,
    0x923F82A4,
    0xAB1C5ED5,
    0xD807AA98,
    0x12835B01,
    0x243185BE,
    0x550C7DC3,
    0x72BE5D74,
    0x80DEB1FE,
    0x9BDC06A7,
    0xC19BF174,
    0xE49B69C1,
    0xEFBE4786,
    0x0FC19DC6,
    0x240CA1CC,
    0x2DE92C6F,
    0x4A7484AA,
    0x5CB0A9DC,
    0x76F988DA,
    0x983E5152,
    0xA831C66D,
    0xB00327C8,
    0xBF597FC7,
    0xC6E00BF3,
    0xD5A79147,
    0x06CA6351,
    0x14292967,
    0x27B70A85,
    0x2E1B2138,
    0x4D2C6DFC,
    0x53380D13,
    0x650A7354,
    0x766A0ABB,
    0x81C2C92E,
    0x92722C85,
    0xA2BFE8A1,
    0xA81A664B,
    0xC24B8B70,
    0xC76C51A3,
    0xD192E819,
    0xD6990624,
    0xF40E3585,
    0x106AA070,
    0x19A4C116,
    0x1E376C08,
    0x2748774C,
    0x34B0BCB5,
    0x391C0CB3,
    0x4ED8AA4A,
    0x5B9CCA4F,
    0x682E6FF3,
    0x748F82EE,
    0x78A5636F,
    0x84C87814,
    0x8CC70208,
    0x90BEFFFA,
    0xA4506CEB,
    0xBEF9A3F7,
    0xC67178F2,
  ])

  const bitLength = message.length * 8
  const paddedLength = (((message.length + 9 + 63) >> 6) << 6)
  const padded = new Uint8Array(paddedLength)
  padded.set(message)
  padded[message.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const w = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, h[i], false)
  }
  return out
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

function utf8ToBytes(value: string): Uint8Array {
  const TextEncoderCtor = (globalThis as unknown as { TextEncoder?: new () => { encode: (input: string) => Uint8Array } }).TextEncoder
  if (TextEncoderCtor) {
    return new TextEncoderCtor().encode(value)
  }
  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    }
    else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    }
    else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }
  return new Uint8Array(bytes)
}

function bytesToUtf8(bytes: Uint8Array): string {
  const TextDecoderCtor = (globalThis as unknown as { TextDecoder?: new () => { decode: (input: Uint8Array) => string } }).TextDecoder
  if (TextDecoderCtor) {
    return new TextDecoderCtor().decode(bytes)
  }
  let output = ''
  for (let i = 0; i < bytes.length; i++) {
    output += String.fromCharCode(bytes[i])
  }
  return output
}
