import type {
  NativeGuardBundleManifest,
  NativeGuardRuntimePackageManifest,
  NativeGuardRuntimePackageModuleVariantManifest,
} from './package-guard'

export const DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS = [
  '.dylib',
  '.so',
  '.dll',
  '.framework',
  '.bundle',
  '.node',
  '.wasm',
  '.wasi',
  '.exe',
  '.msi',
  '.app',
  '.pkg',
  '.deb',
  '.rpm',
  '.appimage',
  '.jar',
  '.class',
] as const

const RESOURCE_REFERENCE_FIELDS = new Set([
  'asset',
  'assetName',
  'assetPath',
  'assets',
  'audio',
  'background',
  'backgroundImage',
  'fallback',
  'fallbackImage',
  'font',
  'fonts',
  'href',
  'image',
  'images',
  'media',
  'module',
  'name',
  'path',
  'poster',
  'qss',
  'qui',
  'relativePath',
  'resource',
  'resources',
  'src',
  'style',
  'surface',
  'thumbnail',
  'tokens',
  'uri',
  'url',
  'video',
] as const)

const RESOURCE_OBJECT_VALUE_FIELDS = new Set([
  'assetName',
  'href',
  'module',
  'name',
  'path',
  'relativePath',
  'src',
  'uri',
  'url',
] as const)

export function collectRuntimePackageAssetNames(runtimePackage: NativeGuardRuntimePackageManifest, bundleManifest?: NativeGuardBundleManifest): string[] {
  const names = new Set<string>()
  for (const script of runtimePackage.scripts || []) {
    addAssetName(names, script.assetName)
    addRuntimeModuleVariantAssetNames(names, script.variants)
  }
  for (const scene of runtimePackage.scenes || []) {
    addAssetName(names, scene.assetName)
    addAssetName(names, scene.module)
    addRuntimeModuleVariantAssetNames(names, scene.variants)
  }
  for (const plugin of runtimePackage.plugins || []) {
    addAssetName(names, plugin.assetName)
    addAssetName(names, plugin.module)
    addRuntimeModuleVariantAssetNames(names, plugin.variants)
  }
  for (const migration of runtimePackage.storeMigrations || []) {
    addAssetName(names, migration.assetName)
    addRuntimeModuleVariantAssetNames(names, migration.variants)
  }
  for (const assetsByName of Object.values(bundleManifest?.assets || {})) {
    for (const asset of Object.values(assetsByName || {})) {
      addAssetName(names, asset.path)
      addAssetName(names, asset.relativePath)
      addAssetName(names, asset.name)
      for (const variant of Object.values(asset.variants || {})) {
        addAssetName(names, variant.name)
        addAssetName(names, variant.path)
        addAssetName(names, variant.relativePath)
      }
    }
  }
  collectDeclaredResourceReferences(runtimePackage, names)
  return Array.from(names)
}

export function isForbiddenNativePayload(assetName: string, forbiddenExtensions: ReadonlySet<string> = new Set(DEFAULT_FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS)): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().replace(/\\/g, '/')
  return Array.from(forbiddenExtensions).some(extension =>
    normalized.endsWith(extension) || normalized.includes(`${extension}/`))
}

export function isForbiddenNativeAssetReference(assetName: string): boolean {
  const withoutSuffix = stripAssetReferenceSuffix(assetName)
  if (assetName.trim().length === 0 || withoutSuffix.trim().length === 0)
    return true
  if (
    assetName.trim() !== assetName
    || /[\u0000-\u001F\u007F]/.test(assetName)
    || assetName.includes('\\')
  ) {
    return true
  }

  const normalized = withoutSuffix.replace(/\\/g, '/')
  return normalized.startsWith('/')
    || normalized.startsWith('\\')
    || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
    || normalized.endsWith('/')
    || normalized.split('/').some(segment => segment.length === 0 || segment === '.' || segment === '..')
}

function addRuntimeModuleVariantAssetNames(
  names: Set<string>,
  variants: Record<string, NativeGuardRuntimePackageModuleVariantManifest> | undefined,
): void {
  for (const variant of Object.values(variants || {})) {
    addAssetName(names, variant.assetName)
    addAssetName(names, variant.module)
    addAssetName(names, variant.name)
    addAssetName(names, variant.path)
    addAssetName(names, variant.relativePath)
  }
}

function addAssetName(names: Set<string>, value: string | undefined): void {
  if (typeof value === 'string')
    names.add(value)
}

function collectDeclaredResourceReferences(
  value: unknown,
  names: Set<string>,
  resourceContext = false,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== 'object')
    return
  if (seen.has(value))
    return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (resourceContext && typeof entry === 'string') {
        addAssetName(names, entry)
        continue
      }
      collectDeclaredResourceReferences(entry, names, resourceContext, seen)
    }
    return
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const isResourceField = RESOURCE_REFERENCE_FIELDS.has(key as never)
    if (typeof entry === 'string') {
      if (
        isResourceField
        || (resourceContext && RESOURCE_OBJECT_VALUE_FIELDS.has(key as never))
      ) {
        addAssetName(names, entry)
      }
      continue
    }

    collectDeclaredResourceReferences(entry, names, resourceContext || isResourceField, seen)
  }
}

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}
