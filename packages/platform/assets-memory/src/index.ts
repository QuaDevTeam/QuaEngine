import type {
  AssetFetchResult,
  QuaAssetsConfig,
  AssetRuntimeAdapter,
  AssetStorage,
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
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ])
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
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
  const encoder = (globalThis as unknown as { TextEncoder?: new () => { encode: (input: string) => Uint8Array } }).TextEncoder
  if (encoder) {
    return new encoder().encode(value)
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
  const decoder = (globalThis as unknown as { TextDecoder?: new () => { decode: (input: Uint8Array) => string } }).TextDecoder
  if (decoder) {
    return new decoder().decode(bytes)
  }
  let output = ''
  for (let i = 0; i < bytes.length; i++) {
    output += String.fromCharCode(bytes[i])
  }
  return output
}
