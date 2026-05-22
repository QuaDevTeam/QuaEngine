declare module '@quajs/quack/qpk-reader' {
  import type { BundleManifest, EncryptionAlgorithm, EncryptionPlugin } from '@quajs/quack'

  export interface QpkReaderOptions {
    encryptionAlgorithm?: EncryptionAlgorithm
    encryptionKey?: string
    encryptionPlugin?: EncryptionPlugin
  }

  export interface QpkHeaderInfo {
    compressed: boolean
    encrypted: boolean
    flags: number
    headerSize: number
    manifestOffset: number
    manifestSize: number
    reserved: number
    version: number
  }

  export interface QpkAssetSummary {
    dataOffset: number
    path: string
    size: number
  }

  export interface QpkReadSummary {
    assets: QpkAssetSummary[]
    errors: string[]
    header: QpkHeaderInfo
    locked: boolean
    manifest?: BundleManifest
  }

  export function readQpkSummary(qpkPath: string, options?: QpkReaderOptions): Promise<QpkReadSummary>
}
