export type SpriteSkinStateName = 'default' | 'hover' | 'pressed' | 'disabled' | 'selected'

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

export interface SpriteSkinStyleOptions {
  assetUrl?: string
  assetUrls?: Partial<Record<SpriteSkinStateName, string>>
  state?: SpriteSkinStateName
}

const SPRITE_CHARACTERS_DIR = 'characters'
const SPRITE_UI_SKIN_MANIFEST_FILE = 'ui-skin.manifest.json'
const SPRITE_SKIN_STATES = ['default', 'hover', 'pressed', 'disabled', 'selected'] as const

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

export function getSpriteSkinManifestPath(family: string): string {
  return `${normalizeSpritePath(family) || family}/${SPRITE_UI_SKIN_MANIFEST_FILE}`.replace(/^\/+/, '')
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

export function resolveSpriteAssetPath(family: string, asset: string): string {
  const normalizedFamily = normalizeSpritePath(family) || family
  const normalizedAsset = stripCharactersRoot(normalizeSpritePath(asset) || asset)

  if (normalizedAsset.startsWith(`${normalizedFamily}/`)) {
    return normalizedAsset
  }

  return `${normalizedFamily}/${normalizedAsset}`.replace(/\/+/g, '/')
}

export function resolveSpriteSkin(
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

export function spriteSkinStyle(
  projection: ResolvedSpriteSkinProjection | undefined,
  options: SpriteSkinStyleOptions = {},
): Record<string, string | number | undefined> {
  if (!projection) {
    return {}
  }

  const slice = projection.definition.slice
  const padding = projection.definition.contentInsets || zeroInsets()
  const assetUrls = createSpriteSkinAssetUrls(projection, options)
  const currentState = options.state || projection.state
  const currentAssetUrl = resolveSpriteSkinAssetUrl(assetUrls, currentState)
    || resolveSpriteSkinAssetUrl(assetUrls, 'default')
  if (!currentAssetUrl) {
    return {}
  }

  return {
    'position': 'relative',
    'boxSizing': 'border-box',
    'borderStyle': 'solid',
    'borderWidth': insetsToCss(slice),
    'borderImageSource': 'var(--qua-skin-source-current, var(--qua-skin-source-default))',
    'borderImageSlice': `${slice.top} ${slice.right} ${slice.bottom} ${slice.left}${projection.definition.fill ? ' fill' : ''}`,
    'borderImageWidth': insetsToCss(slice),
    'borderImageRepeat': projection.definition.mode === 'tiled' ? 'repeat' : 'stretch',
    'padding': insetsToCss(padding),
    'backgroundClip': 'padding-box',
    '--qua-skin-source-current': `url(${JSON.stringify(currentAssetUrl)})`,
    '--qua-skin-source-default': assetUrls.default ? `url(${JSON.stringify(assetUrls.default)})` : undefined,
    '--qua-skin-source-hover': assetUrls.hover ? `url(${JSON.stringify(assetUrls.hover)})` : undefined,
    '--qua-skin-source-pressed': assetUrls.pressed ? `url(${JSON.stringify(assetUrls.pressed)})` : undefined,
    '--qua-skin-source-disabled': assetUrls.disabled ? `url(${JSON.stringify(assetUrls.disabled)})` : undefined,
    '--qua-skin-source-selected': assetUrls.selected ? `url(${JSON.stringify(assetUrls.selected)})` : undefined,
  }
}

export function applySpriteSkinStyle(
  element: HTMLElement,
  projection: ResolvedSpriteSkinProjection | undefined,
  options: SpriteSkinStyleOptions = {},
): void {
  if (!projection || (!options.assetUrl && !options.assetUrls)) {
    applyElementStyle(element, {
      'position': undefined,
      'boxSizing': undefined,
      'borderStyle': undefined,
      'borderWidth': undefined,
      'borderImageSource': undefined,
      'borderImageSlice': undefined,
      'borderImageWidth': undefined,
      'borderImageRepeat': undefined,
      'padding': undefined,
      'backgroundClip': undefined,
      '--qua-skin-source-current': undefined,
      '--qua-skin-source-default': undefined,
      '--qua-skin-source-hover': undefined,
      '--qua-skin-source-pressed': undefined,
      '--qua-skin-source-disabled': undefined,
      '--qua-skin-source-selected': undefined,
    })
    delete element.dataset.skinFamily
    delete element.dataset.skinId
    delete element.dataset.skinState
    delete element.dataset.skinFallbackUsed
    return
  }

  applyElementStyle(element, spriteSkinStyle(projection, options))
  element.dataset.skinFamily = projection.family
  element.dataset.skinId = projection.skin
  element.dataset.skinState = projection.state
  element.dataset.skinFallbackUsed = projection.fallbackUsed ? 'true' : 'false'
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

function createSpriteSkinAssetUrls(
  projection: ResolvedSpriteSkinProjection,
  options: SpriteSkinStyleOptions,
): Partial<Record<SpriteSkinStateName, string>> {
  const assetUrls: Partial<Record<SpriteSkinStateName, string>> = {}
  if (options.assetUrls) {
    for (const state of SPRITE_SKIN_STATES) {
      const assetUrl = options.assetUrls[state]
      if (assetUrl) {
        assetUrls[state] = assetUrl
      }
    }
    return assetUrls
  }

  if (options.assetUrl) {
    assetUrls[projection.state] = options.assetUrl
    assetUrls.default = options.assetUrl
  }
  return assetUrls
}

function resolveSpriteSkinAssetUrl(
  assetUrls: Partial<Record<SpriteSkinStateName, string>>,
  state: SpriteSkinStateName,
): string | undefined {
  return assetUrls[state] || assetUrls.default
}

function applyElementStyle(element: HTMLElement, style: Record<string, string | number | undefined>): void {
  for (const [property, value] of Object.entries(style)) {
    if (value === undefined) {
      element.style.removeProperty(toCssProperty(property))
      continue
    }
    element.style.setProperty(toCssProperty(property), String(value))
  }
}

function toCssProperty(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function insetsToCss(insets: SpriteInsets): string {
  return `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`
}

function zeroInsets(): SpriteInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}
