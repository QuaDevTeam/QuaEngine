import { LogicToRenderEvents } from '@quajs/render-core'
import { resolveAssetWithTargetPackages, runtimePackageCandidatesFromMetadata } from '../utils'
import { defineCocosRendererPlugin } from './core'
import { createCocosProjectionTask } from './projection-task'

export function createFontsCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/fonts',
    setup(context) {
      const records = new Map<string, CocosFontRecord>()
      let warnedUnsupported = false
      let disposed = false

      const unregisterRecord = async (key: string, record: CocosFontRecord) => {
        await context.cocos.host.fonts?.unregisterFontFace(key)
        context.cocos.setLayerResource('fonts', record.resourceKey, undefined)
        records.delete(key)
      }

      const project = createCocosProjectionTask<{ retryFailed?: boolean }>(context, 'fonts', async (cocos, options) => {
        const node = cocos.getLayerNode('fonts', 'font-layer', 5)
        const projection = resolveFontsProjection(cocos.getViewState().plugins.fonts)
        cocos.host.nodes.setNodeMetadata?.(node, {
          plugin: 'fonts',
          faces: projection.faces.map(face => ({
            family: stringValue(face.family),
            assetName: stringValue(face.assetName),
            weight: face.weight,
            style: face.style,
            contentPackageId: stringValue(face.contentPackageId),
          })),
          requiredRuntimePackages: projection.requiredRuntimePackages,
        })

        const fonts = cocos.host.fonts
        if (!fonts?.registerFontFace) {
          if (projection.faces.length > 0 && !warnedUnsupported) {
            warnedUnsupported = true
            cocos.reportWarning('Cocos host does not provide font materialization capability.', {
              plugin: 'fonts',
              count: projection.faces.length,
            })
          }
          for (const [key, record] of [...records]) {
            await unregisterRecord(key, record)
          }
          return
        }

        const desiredKeys = new Set<string>()
        for (const face of projection.faces) {
          const family = stringValue(face.family)
          const assetName = stringValue(face.assetName)
          if (!family || !assetName)
            continue

          const key = fontFaceIdentity(face)
          const signature = JSON.stringify([fontFaceSignature(face), projection.requiredRuntimePackages, cocos.getAssetRevision()])
          desiredKeys.add(key)
          const current = records.get(key)
          if (current?.signature === signature && (!options.retryFailed || current.state !== 'error'))
            continue
          if (current) {
            await unregisterRecord(key, current)
          }

          const resource = await resolveAssetWithTargetPackages(cocos, 'fonts', assetName, runtimePackageCandidatesFromMetadata({
            requiredRuntimePackages: projection.requiredRuntimePackages,
            ...(isRecord(face.metadata) ? face.metadata : {}),
            ...(stringValue(face.contentPackageId) ? { contentPackageId: stringValue(face.contentPackageId) } : {}),
          }))
          if (!resource)
            continue

          const resourceKey = `font:${key}`
          cocos.setLayerResource('fonts', resourceKey, resource)
          const nextRecord: CocosFontRecord = {
            signature,
            resourceKey,
            state: 'loading',
          }
          records.set(key, nextRecord)
          try {
            await fonts.registerFontFace(resource, {
              id: key,
              family,
              assetName,
              bundleName: stringValue(face.bundleName),
              locale: stringValue(face.locale),
              style: stringValue(face.style),
              weight: stringOrNumberValue(face.weight),
              stretch: stringValue(face.stretch),
              display: stringValue(face.display),
              unicodeRange: stringValue(face.unicodeRange),
              featureSettings: stringValue(face.featureSettings),
              variationSettings: stringValue(face.variationSettings),
              ascentOverride: stringValue(face.ascentOverride),
              descentOverride: stringValue(face.descentOverride),
              lineGapOverride: stringValue(face.lineGapOverride),
              contentPackageId: stringValue(face.contentPackageId),
              metadata: isRecord(face.metadata) ? { ...face.metadata } : undefined,
            })
            if (disposed)
              await unregisterRecord(key, nextRecord)
            else
              nextRecord.state = 'loaded'
          }
          catch (error) {
            nextRecord.state = 'error'
            await context.reportError(error, {
              message: 'Cocos font registration failed.',
              phase: 'renderer-cocos:fonts',
              pluginName: '@quajs/renderer-cocos/fonts',
              metadata: { family, assetName },
            })
          }
        }

        for (const [key, record] of [...records]) {
          if (!desiredKeys.has(key)) {
            await unregisterRecord(key, record)
          }
        }
      })
      const sync = (options: { retryFailed?: boolean } = {}) => project(options)

      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, () => {
        void sync({ retryFailed: true })
      }))
      context.addDisposer(() => {
        disposed = true
        for (const [key, record] of [...records]) {
          void unregisterRecord(key, record)
        }
      })
      void sync()
    },
  })
}

export const fontsCocosRendererPlugin = createFontsCocosRendererPlugin()

interface CocosFontsProjection {
  faces: ReadonlyArray<Readonly<Record<string, unknown>>>
  requiredRuntimePackages?: readonly string[]
}

interface CocosFontRecord {
  signature: string
  resourceKey: string
  state: 'loading' | 'loaded' | 'error'
}

function resolveFontsProjection(value: unknown): CocosFontsProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { faces: [] }
  }
  const record = value as Record<string, unknown>
  const faces = Array.isArray(record.faces)
    ? record.faces.filter(face => face && typeof face === 'object' && !Array.isArray(face)) as ReadonlyArray<Readonly<Record<string, unknown>>>
    : []
  const requiredRuntimePackages = Array.isArray(record.requiredRuntimePackages)
    ? record.requiredRuntimePackages.filter((item): item is string => typeof item === 'string')
    : undefined
  return { faces, requiredRuntimePackages }
}

function fontFaceIdentity(face: Readonly<Record<string, unknown>>): string {
  const id = stringValue(face.id)
  if (id)
    return id
  return [
    normalizeFontKeySegment(face.family),
    normalizeFontKeySegment(face.style || 'normal'),
    normalizeFontKeySegment(face.weight ?? 'normal'),
    normalizeFontKeySegment(face.stretch || 'normal'),
    normalizeFontKeySegment(face.unicodeRange || 'all'),
  ].join(':')
}

function fontFaceSignature(face: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    id: stringValue(face.id),
    family: stringValue(face.family),
    assetName: stringValue(face.assetName),
    bundleName: stringValue(face.bundleName),
    locale: stringValue(face.locale),
    style: stringValue(face.style),
    weight: stringOrNumberValue(face.weight),
    stretch: stringValue(face.stretch),
    display: stringValue(face.display),
    unicodeRange: stringValue(face.unicodeRange),
    featureSettings: stringValue(face.featureSettings),
    variationSettings: stringValue(face.variationSettings),
    ascentOverride: stringValue(face.ascentOverride),
    descentOverride: stringValue(face.descentOverride),
    lineGapOverride: stringValue(face.lineGapOverride),
    contentPackageId: stringValue(face.contentPackageId),
    metadata: isRecord(face.metadata) ? face.metadata : undefined,
  })
}

function normalizeFontKeySegment(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, '-')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringOrNumberValue(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
