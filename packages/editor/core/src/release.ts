/** Desktop release metadata. Independent from engine/QPK game content. */
export type EditorReleaseChannel = 'stable' | 'beta'
export type EditorReleaseComponentId = 'boilerplate' | 'runtime'
export type EditorReleasePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
export interface EditorReleaseArtifact {
  platform: 'macos' | 'windows' | 'linux'
  arch: 'arm64' | 'x64'
  format: 'zip' | 'tar.gz'
  url: string
  sha256: string
  size: number
}
export interface EditorReleaseManifest {
  schemaVersion: 1
  product: 'quaengine-editor'
  channel: EditorReleaseChannel
  version: string
  publishedAt: string
  artifacts: EditorReleaseArtifact[]
}
export interface EditorAppUpdateState {
  phase: EditorReleasePhase
  channel: EditorReleaseChannel
  currentVersion: string
  installSupported: boolean
  platform: EditorReleaseArtifact['platform']
  arch: EditorReleaseArtifact['arch']
  availableVersion?: string
  size?: number
  downloadedPath?: string
  url?: string
  error?: string
}
export interface EditorReleaseSnapshot {
  app: EditorAppUpdateState
}
export interface EditorReleaseUpdateResult {
  checked: boolean
  updated: { id: EditorReleaseComponentId, version: string, directory: string }[]
  app: EditorAppUpdateState
  error?: string
}
export interface EditorComponentRelease {
  component: EditorReleaseComponentId
  version: string
  editorRange: string
  url: string
  sha256: string
  size: number
}
export interface EditorComponentCatalog {
  schemaVersion: 1
  product: 'quaengine-editor-components'
  channel: EditorReleaseChannel
  component: EditorReleaseComponentId
  releases: EditorComponentRelease[]
}
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string')
    return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  }
  catch {
    return false
  }
}

export function editorReleaseManifestUrl(channel: EditorReleaseChannel, repository = 'QuaDevTeam/QuaEngine'): string {
  return `https://github.com/${repository}/releases/download/editor-${channel}-latest/QuaEngine-Editor-${channel}-manifest.json`
}
export function editorComponentCatalogUrl(channel: EditorReleaseChannel, component: EditorReleaseComponentId, repository = 'QuaDevTeam/QuaEngine'): string {
  return `https://github.com/${repository}/releases/download/editor-components-${channel}-latest/${component}.json`
}
export function parseEditorComponentCatalog(value: unknown): EditorComponentCatalog {
  const item = value as EditorComponentCatalog | null
  if (!item || item.schemaVersion !== 1 || item.product !== 'quaengine-editor-components'
    || !['stable', 'beta'].includes(item.channel) || !['boilerplate', 'runtime'].includes(item.component)
    || !Array.isArray(item.releases) || item.releases.length > 32) {
    throw new Error('Invalid editor component catalog.')
  }
  for (const release of item.releases) {
    if (!release || release.component !== item.component || typeof release.version !== 'string'
      || typeof release.editorRange !== 'string' || !semverPattern.test(release.version) || !isHttpsUrl(release.url)
      || typeof release.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(release.sha256)
      || !Number.isSafeInteger(release.size) || release.size <= 0) {
      throw new Error('Invalid editor component release.')
    }
  }
  return structuredClone(item)
}
export function parseEditorReleaseManifest(value: unknown): EditorReleaseManifest {
  const item = value as EditorReleaseManifest | null
  if (!item || item.schemaVersion !== 1 || item.product !== 'quaengine-editor'
    || !['stable', 'beta'].includes(item.channel) || typeof item.version !== 'string' || !semverPattern.test(item.version)
    || !Number.isFinite(Date.parse(item.publishedAt))
    || !Array.isArray(item.artifacts) || !item.artifacts.length || item.artifacts.length > 16) {
    throw new Error('Invalid editor release manifest.')
  }
  const targets = new Set<string>()
  for (const artifact of item.artifacts) {
    if (!artifact || !['macos', 'windows', 'linux'].includes(artifact.platform)
      || !['x64', 'arm64'].includes(artifact.arch) || !['zip', 'tar.gz'].includes(artifact.format)
      || !isHttpsUrl(artifact.url)
      || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(artifact.sha256)
      || !Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
      throw new Error('Invalid editor release artifact.')
    }
    const target = `${artifact.platform}-${artifact.arch}`
    if (targets.has(target))
      throw new Error('Duplicate editor release target.')
    targets.add(target)
  }
  return structuredClone(item)
}
