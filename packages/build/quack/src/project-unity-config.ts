import type { AssetBundleTarget } from './core/types'
import type { QuaProjectLayoutInput } from './project'

export const QUA_UNITY_EDITOR_VERSION = '6000.3.28f1'
export interface QuaProjectUnityTargetConfig {
  enabled?: boolean
  projectDir?: string
  editorVersion?: string
  layout?: QuaProjectLayoutInput
  assetTarget?: AssetBundleTarget
  build: { entry: string, viteConfig?: string, profile?: 'debug' | 'release' }
}
export interface NormalizedQuaProjectUnityTarget {
  enabled: boolean
  projectDir: string
  editorVersion: string
  layout: QuaProjectLayoutInput
  assetTarget?: AssetBundleTarget
  build: { entry: string, viteConfig?: string, profile: 'debug' | 'release' }
}

export function normalizeUnityTarget(value: unknown, issues: string[]): NormalizedQuaProjectUnityTarget | undefined {
  if (value === undefined || value === false)
    return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push('targets.unity must be an object or false.')
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean')
    issues.push('targets.unity.enabled must be a boolean.')
  if (record.enabled === false)
    return undefined
  const build = record.build && typeof record.build === 'object' && !Array.isArray(record.build) ? record.build as QuaProjectUnityTargetConfig['build'] : undefined
  if (typeof build?.entry !== 'string' || !build.entry.trim())
    issues.push('targets.unity.build.entry must be a non-empty business module path.')
  if (build?.viteConfig !== undefined && (typeof build.viteConfig !== 'string' || !build.viteConfig.trim()))
    issues.push('targets.unity.build.viteConfig must be a non-empty path.')
  if (build?.profile !== undefined && !['debug', 'release'].includes(build.profile))
    issues.push('targets.unity.build.profile must be debug or release.')
  if (record.projectDir !== undefined && (typeof record.projectDir !== 'string' || !record.projectDir.trim()))
    issues.push('targets.unity.projectDir must be a non-empty path.')
  const editorVersion = record.editorVersion ?? QUA_UNITY_EDITOR_VERSION
  if (typeof editorVersion !== 'string' || !/^6000\.3\.\d+f\d+$/.test(editorVersion))
    issues.push('targets.unity.editorVersion must be a stable Unity 6.3 LTS version (6000.3.NfN).')
  const layout = record.layout
  if (layout !== undefined && layout !== 'portrait' && layout !== 'landscape' && (!layout || typeof layout !== 'object' || Array.isArray(layout)))
    issues.push('targets.unity.layout must be landscape, portrait or a layout object.')
  const assetTarget = record.assetTarget as AssetBundleTarget | undefined
  if (assetTarget !== undefined && (!assetTarget || typeof assetTarget !== 'object' || Array.isArray(assetTarget) || (assetTarget.platform && assetTarget.platform !== 'unity') || assetTarget.cocos))
    issues.push('targets.unity.assetTarget must be a Unity target without Cocos hybrid metadata.')
  return {
    enabled: true,
    projectDir: typeof record.projectDir === 'string' ? record.projectDir : 'dist/unity/workspace',
    editorVersion: typeof editorVersion === 'string' ? editorVersion : QUA_UNITY_EDITOR_VERSION,
    layout: (layout ?? 'landscape') as QuaProjectLayoutInput,
    assetTarget,
    build: { entry: build?.entry || '', viteConfig: build?.viteConfig, profile: build?.profile || 'debug' },
  }
}
