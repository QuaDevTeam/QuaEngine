import type {
  QuaViewProjection,
  ViewChoiceProjection,
  ViewUiOverlayProjection,
  ViewUiPluginProjection,
  ViewUiSkinDefaultsProjection,
} from './index'

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

export type UiSkinControlKind = 'button' | 'panel' | 'input' | 'tab' | 'toggle'

const SPRITE_CHARACTERS_DIR = 'characters'
const SPRITE_UI_SKIN_MANIFEST_FILE = 'ui-skin.manifest.json'

export function normalizeSpritePath(value?: string): string | undefined {
  if (!value)
    return undefined

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
  if (!normalized)
    return undefined

  const asset = stripCharactersRoot(normalized)
  const segments = asset.split('/').filter(Boolean)
  if (segments.length < 2)
    return undefined

  const skinName = segments[segments.length - 1]
  const family = segments.slice(0, -1).join('/')
  if (!family || !skinName)
    return undefined

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

  if (normalizedAsset.startsWith(`${normalizedFamily}/`))
    return normalizedAsset

  return `${normalizedFamily}/${normalizedAsset}`.replace(/\/+/g, '/')
}

export function resolveSpriteSkin(
  manifest: SpriteSkinManifest | undefined,
  skin?: string,
  state: SpriteSkinStateName = 'default',
): ResolvedSpriteSkinProjection | undefined {
  const reference = resolveSpriteSkinReference(skin)
  if (!reference)
    return undefined

  const normalizedManifest = manifest ? normalizeSpriteSkinManifestForFamily(manifest, reference.family) : undefined
  const definition = normalizedManifest?.skins?.[reference.skin]
  if (!definition)
    return undefined

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

export function getUiSkinProjection(view: Readonly<QuaViewProjection>): Readonly<ViewUiPluginProjection> | undefined {
  return view.plugins.ui as Readonly<ViewUiPluginProjection> | undefined
}

export function getUiSkinDefaults(view: Readonly<QuaViewProjection>): Readonly<ViewUiSkinDefaultsProjection> | undefined {
  return getUiSkinProjection(view)?.defaults
}

export function resolveUiThemeId(themeId: string | undefined): string | undefined {
  if (!themeId)
    return undefined

  const normalized = themeId.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  if (!normalized)
    return undefined

  return normalized.startsWith('ui/') ? normalized : `ui/${normalized}`
}

export function resolveUiSkinReference(
  view: Readonly<QuaViewProjection>,
  kind: UiSkinControlKind,
  explicitSkinId?: string,
): string | undefined {
  const ui = getUiSkinProjection(view)
  const themeId = resolveUiThemeId(ui?.themeId)
  const skinId = normalizeSkinReference(explicitSkinId || ui?.defaults?.[kind])
  if (!skinId)
    return undefined

  if (skinId.includes('/'))
    return skinId

  return themeId ? `${themeId}/${skinId}` : skinId
}

export function resolveUiChoiceSkinReference(
  view: Readonly<QuaViewProjection>,
  choice: Readonly<ViewChoiceProjection>,
): string | undefined {
  return resolveUiSkinReference(view, 'button', choice.presentation?.skinId)
}

export function resolveUiOverlaySkinReference(
  view: Readonly<QuaViewProjection>,
  overlay: Readonly<ViewUiOverlayProjection> | undefined,
  kind: UiSkinControlKind = 'panel',
): string | undefined {
  return resolveUiSkinReference(view, kind, overlay?.skinId)
}

export function resolveUiControlSkinReference(
  view: Readonly<QuaViewProjection>,
  kind: UiSkinControlKind,
  explicitSkinId?: string,
): string | undefined {
  return resolveUiSkinReference(view, kind, explicitSkinId)
}

export function resolveUiSkinState(options: {
  state?: SpriteSkinStateName
  disabled?: boolean
  selected?: boolean
} = {}): SpriteSkinStateName {
  if (options.disabled)
    return 'disabled'
  if (options.selected)
    return 'selected'
  if (options.state === 'disabled' || options.state === 'selected')
    return 'default'
  return options.state || 'default'
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
      ])) as Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition>>
      : undefined,
  }
}

function normalizeSpriteSkinAssetDefinition(
  definition: SpriteSkinAssetDefinition | SpriteSkinStateDefinition,
  family: string,
): SpriteSkinAssetDefinition | SpriteSkinStateDefinition {
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

function normalizeSkinReference(value: string | undefined): string | undefined {
  if (!value)
    return undefined

  const normalized = value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : undefined
}
