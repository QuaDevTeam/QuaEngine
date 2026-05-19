import type { QuaAssets } from '@quajs/assets'
import type { FontFaceProjection, FontsProjection } from '@quajs/plugin-fonts/contracts'
import { fontFaceProjectionIdentity, fontFaceProjectionSignature } from '@quajs/plugin-fonts/contracts'

export type WebFontFaceLoadState = 'loading' | 'loaded' | 'error'

export interface WebFontFaceRegistryOptions {
  getAssets: () => QuaAssets | undefined
  getProjection: () => FontsProjection | undefined
  document?: Document
  onError?: (error: unknown, face: Readonly<FontFaceProjection>) => void
}

export interface WebFontFaceRecord {
  key: string
  signature: string
  face: Readonly<FontFaceProjection>
  state: WebFontFaceLoadState
  error?: Error
}

interface RuntimeFontFaceRecord extends WebFontFaceRecord {
  fontFace?: FontFace
}

export class WebFontFaceRegistry {
  private readonly records = new Map<string, RuntimeFontFaceRecord>()

  constructor(private readonly options: WebFontFaceRegistryOptions) {}

  getRecords(): readonly Readonly<WebFontFaceRecord>[] {
    return [...this.records.values()].map(record => ({
      key: record.key,
      signature: record.signature,
      face: record.face,
      state: record.state,
      error: record.error,
    }))
  }

  async sync(): Promise<void> {
    const projection = this.options.getProjection()
    const desiredFaces = projection?.faces || []
    const desiredKeys = new Set<string>()

    for (const face of desiredFaces) {
      const normalized = cloneFontFace(face)
      const key = fontFaceProjectionIdentity(normalized)
      const signature = fontFaceProjectionSignature(normalized)
      desiredKeys.add(key)

      const current = this.records.get(key)
      if (current?.signature === signature) {
        continue
      }

      if (current) {
        this.removeRecord(current)
      }

      const nextRecord: RuntimeFontFaceRecord = {
        key,
        signature,
        face: normalized,
        state: 'loading',
      }
      this.records.set(key, nextRecord)
      void this.loadRecord(nextRecord)
    }

    for (const [key, record] of this.records) {
      if (!desiredKeys.has(key)) {
        this.records.delete(key)
        this.removeRecord(record)
      }
    }
  }

  async destroy(): Promise<void> {
    for (const record of this.records.values()) {
      this.removeRecord(record)
    }
    this.records.clear()
  }

  private async loadRecord(record: RuntimeFontFaceRecord): Promise<void> {
    try {
      const assets = this.options.getAssets()
      if (!assets) {
        throw new Error('Font assets are not available.')
      }

      const FontFaceCtor = this.getFontFaceCtor()
      const fontSet = this.getFontFaceSet()
      if (!FontFaceCtor || !fontSet) {
        return
      }

      const asset = await assets.getAsset('fonts', record.face.assetName, {
        bundleName: record.face.bundleName,
        locale: record.face.locale,
        targetPackageId: record.face.contentPackageId || contentPackageIdFromMetadata(record.face.metadata),
      })
      if (!this.isCurrentRecord(record)) {
        return
      }

      const fontFace = new FontFaceCtor(record.face.family, copyToArrayBuffer(asset.data), fontFaceDescriptors(record.face))
      record.fontFace = fontFace
      const loadedFace = await fontFace.load()
      if (!this.isCurrentRecord(record)) {
        return
      }

      fontSet.add(loadedFace)
      record.state = 'loaded'
      record.error = undefined
    }
    catch (error) {
      if (!this.isCurrentRecord(record)) {
        return
      }
      record.state = 'error'
      record.error = error instanceof Error ? error : new Error(String(error))
      this.options.onError?.(error, record.face)
    }
  }

  private isCurrentRecord(record: RuntimeFontFaceRecord): boolean {
    return this.records.get(record.key) === record
  }

  private removeRecord(record: RuntimeFontFaceRecord): void {
    if (record.fontFace) {
      this.getFontFaceSet()?.delete(record.fontFace)
    }
  }

  private getDocument(): Document | undefined {
    return this.options.document || globalThis.document
  }

  private getFontFaceCtor(): typeof FontFace | undefined {
    const doc = this.getDocument()
    return doc?.defaultView?.FontFace || globalThis.FontFace
  }

  private getFontFaceSet(): FontFaceSet | undefined {
    return this.getDocument()?.fonts
  }
}

function fontFaceDescriptors(face: Readonly<FontFaceProjection>): FontFaceDescriptors {
  const descriptors: FontFaceDescriptors = {}
  assignDescriptor(descriptors, 'style', face.style)
  assignDescriptor(descriptors, 'weight', face.weight)
  assignDescriptor(descriptors, 'stretch', face.stretch)
  assignDescriptor(descriptors, 'display', face.display)
  assignDescriptor(descriptors, 'unicodeRange', face.unicodeRange)
  assignDescriptor(descriptors, 'featureSettings', face.featureSettings)
  assignDescriptor(descriptors, 'variationSettings', face.variationSettings)
  assignDescriptor(descriptors, 'ascentOverride', face.ascentOverride)
  assignDescriptor(descriptors, 'descentOverride', face.descentOverride)
  assignDescriptor(descriptors, 'lineGapOverride', face.lineGapOverride)
  return descriptors
}

function assignDescriptor(
  descriptors: FontFaceDescriptors,
  key: keyof FontFaceDescriptors,
  value: string | number | undefined,
): void {
  if (value !== undefined) {
    const writableDescriptors = descriptors as Record<string, string>
    writableDescriptors[key] = String(value)
  }
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function cloneFontFace(face: Readonly<FontFaceProjection>): FontFaceProjection {
  return {
    ...face,
    metadata: face.metadata ? { ...face.metadata } : undefined,
  }
}

function contentPackageIdFromMetadata(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}
