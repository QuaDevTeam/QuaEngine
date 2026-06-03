import type { EngineContext, QuaEngineInterface } from '@quajs/engine'
import type { FontFaceProjection, FontsProjection } from './contracts'
import { BaseEnginePlugin } from '@quajs/engine'
import {
  cloneFontFaceProjection,
  cloneFontsProjection,
  fontFaceProjectionIdentity,
  FONTS_PLUGIN_ID,
} from './contracts'

export {
  cloneFontFaceProjection,
  cloneFontsProjection,
  createInitialFontsProjection,
  fontFaceProjectionIdentity,
  fontFaceProjectionSignature,
  FONTS_PLUGIN_ID,
  FONTS_RENDERER_ENTRY,
  FONTS_VUE_RENDERER_ENTRY,
  FONTS_WEB_RENDERER_ENTRY,
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
  await setFontsProjection(engine, next)
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
  await setFontsProjection(engine, next)
  return next
}

export async function clearFontsWithEngine(engine: QuaEngineInterface): Promise<void> {
  const projection = getFontsProjection(engine)
  await setFontsProjection(engine, {
    revision: projection.revision + 1,
    faces: [],
  })
}

export async function clearRuntimePackageFontsWithEngine(
  engine: QuaEngineInterface,
  packageId: string,
): Promise<FontsProjection> {
  const projection = getFontsProjection(engine)
  const faces = projection.faces.filter(face => !fontFaceRequiresPackage(face, packageId))
  if (faces.length === projection.faces.length) {
    return projection
  }
  const next = {
    revision: projection.revision + 1,
    faces: faces.map(face => cloneFontFaceProjection(face)),
  }
  await setFontsProjection(engine, next)
  return next
}

function setFontsProjection(engine: QuaEngineInterface, projection: FontsProjection): Promise<void> {
  return engine.setPluginProjection(FONTS_PLUGIN_ID, withFontsRequiredRuntimePackages(projection))
}

function withFontsRequiredRuntimePackages(projection: FontsProjection): FontsProjection {
  return {
    ...projection,
    requiredRuntimePackages: collectFontsRequiredRuntimePackages(projection.faces),
  }
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
  const contentPackageId = face.contentPackageId
    || contentPackageIdFromMetadata(face.metadata)
    || currentRuntimePackageId(engine)
  const metadata = withCurrentRuntimeFontMetadata(engine, face.metadata, contentPackageId)
  return {
    ...face,
    family: face.family.trim(),
    assetName: face.assetName.trim(),
    contentPackageId,
    metadata,
  }
}

function fontFaceRequiresPackage(face: Readonly<FontFaceProjection>, packageId: string): boolean {
  return face.contentPackageId === packageId || metadataRequiresPackage(face.metadata, packageId)
}

function collectFontsRequiredRuntimePackages(faces: readonly Readonly<FontFaceProjection>[]): string[] {
  return uniqueStrings(faces.flatMap(face => [
    ...(face.contentPackageId ? [face.contentPackageId] : []),
    ...requiredRuntimePackagesFromMetadata(face.metadata),
  ]))
}

function contentPackageIdFromMetadata(metadata?: Readonly<Record<string, unknown>>): string | undefined {
  return typeof metadata?.contentPackageId === 'string' ? metadata.contentPackageId : undefined
}

function requiredRuntimePackagesFromMetadata(metadata?: Readonly<Record<string, unknown>>): string[] {
  const value = metadata?.requiredRuntimePackages
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function metadataRequiresPackage(metadata: Readonly<Record<string, unknown>> | undefined, packageId: string): boolean {
  return contentPackageIdFromMetadata(metadata) === packageId
    || requiredRuntimePackagesFromMetadata(metadata).includes(packageId)
}

function withCurrentRuntimeFontMetadata(
  engine: QuaEngineInterface,
  metadata: Readonly<Record<string, unknown>> | undefined,
  inheritedContentPackageId?: string,
): Readonly<Record<string, unknown>> | undefined {
  const packageId = currentRuntimePackageId(engine)
  if (!packageId) {
    return metadata ? { ...metadata } : undefined
  }
  const metadataContentPackageId = contentPackageIdFromMetadata(metadata)
  if (inheritedContentPackageId && !metadataContentPackageId) {
    return metadata ? { ...metadata } : undefined
  }
  const currentPackageId = metadataContentPackageId
  if (!currentPackageId) {
    return {
      ...(metadata || {}),
      contentPackageId: packageId,
    }
  }
  const requiredRuntimePackages = uniqueStrings([
    currentPackageId,
    ...requiredRuntimePackagesFromMetadata(metadata),
    packageId,
  ])
  if (currentPackageId === packageId && requiredRuntimePackagesFromMetadata(metadata).length === 0) {
    return metadata ? { ...metadata } : undefined
  }
  return {
    ...(metadata || {}),
    requiredRuntimePackages,
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function currentRuntimePackageId(engine: QuaEngineInterface): string | undefined {
  return (engine as Partial<QuaEngineInterface>).getCurrentRuntimePackageId?.()
    || (engine as Partial<QuaEngineInterface>).getStoryPoint?.()?.contentPackageId
}

export const metadata = {
  name: '@quajs/plugin-fonts',
  version: '0.1.0',
  description: 'Font face projection for rich text and cutscene typography',
  category: 'visual',
} as const

export const Plugin = FontsPlugin
export const decorators = {}
