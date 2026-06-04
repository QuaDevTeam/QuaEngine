import { LogicToRenderEvents } from '@quajs/render-core'
import { defineCocosRendererPlugin } from './core'

export function createFontsCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/fonts',
    setup(context) {
      const sync = async () => {
        const node = context.cocos.getLayerNode('fonts', 'font-layer', 5)
        const projection = resolveFontsProjection(context.cocos.getViewState().plugins.fonts)
        context.cocos.host.nodes.setNodeMetadata?.(node, {
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

        context.cocos.releaseLayerResources('fonts')
        if (!context.cocos.host.capabilities?.fonts) {
          if (projection.faces.length > 0) {
            context.cocos.reportWarning('Cocos host does not provide font materialization capability.', {
              plugin: 'fonts',
              count: projection.faces.length,
            })
          }
          return
        }

        for (const face of projection.faces) {
          const assetName = stringValue(face.assetName)
          if (!assetName)
            continue
          const resource = await context.cocos.resolveAsset('fonts', assetName, {
            targetPackageId: stringValue(face.contentPackageId),
          })
          context.cocos.setLayerResource('fonts', fontResourceKey(face), resource)
        }
      }

      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, () => {
        void sync()
      }))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.ASSET_CHANGED, () => {
        void sync()
      }))
      void sync()
    },
  })
}

export const fontsCocosRendererPlugin = createFontsCocosRendererPlugin()

interface CocosFontsProjection {
  faces: ReadonlyArray<Readonly<Record<string, unknown>>>
  requiredRuntimePackages?: readonly string[]
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

function fontResourceKey(face: Readonly<Record<string, unknown>>): string {
  return [
    stringValue(face.family),
    stringValue(face.weight),
    stringValue(face.style),
    stringValue(face.unicodeRange),
    stringValue(face.assetName),
  ].join(':')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
