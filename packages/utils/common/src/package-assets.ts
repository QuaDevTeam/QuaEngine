export const DEFAULT_FORBIDDEN_CODE_ASSET_EXTENSIONS = [
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

export function isForbiddenCodeAsset(assetName: string, forbiddenExtensions: ReadonlySet<string> = new Set(DEFAULT_FORBIDDEN_CODE_ASSET_EXTENSIONS)): boolean {
  const normalized = stripAssetReferenceSuffix(assetName).toLowerCase().replace(/\\/g, '/')
  return Array.from(forbiddenExtensions).some(extension =>
    normalized.endsWith(extension) || normalized.includes(`${extension}/`))
}

export function isUnsafePackageAssetReference(assetName: string): boolean {
  const withoutSuffix = stripAssetReferenceSuffix(assetName)
  if (assetName.trim().length === 0 || withoutSuffix.trim().length === 0)
    return true
  if (
    assetName.trim() !== assetName
    // eslint-disable-next-line no-control-regex
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

function stripAssetReferenceSuffix(assetName: string): string {
  const suffixIndex = assetName.search(/[?#]/)
  return suffixIndex >= 0 ? assetName.slice(0, suffixIndex) : assetName
}
