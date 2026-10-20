import type { AssetBundleTarget } from './core/types'
import type { QuaProjectLayoutInput } from './project'

export interface QuaProjectGodotTargetConfig {
  enabled?: boolean
  projectDir?: string
  layout?: QuaProjectLayoutInput
  assetTarget?: AssetBundleTarget
  build: { entry: string, viteConfig?: string, profile?: 'debug' | 'release' }
}

export interface NormalizedQuaProjectGodotTarget {
  enabled: boolean
  projectDir: string
  layout: QuaProjectLayoutInput
  assetTarget?: AssetBundleTarget
  build: { entry: string, viteConfig?: string, profile: 'debug' | 'release' }
}

export function normalizeGodotTarget(value: unknown, issues: string[]): NormalizedQuaProjectGodotTarget | undefined {
  if (value === false || value === undefined)
    return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push('targets.godot must be an object or false.')
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean')
    issues.push('targets.godot.enabled must be a boolean.')
  if (record.enabled === false)
    return undefined
  const build = record.build as QuaProjectGodotTargetConfig['build'] | undefined
  if (!build || typeof build.entry !== 'string' || !build.entry.trim())
    issues.push('targets.godot.build.entry must be a non-empty business module path.')
  if (build?.viteConfig !== undefined && (typeof build.viteConfig !== 'string' || !build.viteConfig.trim()))
    issues.push('targets.godot.build.viteConfig must be a non-empty path.')
  if (build?.profile !== undefined && build.profile !== 'debug' && build.profile !== 'release')
    issues.push('targets.godot.build.profile must be debug or release.')
  if (record.projectDir !== undefined && (typeof record.projectDir !== 'string' || !record.projectDir.trim()))
    issues.push('targets.godot.projectDir must be a non-empty path.')
  const assetTarget = record.assetTarget as AssetBundleTarget | undefined
  if (assetTarget !== undefined && (!assetTarget || typeof assetTarget !== 'object' || Array.isArray(assetTarget)))
    issues.push('targets.godot.assetTarget must be an object.')
  if (record.layout !== undefined && record.layout !== 'portrait' && record.layout !== 'landscape' && (!record.layout || typeof record.layout !== 'object' || Array.isArray(record.layout)))
    issues.push('targets.godot.layout must be landscape, portrait, or a layout object.')
  if (assetTarget?.platform && assetTarget.platform !== 'godot')
    issues.push('targets.godot.assetTarget.platform must be godot.')
  if (assetTarget?.cocos)
    issues.push('Godot assets cannot declare a Cocos hybrid output.')
  return {
    enabled: true,
    projectDir: typeof record.projectDir === 'string' ? record.projectDir : 'dist/godot/workspace',
    layout: record.layout === 'portrait' || record.layout === 'landscape' || (record.layout && typeof record.layout === 'object') ? record.layout as QuaProjectLayoutInput : 'landscape',
    assetTarget,
    build: { entry: build?.entry || '', viteConfig: build?.viteConfig, profile: build?.profile || 'debug' },
  }
}
