export const SPRITE_PLUGIN_ID = 'sprite' as const
export const SPRITE_WEB_RENDERER_ENTRY = '@quajs/renderer-web/plugins/sprite' as const
export const SPRITE_VUE_RENDERER_ENTRY = '@quajs/renderer-vue/plugins/sprite' as const
export const SPRITE_COCOS_RENDERER_ENTRY = '@quajs/renderer-cocos/plugins/sprite' as const
export const SPRITE_RENDERER_ENTRY = SPRITE_WEB_RENDERER_ENTRY
export const SPRITE_MANIFEST_FILE = 'sprite.manifest.json' as const
export const SPRITE_CHARACTERS_DIR = 'characters' as const
export const SPRITE_UI_SKINS_DIR = 'ui' as const
export const SPRITE_UI_SKIN_MANIFEST_FILE = 'ui-skin.manifest.json' as const
export const SPRITE_UI_SKIN_SOURCE_FILE = 'ui-skin.json' as const

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'])
const SPECIAL_FAMILY_SEGMENTS = new Set(['expressions', 'atlas', 'frames', 'layers', 'masks'])
const SPRITE_SKIN_STATES = new Set(['default', 'hover', 'pressed', 'disabled', 'selected'])

export interface SpriteAssetSource {
  relativePath: string
  size?: number
  hash?: string
  mimeType?: string
  mtime?: number
}

export interface SpriteReference {
  input: string
  family: string
  asset: string
  manifestPath: string
}

export interface SpriteLayerDefinition {
  asset: string
  frame?: string
  fallback?: string
  offsetX?: number
  offsetY?: number
  zIndex?: number
  opacity?: number
  mask?: string
  blendMode?: string
  anchor?: 'left' | 'center' | 'right' | string
  scale?: number
  rotation?: number
  visible?: boolean
  hash?: string
  size?: number
  mimeType?: string
}

export interface SpriteExpressionDefinition {
  layers: readonly SpriteLayerDefinition[]
  fallback?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface SpriteAtlasFrameDefinition {
  x: number
  y: number
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  zIndex?: number
  opacity?: number
  mask?: string
  blendMode?: string
  fallback?: string
  anchor?: 'left' | 'center' | 'right' | string
  scale?: number
  rotation?: number
  visible?: boolean
}

export interface SpriteAtlasDefinition {
  asset: string
  frameWidth?: number
  frameHeight?: number
  defaultFrame?: string
  frames: Record<string, SpriteAtlasFrameDefinition>
}

export interface SpriteManifest {
  version: 1
  family: string
  base: SpriteLayerDefinition
  expressions?: Record<string, SpriteExpressionDefinition>
  atlas?: SpriteAtlasDefinition
  metadata?: Readonly<Record<string, unknown>>
}

export interface SpriteResolvedLayer {
  kind: 'base' | 'expression'
  asset: string
  frame?: SpriteAtlasFrameDefinition
  fallback?: string
  offsetX?: number
  offsetY?: number
  zIndex?: number
  opacity?: number
  mask?: string
  blendMode?: string
  anchor?: 'left' | 'center' | 'right' | string
  scale?: number
  rotation?: number
  visible?: boolean
  hash?: string
  size?: number
  mimeType?: string
}

export interface ResolvedSpriteProjection {
  family: string
  sprite: string
  expression?: string
  manifestPath: string
  manifest?: SpriteManifest
  base: SpriteResolvedLayer
  layers: readonly SpriteResolvedLayer[]
  fallbackUsed: boolean
}

export interface SpriteInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SpriteSkinAssetDefinition {
  asset: string
  fallback?: string
  hash?: string
  size?: number
  mimeType?: string
}

export interface SpriteSkinStateDefinition extends SpriteSkinAssetDefinition {
  tint?: string
  opacity?: number
}

export interface SpriteSkinDefinition {
  base: SpriteSkinAssetDefinition
  states?: Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition>>
  slice: SpriteInsets
  mode?: 'sliced' | 'tiled'
  fill?: boolean
  contentInsets?: SpriteInsets
  metadata?: Readonly<Record<string, unknown>>
}

export interface SpriteSkinManifest {
  version: 1
  family: string
  skins: Record<string, SpriteSkinDefinition>
  metadata?: Readonly<Record<string, unknown>>
}

export type SpriteSkinStateName = 'default' | 'hover' | 'pressed' | 'disabled' | 'selected'

export interface SpriteSkinReference {
  input: string
  family: string
  skin: string
  manifestPath: string
}

export interface ResolvedSpriteSkinState {
  kind: SpriteSkinStateName
  asset: string
  fallback?: string
  hash?: string
  size?: number
  mimeType?: string
  tint?: string
  opacity?: number
}

export interface ResolvedSpriteSkinProjection {
  family: string
  skin: string
  state: SpriteSkinStateName
  manifestPath: string
  manifest?: SpriteSkinManifest
  definition: SpriteSkinDefinition
  base: ResolvedSpriteSkinState
  active: ResolvedSpriteSkinState
  fallbackUsed: boolean
}

export function normalizeSpritePath(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : undefined
}

export function stripCharactersRoot(relativePath: string): string {
  return normalizeSpritePath(relativePath)?.replace(new RegExp(`^${SPRITE_CHARACTERS_DIR}/`), '') || relativePath
}

export function isSpriteManifestPath(relativePath: string): boolean {
  const normalized = stripCharactersRoot(normalizeSpritePath(relativePath) || relativePath)
  return normalized === SPRITE_MANIFEST_FILE || normalized.endsWith(`/${SPRITE_MANIFEST_FILE}`)
}

export function isSpriteImagePath(relativePath: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/')) {
    return true
  }

  const extension = getExtension(relativePath)
  return IMAGE_EXTENSIONS.has(extension)
}

export function resolveSpriteReference(sprite?: string): SpriteReference | undefined {
  const normalized = normalizeSpritePath(sprite)
  if (!normalized) {
    return undefined
  }

  const asset = stripCharactersRoot(normalized)
  const segments = asset.split('/').filter(Boolean)
  if (segments.length === 0) {
    return undefined
  }

  const family = resolveSpriteFamily(asset)
  if (!family) {
    return undefined
  }

  return {
    input: normalized,
    family,
    asset,
    manifestPath: getSpriteManifestPath(family),
  }
}

export function resolveSpriteFamily(sprite?: string): string | undefined {
  const normalized = normalizeSpritePath(sprite)
  if (!normalized) {
    return undefined
  }

  const asset = stripCharactersRoot(normalized)
  const segments = asset.split('/').filter(Boolean)
  if (segments.length === 0) {
    return undefined
  }

  if (segments.length === 1) {
    return stripExtension(segments[0]) || segments[0]
  }

  const specialIndex = segments.findIndex(segment => SPECIAL_FAMILY_SEGMENTS.has(segment))
  if (specialIndex > 0) {
    return segments.slice(0, specialIndex).join('/')
  }

  return segments.slice(0, -1).join('/') || stripExtension(segments[0]) || segments[0]
}

export function getSpriteManifestPath(family: string): string {
  return `${normalizeSpritePath(family) || family}/${SPRITE_MANIFEST_FILE}`.replace(/^\/+/, '')
}

export function resolveSpriteSkinReference(skin?: string): SpriteSkinReference | undefined {
  const normalized = normalizeSpritePath(skin)
  if (!normalized) {
    return undefined
  }

  const asset = stripCharactersRoot(normalized)
  const segments = asset.split('/').filter(Boolean)
  if (segments.length < 2) {
    return undefined
  }

  const skinName = segments[segments.length - 1]
  const family = segments.slice(0, -1).join('/')
  if (!family || !skinName) {
    return undefined
  }

  return {
    input: normalized,
    family,
    skin: skinName,
    manifestPath: getSpriteSkinManifestPath(family),
  }
}

export function getSpriteSkinManifestPath(family: string): string {
  return `${normalizeSpritePath(family) || family}/${SPRITE_UI_SKIN_MANIFEST_FILE}`.replace(/^\/+/, '')
}

export function resolveSpriteAssetPath(family: string, asset: string): string {
  const normalizedFamily = normalizeSpritePath(family) || family
  const normalizedAsset = stripCharactersRoot(normalizeSpritePath(asset) || asset)

  if (normalizedAsset.startsWith(`${normalizedFamily}/`)) {
    return normalizedAsset
  }

  return `${normalizedFamily}/${normalizedAsset}`.replace(/\/+/g, '/')
}

export function normalizeSpriteSkinManifest(manifest: SpriteSkinManifest): SpriteSkinManifest {
  const family = normalizeSpritePath(manifest.family) || manifest.family
  return {
    ...manifest,
    version: 1,
    family,
    skins: Object.fromEntries(Object.entries(manifest.skins).map(([name, skin]) => [
      name,
      normalizeSpriteSkinDefinition(skin, family),
    ])),
  }
}

export function serializeSpriteSkinManifest(manifest: SpriteSkinManifest): string {
  return JSON.stringify(normalizeSpriteSkinManifest(manifest), null, 2)
}

export function resolveSpriteSkinProjection(
  manifest: SpriteSkinManifest | undefined,
  skin?: string,
  state: SpriteSkinStateName = 'default',
): ResolvedSpriteSkinProjection | undefined {
  const reference = resolveSpriteSkinReference(skin)
  if (!reference) {
    return undefined
  }

  const normalizedManifest = manifest ? normalizeSpriteSkinManifestForFamily(manifest, reference.family) : undefined
  const definition = normalizedManifest?.skins?.[reference.skin]
  if (!definition) {
    return undefined
  }

  const requestedState = definition.states?.[state] || definition.states?.default || definition.base
  const base = resolveSpriteSkinState(definition.base, reference.family, 'default')
  const active = resolveSpriteSkinState(requestedState, reference.family, state)

  return {
    family: reference.family,
    skin: reference.skin,
    state,
    manifestPath: reference.manifestPath,
    manifest: normalizedManifest,
    definition,
    base,
    active,
    fallbackUsed: active.asset !== resolveSpriteAssetPath(reference.family, requestedState.asset),
  }
}

export function normalizeSpriteManifest(manifest: SpriteManifest): SpriteManifest {
  const family = resolveSpriteFamily(manifest.family) || manifest.family

  return {
    ...manifest,
    version: 1,
    family,
    base: normalizeSpriteLayerDefinition(manifest.base, family),
    expressions: manifest.expressions
      ? Object.fromEntries(Object.entries(manifest.expressions).map(([name, expression]) => [
          name,
          {
            ...expression,
            layers: expression.layers.map(layer => normalizeSpriteLayerDefinition(layer, family)),
          },
        ]))
      : undefined,
    atlas: manifest.atlas
      ? {
          ...manifest.atlas,
          asset: resolveSpriteAssetPath(family, manifest.atlas.asset),
        }
      : undefined,
  }
}

export function serializeSpriteManifest(manifest: SpriteManifest): string {
  return JSON.stringify(normalizeSpriteManifest(manifest), null, 2)
}

export function createSpriteManifestFromAssets(assets: readonly SpriteAssetSource[], family: string): SpriteManifest | null {
  const normalizedFamily = resolveSpriteFamily(family)
  if (!normalizedFamily) {
    return null
  }

  const familyAssets = assets
    .filter(asset => resolveSpriteFamily(asset.relativePath) === normalizedFamily)
    .filter(asset => !isSpriteManifestPath(asset.relativePath))
    .filter(asset => isSpriteImagePath(asset.relativePath, asset.mimeType))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  if (familyAssets.length === 0) {
    return null
  }

  const baseAsset = selectBaseSpriteAsset(familyAssets, normalizedFamily)
  const baseRelativePath = baseAsset
    ? getFamilyRelativePath(baseAsset.relativePath, normalizedFamily)
    : 'base.png'
  const expressions = collectExpressionDefinitions(familyAssets, normalizedFamily, baseRelativePath)

  if (!baseAsset && Object.keys(expressions).length === 0) {
    return null
  }

  return normalizeSpriteManifest({
    version: 1,
    family: normalizedFamily,
    base: baseAsset ? toLayerDefinition(baseAsset, normalizedFamily) : { asset: baseRelativePath },
    expressions: Object.keys(expressions).length > 0 ? expressions : undefined,
  })
}

export function resolveSpriteProjection(
  manifest: SpriteManifest | undefined,
  sprite?: string,
  expression?: string,
): ResolvedSpriteProjection | undefined {
  const reference = resolveSpriteReference(sprite)
  if (!reference) {
    return undefined
  }

  const normalizedManifest = manifest ? normalizeSpriteManifest(manifest) : undefined
  const base = resolveSpriteLayer(
    normalizedManifest?.base,
    reference.family,
    'base',
    normalizedManifest?.atlas,
  ) || createFallbackLayer(reference.family, reference.asset)
  const resolvedLayers: SpriteResolvedLayer[] = [base]

  const expressionDefinition = expression
    ? normalizedManifest?.expressions?.[expression]
    : undefined

  if (expression && expressionDefinition) {
    for (const layer of expressionDefinition.layers) {
      const resolvedLayer = resolveSpriteLayer(
        layer,
        reference.family,
        'expression',
        normalizedManifest?.atlas,
      )
      if (resolvedLayer) {
        resolvedLayers.push(resolvedLayer)
      }
    }
  }

  return {
    family: reference.family,
    sprite: reference.asset,
    expression,
    manifestPath: reference.manifestPath,
    manifest: normalizedManifest,
    base,
    layers: resolvedLayers,
    fallbackUsed: Boolean(expression && !expressionDefinition),
  }
}

function selectBaseSpriteAsset(assets: readonly SpriteAssetSource[], family: string): SpriteAssetSource | undefined {
  const prioritizedNames = ['base', 'sprite', 'default']

  for (const name of prioritizedNames) {
    const candidate = assets.find(asset => getFamilyRelativePath(asset.relativePath, family).toLowerCase().startsWith(`${name}.`))
    if (candidate) {
      return candidate
    }
  }

  const rootAssets = assets.filter(asset => isRootFamilyAsset(asset.relativePath, family))
  return rootAssets[0]
}

function collectExpressionDefinitions(
  assets: readonly SpriteAssetSource[],
  family: string,
  baseRelativePath: string,
): Record<string, SpriteExpressionDefinition> {
  const expressions = new Map<string, SpriteAssetSource[]>()

  for (const asset of assets) {
    const relativePath = getFamilyRelativePath(asset.relativePath, family)
    if (relativePath === baseRelativePath || relativePath === SPRITE_MANIFEST_FILE) {
      continue
    }

    const expressionName = getExpressionName(relativePath)
    if (!expressionName) {
      continue
    }

    if (!expressions.has(expressionName)) {
      expressions.set(expressionName, [])
    }
    expressions.get(expressionName)!.push(asset)
  }

  return Object.fromEntries([...expressions.entries()].map(([name, expressionAssets]) => [
    name,
    {
      fallback: baseRelativePath,
      layers: expressionAssets
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
        .map(asset => toLayerDefinition(asset, family)),
    } satisfies SpriteExpressionDefinition,
  ]))
}

function getExpressionName(relativePath: string): string | undefined {
  const normalized = normalizeSpritePath(relativePath)
  if (!normalized) {
    return undefined
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) {
    return undefined
  }

  const expressionsIndex = segments.indexOf('expressions')
  if (expressionsIndex >= 0) {
    const tail = segments.slice(expressionsIndex + 1)
    if (tail.length === 0) {
      return undefined
    }
    if (tail.length === 1) {
      return stripExtension(tail[0]) || tail[0]
    }
    return tail[0]
  }

  if (segments.length === 1) {
    return stripExtension(segments[0]) || segments[0]
  }

  return stripExtension(segments[segments.length - 1]) || segments[segments.length - 1]
}

function toLayerDefinition(asset: SpriteAssetSource, family: string): SpriteLayerDefinition {
  return {
    asset: getFamilyRelativePath(asset.relativePath, family),
    hash: asset.hash,
    size: asset.size,
    mimeType: asset.mimeType,
  }
}

function normalizeSpriteLayerDefinition(layer: SpriteLayerDefinition, family: string): SpriteLayerDefinition {
  const frame = normalizeSpritePath(layer.frame)
  return {
    ...layer,
    asset: resolveSpriteAssetPath(family, layer.asset),
    frame,
  }
}

function resolveSpriteLayer(
  layer: SpriteLayerDefinition | undefined,
  family: string,
  kind: 'base' | 'expression',
  atlas?: SpriteAtlasDefinition,
): SpriteResolvedLayer | undefined {
  if (!layer) {
    return undefined
  }

  const normalizedLayer = normalizeSpriteLayerDefinition(layer, family)
  const atlasFrames = atlas?.frames
  const atlasAsset = atlas?.asset
  const atlasFrame = normalizedLayer.frame && atlasFrames
    ? atlasFrames[normalizedLayer.frame]
    : undefined

  if (atlasFrame) {
    return {
      kind,
      asset: resolveSpriteAssetPath(family, atlasAsset || normalizedLayer.asset),
      frame: atlasFrame,
      fallback: normalizedLayer.fallback,
      offsetX: atlasFrame.offsetX ?? normalizedLayer.offsetX,
      offsetY: atlasFrame.offsetY ?? normalizedLayer.offsetY,
      zIndex: atlasFrame.zIndex ?? normalizedLayer.zIndex,
      opacity: atlasFrame.opacity ?? normalizedLayer.opacity,
      mask: atlasFrame.mask ?? normalizedLayer.mask,
      blendMode: atlasFrame.blendMode ?? normalizedLayer.blendMode,
      anchor: atlasFrame.anchor ?? normalizedLayer.anchor,
      scale: atlasFrame.scale ?? normalizedLayer.scale,
      rotation: atlasFrame.rotation ?? normalizedLayer.rotation,
      visible: atlasFrame.visible ?? normalizedLayer.visible,
      hash: normalizedLayer.hash,
      size: normalizedLayer.size,
      mimeType: normalizedLayer.mimeType,
    }
  }

  return {
    kind,
    asset: normalizedLayer.asset,
    fallback: normalizedLayer.fallback,
    offsetX: normalizedLayer.offsetX,
    offsetY: normalizedLayer.offsetY,
    zIndex: normalizedLayer.zIndex,
    opacity: normalizedLayer.opacity,
    mask: normalizedLayer.mask,
    blendMode: normalizedLayer.blendMode,
    anchor: normalizedLayer.anchor,
    scale: normalizedLayer.scale,
    rotation: normalizedLayer.rotation,
    visible: normalizedLayer.visible,
    hash: normalizedLayer.hash,
    size: normalizedLayer.size,
    mimeType: normalizedLayer.mimeType,
  }
}

function createFallbackLayer(family: string, asset: string): SpriteResolvedLayer {
  return {
    kind: 'base',
    asset: resolveSpriteAssetPath(family, asset),
  }
}

function getFamilyRelativePath(relativePath: string, family: string): string {
  const normalized = stripCharactersRoot(relativePath)
  if (normalized === family) {
    return ''
  }
  if (normalized.startsWith(`${family}/`)) {
    return normalized.slice(family.length + 1)
  }
  return normalized
}

function isRootFamilyAsset(relativePath: string, family: string): boolean {
  const familyRelativePath = getFamilyRelativePath(relativePath, family)
  return familyRelativePath.length > 0 && !familyRelativePath.includes('/') && isSpriteImagePath(relativePath)
}

function stripExtension(value: string): string {
  const index = value.lastIndexOf('.')
  return index >= 0 ? value.slice(0, index) : value
}

function getExtension(value: string): string {
  const index = value.lastIndexOf('.')
  return index >= 0 ? value.slice(index).toLowerCase() : ''
}

function normalizeSpriteSkinDefinition(definition: SpriteSkinDefinition, family: string): SpriteSkinDefinition {
  return {
    ...definition,
    base: normalizeSpriteSkinAssetDefinition(definition.base, family),
    states: definition.states
      ? Object.fromEntries(Object.entries(definition.states).map(([name, state]) => [
          name,
          normalizeSpriteSkinAssetDefinition(state, family),
        ]))
      : undefined,
  }
}

function normalizeSpriteSkinManifestForFamily(manifest: SpriteSkinManifest, family: string): SpriteSkinManifest {
  const normalizedFamily = normalizeSpritePath(family) || family
  return {
    ...manifest,
    version: 1,
    family: normalizedFamily,
    skins: Object.fromEntries(Object.entries(manifest.skins).map(([name, skin]) => [
      name,
      normalizeSpriteSkinDefinition(skin, normalizedFamily),
    ])),
  }
}

function normalizeSpriteSkinAssetDefinition(definition: SpriteSkinAssetDefinition | SpriteSkinStateDefinition, family: string): SpriteSkinAssetDefinition | SpriteSkinStateDefinition {
  return {
    ...definition,
    asset: resolveSpriteAssetPath(family, definition.asset),
  }
}

function resolveSpriteSkinState(
  definition: SpriteSkinAssetDefinition | SpriteSkinStateDefinition,
  family: string,
  kind: SpriteSkinStateName,
): ResolvedSpriteSkinState {
  const normalized = normalizeSpriteSkinAssetDefinition(definition, family)
  return {
    kind,
    asset: normalized.asset,
    fallback: normalized.fallback,
    hash: normalized.hash,
    size: normalized.size,
    mimeType: normalized.mimeType,
    tint: 'tint' in normalized ? normalized.tint : undefined,
    opacity: 'opacity' in normalized ? normalized.opacity : undefined,
  }
}

export function isSpriteSkinStateName(value: string): value is SpriteSkinStateName {
  return SPRITE_SKIN_STATES.has(value)
}
