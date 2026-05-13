import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type { FontFaceProjection, FontsProjection } from './contracts'
import { BaseEnginePlugin } from '@quajs/engine'
import {
  cloneFontFaceProjection,
  cloneFontsProjection,
  FONTS_PLUGIN_ID,
  fontFaceProjectionIdentity,
} from './contracts'

export {
  cloneFontFaceProjection,
  cloneFontsProjection,
  createInitialFontsProjection,
  FONTS_PLUGIN_ID,
  FONTS_RENDERER_ENTRY,
  FONTS_VUE_RENDERER_ENTRY,
  FONTS_WEB_RENDERER_ENTRY,
  fontFaceProjectionIdentity,
  fontFaceProjectionSignature,
} from './contracts'

export type {
  FontFaceDisplay,
  FontFaceProjection,
  FontsProjection,
} from './contracts'

export interface RegisterFontOptions extends Omit<FontFaceProjection, 'family' | 'assetName'> {}

export class FontsPlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-fonts'
  readonly id = FONTS_PLUGIN_ID
  readonly version = '0.1.0'
  readonly description = 'Font face projection for rich text and cutscene typography'

  override async onRuntimePackageUnload(ctx: EngineContext): Promise<void> {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      await clearRuntimePackageFontsWithEngine(ctx.engine, packageId)
    }
  }

  override async destroy(): Promise<void> {
    if (this.ctx) {
      await this.ctx.engine.setPluginProjection(FONTS_PLUGIN_ID, undefined)
    }
    await super.destroy?.()
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'registerFontWithEngine', fn: registerFontWithEngine, module: this.name },
        { name: 'registerFontsWithEngine', fn: registerFontsWithEngine, module: this.name },
        { name: 'unregisterFontWithEngine', fn: unregisterFontWithEngine, module: this.name },
        { name: 'clearFontsWithEngine', fn: clearFontsWithEngine, module: this.name },
        { name: 'clearRuntimePackageFontsWithEngine', fn: clearRuntimePackageFontsWithEngine, module: this.name },
        { name: 'getFontsProjection', fn: getFontsProjection, module: this.name },
      ],
      decorators: {},
    }
  }
}

export function getFontsProjection(engine: QuaEngineInterface): FontsProjection {
  return cloneFontsProjection(engine.getPluginProjection<FontsProjection>(FONTS_PLUGIN_ID))
}

export async function registerFontWithEngine(
  engine: QuaEngineInterface,
  family: string,
  assetName: string,
  options: RegisterFontOptions = {},
): Promise<FontFaceProjection> {
  const face = normalizeFontFace(engine, {
    ...options,
    family,
    assetName,
  })
  await registerFontsWithEngine(engine, [face])
  return face
}

export async function registerFontsWithEngine(
  engine: QuaEngineInterface,
  faces: readonly FontFaceProjection[],
): Promise<FontsProjection> {
  const projection = getFontsProjection(engine)
  const nextFaces = new Map<string, FontFaceProjection>()
  for (const face of projection.faces) {
    nextFaces.set(fontFaceProjectionIdentity(face), cloneFontFaceProjection(face))
  }
  for (const face of faces) {
    const normalized = normalizeFontFace(engine, face)
    nextFaces.set(fontFaceProjectionIdentity(normalized), normalized)
  }
  const next = {
    revision: projection.revision + 1,
    faces: [...nextFaces.values()],
  }
  await engine.setPluginProjection(FONTS_PLUGIN_ID, next)
  return next
}

export async function unregisterFontWithEngine(
  engine: QuaEngineInterface,
  idOrFamily: string,
): Promise<FontsProjection> {
  const projection = getFontsProjection(engine)
  const next = {
    revision: projection.revision + 1,
    faces: projection.faces
      .filter(face => face.id !== idOrFamily && face.family !== idOrFamily)
      .map(face => cloneFontFaceProjection(face)),
  }
  await engine.setPluginProjection(FONTS_PLUGIN_ID, next)
  return next
}

export async function clearFontsWithEngine(engine: QuaEngineInterface): Promise<void> {
  const projection = getFontsProjection(engine)
  await engine.setPluginProjection(FONTS_PLUGIN_ID, {
    revision: projection.revision + 1,
    faces: [],
  })
}

export async function clearRuntimePackageFontsWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<FontsProjection> {
  const projection = getFontsProjection(engine)
  const faces = projection.faces.filter(face => !fontFaceBelongsToPackage(face, packageId))
  if (faces.length === projection.faces.length) {
    return projection
  }
  const next = {
    revision: projection.revision + 1,
    faces: faces.map(face => cloneFontFaceProjection(face)),
  }
  await engine.setPluginProjection(FONTS_PLUGIN_ID, next)
  return next
}

function normalizeFontFace(
  engine: QuaEngineInterface,
  face: FontFaceProjection,
): FontFaceProjection {
  if (!face.family.trim()) {
    throw new Error('Font family must not be empty.')
  }
  if (!face.assetName.trim()) {
    throw new Error('Font assetName must not be empty.')
  }
  const contentPackageId = face.contentPackageId || contentPackageIdFromMetadata(face.metadata) || engine.getStoryPoint()?.contentPackageId
  return {
    ...face,
    family: face.family.trim(),
    assetName: face.assetName.trim(),
    contentPackageId,
    metadata: face.metadata ? { ...face.metadata } : undefined,
  }
}

function fontFaceBelongsToPackage(face: Readonly<FontFaceProjection>, packageId: string): boolean {
  return face.contentPackageId === packageId || contentPackageIdFromMetadata(face.metadata) === packageId
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

export const metadata = {
  name: '@quajs/plugin-fonts',
  version: '0.1.0',
  description: 'Font face projection for rich text and cutscene typography',
  category: 'visual',
} as const

export const Plugin = FontsPlugin
export const decorators = {}
