import type {
  AssetCodec,
  AssetCrypto,
  AssetInfo,
  AssetType,
  BundleFormat,
  BundleManifest,
  DecompressionPlugin,
  DecryptionPlugin,
  LoadBundleOptions,
  StoredAsset,
} from './types'
import { unzip } from 'fflate'
import { bytesToUtf8 } from './encoding'
import { BundleLoadError, IntegrityError } from './types'

const QPK_MAGIC = 0x51504B00
const QPK_HEADER_SIZE = 32

export interface BundleLoaderOptions {
  crypto: AssetCrypto
  codec?: AssetCodec
  now?: () => number
}

export class BundleLoader {
  private decompressionPlugins = new Map<BundleFormat, DecompressionPlugin>()
  private decryptionPlugins: DecryptionPlugin[] = []
  private crypto: AssetCrypto
  private codec?: AssetCodec
  private now: () => number

  constructor(options: BundleLoaderOptions) {
    this.crypto = options.crypto
    this.codec = options.codec
    this.now = options.now || Date.now
  }

  registerDecompressionPlugin(plugin: DecompressionPlugin): void {
    for (const format of plugin.supportedFormats) {
      this.decompressionPlugins.set(format, plugin)
    }
  }

  registerDecryptionPlugin(plugin: DecryptionPlugin): void {
    this.decryptionPlugins.push(plugin)
  }

  async loadBundle(
    bytes: Uint8Array,
    bundleName: string,
    options: LoadBundleOptions = {},
  ): Promise<{ manifest: BundleManifest, assets: StoredAsset[] }> {
    try {
      const format = options.format || detectBundleFormat(bundleName, bytes)
      const { manifest, files } = await this.parseBundle(bytes, format)
      const assets = await this.createStoredAssets(files, manifest, bundleName)
      return { manifest, assets }
    }
    catch (error) {
      throw new BundleLoadError(
        `Failed to load bundle: ${error instanceof Error ? error.message : String(error)}`,
        bundleName,
      )
    }
  }

  private async parseBundle(
    bytes: Uint8Array,
    format: BundleFormat,
  ): Promise<{ manifest: BundleManifest, files: Map<string, Uint8Array> }> {
    const plugin = this.decompressionPlugins.get(format)
    if (plugin) {
      const files = await plugin.decompress(bytes, format)
      return { manifest: parseManifest(files), files }
    }

    if (format === 'zip') {
      const files = this.codec?.unzip ? await this.codec.unzip(bytes) : await unzipBytes(bytes)
      return { manifest: parseManifest(files), files }
    }

    return await this.parseQPK(bytes)
  }

  private async parseQPK(bytes: Uint8Array): Promise<{ manifest: BundleManifest, files: Map<string, Uint8Array> }> {
    const view = toDataView(bytes)
    if (bytes.byteLength < QPK_HEADER_SIZE) {
      throw new Error('Invalid QPK file: too small')
    }

    const magic = view.getUint32(0, false)
    if (magic !== QPK_MAGIC) {
      throw new Error('Invalid QPK file: magic number mismatch')
    }

    const version = view.getUint32(4, true)
    if (version !== 1) {
      throw new Error(`Unsupported QPK version: ${version}`)
    }

    const flags = view.getUint32(8, true)
    const headerSize = view.getUint32(12, true)
    if (headerSize !== QPK_HEADER_SIZE) {
      throw new Error(`Invalid QPK header size: ${headerSize}`)
    }

    const manifestOffset = readUint64LE(view, 16)
    const manifestSize = readUint64LE(view, 24)
    if (manifestOffset > bytes.byteLength || manifestOffset + manifestSize > bytes.byteLength) {
      throw new Error('Invalid QPK manifest bounds')
    }

    const files = new Map<string, Uint8Array>()
    let offset = headerSize
    while (offset < manifestOffset) {
      if (offset + 4 > manifestOffset) {
        throw new Error('Invalid QPK asset entry: missing path length')
      }
      const pathLength = view.getUint32(offset, true)
      offset += 4

      if (offset + pathLength + 4 > manifestOffset) {
        throw new Error('Invalid QPK asset entry: path out of bounds')
      }
      const path = bytesToUtf8(sliceBytes(bytes, offset, offset + pathLength))
      offset += pathLength

      const dataLength = view.getUint32(offset, true)
      offset += 4
      if (offset + dataLength > manifestOffset) {
        throw new Error(`Invalid QPK asset entry: ${path} data out of bounds`)
      }
      files.set(path, sliceBytes(bytes, offset, offset + dataLength))
      offset += dataLength
    }

    let manifestBytes = sliceBytes(bytes, manifestOffset, manifestOffset + manifestSize)
    if (flags & 2) {
      manifestBytes = await this.decryptBytes(manifestBytes, { type: 'manifest' })
    }
    if (flags & 1) {
      manifestBytes = await this.decompressLzma(manifestBytes)
    }

    const manifest = JSON.parse(bytesToUtf8(manifestBytes)) as BundleManifest
    files.set('manifest.json', manifestBytes)

    return { manifest, files }
  }

  private async decryptBytes(bytes: Uint8Array, metadata: Record<string, unknown>): Promise<Uint8Array> {
    let result = bytes

    for (const plugin of this.decryptionPlugins) {
      result = await plugin.decrypt(result, metadata)
    }

    if (this.decryptionPlugins.length === 0 && this.crypto.decrypt) {
      result = await this.crypto.decrypt(result, metadata)
    }

    if (result === bytes && this.decryptionPlugins.length === 0 && !this.crypto.decrypt) {
      throw new Error('Encrypted QPK manifest requires an adapter crypto.decrypt implementation')
    }

    return result
  }

  private async decompressLzma(bytes: Uint8Array): Promise<Uint8Array> {
    if (!this.codec?.lzmaDecompress) {
      throw new Error('Compressed QPK manifest requires an adapter codec.lzmaDecompress implementation')
    }
    return await this.codec.lzmaDecompress(bytes)
  }

  private async createStoredAssets(
    files: Map<string, Uint8Array>,
    manifest: BundleManifest,
    bundleName: string,
  ): Promise<StoredAsset[]> {
    const assets: StoredAsset[] = []
    const now = this.now()

    for (const [type, records] of Object.entries(manifest.assets)) {
      if (!records)
        continue

      for (const [key, assetInfo] of Object.entries(records as Record<string, AssetInfo>)) {
        const variantLocales = new Set<string>()
        if (assetInfo.variants && Object.keys(assetInfo.variants).length > 0) {
          for (const [locale, variant] of Object.entries(assetInfo.variants)) {
            const variantLocale = variant.locale || locale
            variantLocales.add(variantLocale)
            const path = findAssetPath(files, {
              ...assetInfo,
              path: variant.path,
              relativePath: variant.relativePath,
              size: variant.size,
              hash: variant.hash,
              mimeType: variant.mimeType || assetInfo.mimeType,
              mtime: variant.mtime || assetInfo.mtime,
              version: variant.version || assetInfo.version,
              mediaMetadata: variant.mediaMetadata || assetInfo.mediaMetadata,
            }, key, variantLocale)
            if (!path)
              continue

            const data = files.get(path)!
            if (variant.hash) {
              const actualHash = await this.crypto.sha256(data)
              if (actualHash !== variant.hash) {
                throw new IntegrityError(variant.hash, actualHash)
              }
            }

            const name = assetInfo.name || inferAssetName(key)
            assets.push({
              id: `${bundleName}:${variantLocale}:${type}:${name}`,
              bundleName,
              name,
              type: type as AssetType,
              locale: variantLocale,
              data: new Uint8Array(data),
              hash: variant.hash || '',
              mimeType: variant.mimeType || assetInfo.mimeType,
              size: variant.size ?? data.byteLength,
              version: variant.version || assetInfo.version || 1,
              mtime: variant.mtime || assetInfo.mtime || now,
              createdAt: now,
              lastAccessed: now,
              mediaMetadata: variant.mediaMetadata || assetInfo.mediaMetadata,
            })
          }
        }

        for (const locale of (assetInfo.locales?.length ? assetInfo.locales : [manifest.defaultLocale || 'default']).filter(locale => !variantLocales.has(locale))) {
          const path = findAssetPath(files, assetInfo, key, locale)
          if (!path)
            continue

          const data = files.get(path)!
          if (assetInfo.hash) {
            const actualHash = await this.crypto.sha256(data)
            if (actualHash !== assetInfo.hash) {
              throw new IntegrityError(assetInfo.hash, actualHash)
            }
          }

          const name = assetInfo.name || inferAssetName(key)
          assets.push({
            id: `${bundleName}:${locale}:${type}:${name}`,
            bundleName,
            name,
            type: type as AssetType,
            locale,
            data: new Uint8Array(data),
            hash: assetInfo.hash || '',
            mimeType: assetInfo.mimeType,
            size: assetInfo.size ?? data.byteLength,
            version: assetInfo.version || 1,
            mtime: assetInfo.mtime || now,
            createdAt: now,
            lastAccessed: now,
            mediaMetadata: assetInfo.mediaMetadata,
          })
        }
      }
    }

    return assets
  }
}

export function detectBundleFormat(name: string, bytes: Uint8Array): BundleFormat {
  if (name.endsWith('.qpk'))
    return 'qpk'
  if (name.endsWith('.zip') || name.endsWith('.bundle'))
    return 'zip'

  const view = toDataView(bytes)
  if (bytes.byteLength >= 4 && view.getUint32(0, false) === QPK_MAGIC)
    return 'qpk'
  if (bytes.byteLength >= 2 && view.getUint16(0, false) === 0x504B)
    return 'zip'

  return 'zip'
}

function parseManifest(files: Map<string, Uint8Array>): BundleManifest {
  const manifestBytes = files.get('manifest.json')
  if (!manifestBytes) {
    throw new Error('Bundle manifest not found')
  }
  return JSON.parse(bytesToUtf8(manifestBytes)) as BundleManifest
}

function unzipBytes(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) {
        reject(new Error(`ZIP decompression failed: ${error.message}`))
        return
      }

      resolve(new Map(Object.entries(files)))
    })
  })
}

function findAssetPath(
  files: Map<string, Uint8Array>,
  assetInfo: AssetInfo,
  key: string,
  locale: string,
): string | undefined {
  const base = assetInfo.relativePath || key || assetInfo.name
  const type = assetInfo.type
  const normalizedBase = normalizePath(base)
  const candidates = [
    `assets/${type}/${normalizedBase.replace(new RegExp(`^${type}/`), '')}`,
    normalizedBase,
    `assets/${type}/${key}`,
    `assets/${type}/${assetInfo.name}`,
  ]

  if (locale !== 'default') {
    candidates.push(
      `assets/${type}/${locale}/${assetInfo.name}`,
      `assets/${type}/${normalizedBase.replace(new RegExp(`^${type}/`), '').replace(assetInfo.name, `${locale}/${assetInfo.name}`)}`,
    )
  }

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate)
    if (files.has(normalized))
      return normalized
  }

  return Array.from(files.keys()).find(path =>
    path.endsWith(`/${assetInfo.name}`)
    && path.startsWith(`assets/${type}/`),
  )
}

function inferAssetName(key: string): string {
  const parts = normalizePath(key).split('/')
  return parts[parts.length - 1] || key
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function readUint64LE(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true)
  const high = view.getUint32(offset + 4, true)
  return high * 2 ** 32 + low
}

function sliceBytes(bytes: Uint8Array, start: number, end: number): Uint8Array {
  return bytes.slice(start, end)
}
