import type { QuaTargetBootstrap } from './bootstrap'

export type TargetBundlePackageReference = string | {
  specifier?: string
  packageName?: string
}

export type TargetBundlePackageGraphReference
  = | TargetBundlePackageReference
    | TargetBundleDependencyReference
    | TargetBundleRendererEntryReference

export type TargetBundleProjectGraphKind
  = | 'project-template'
    | 'startup-shell'
    | 'debug-shell'
    | 'release-shell'
    | 'smoke-runner'
    | 'installer'
    | 'updater'
    | 'dev-server'
    | 'post-bundle'
    | 'custom'

export interface TargetBundleDependencyReference {
  specifier: string
  runtime?: boolean
  optional?: boolean
  source?: 'static-import' | 'dynamic-import' | 'plugin-entry' | 'runtime-package' | 'native-binary' | 'unknown'
}

export interface TargetBundleRendererEntryReference {
  specifier: string
  pluginId?: string
  target?: QuaTargetBootstrap
}

export interface TargetBundleRuntimePackageRecord {
  id: string
  executableDependencies?: readonly TargetBundlePackageReference[]
  rendererEntries?: readonly (TargetBundlePackageReference | TargetBundleRendererEntryReference)[]
}

export interface TargetBundleProjectGraphRecord {
  id: string
  kind: TargetBundleProjectGraphKind
  references?: readonly TargetBundlePackageGraphReference[]
}

export function collectPackageReferenceSpecifiers(
  references: readonly TargetBundlePackageGraphReference[],
): string[] {
  return references.flatMap(packageReferenceSpecifiers)
}

export function packageReferenceSpecifier(reference: TargetBundlePackageGraphReference): string | undefined {
  if (typeof reference === 'string')
    return reference

  return reference.specifier || ('packageName' in reference ? reference.packageName : undefined)
}

export function rendererEntryReferenceTarget(
  reference: TargetBundlePackageReference | TargetBundleRendererEntryReference,
): QuaTargetBootstrap | undefined {
  return typeof reference === 'string' || !('target' in reference) ? undefined : reference.target
}

export function rendererEntryReferencePluginId(
  reference: TargetBundlePackageReference | TargetBundleRendererEntryReference,
): string | undefined {
  return typeof reference === 'string' || !('pluginId' in reference) ? undefined : reference.pluginId
}

function packageReferenceSpecifiers(reference: TargetBundlePackageGraphReference): string[] {
  if (typeof reference === 'string')
    return [reference]

  const specifiers = [
    reference.specifier,
    'packageName' in reference ? reference.packageName : undefined,
  ]

  return Array.from(new Set(specifiers.filter((specifier): specifier is string => Boolean(specifier))))
}
