import type { QuaTargetBootstrap } from './bootstrap'
import { normalizePackageSpecifier, TARGET_BOOTSTRAP_MANIFESTS } from './bootstrap'

export type TargetPluginEntryTarget = QuaTargetBootstrap | 'shared'

export type TargetPluginImportReference = string | {
  specifier?: string
  packageName?: string
  source?: 'static-import' | 'dynamic-import' | 'export' | 'metadata' | 'unknown'
  optional?: boolean
}

export interface TargetPluginEntryDeclaration {
  specifier: string
  target?: TargetPluginEntryTarget
  imports?: readonly TargetPluginImportReference[]
  eager?: boolean
}

export interface TargetPluginManifest {
  pluginId: string
  entries: readonly TargetPluginEntryDeclaration[]
}

export interface CheckTargetPluginManifestOptions {
  target: QuaTargetBootstrap
  manifest: TargetPluginManifest
  selectedEntries?: readonly string[]
  requireTargetEntry?: boolean
}

export type TargetPluginManifestDiagnosticCode
  = | 'TARGET_PLUGIN_ENTRY_MISSING'
    | 'TARGET_PLUGIN_SELECTED_ENTRY_UNKNOWN'
    | 'TARGET_PLUGIN_SELECTED_ENTRY_MISSING'
    | 'TARGET_PLUGIN_SELECTED_ENTRY_TARGET_MISMATCH'
    | 'TARGET_PLUGIN_INACTIVE_ENTRY_EAGER'
    | 'TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT'
    | 'TARGET_PLUGIN_SHARED_ENTRY_TARGET_CORE_IMPORT'
    | 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT'

export interface TargetPluginManifestDiagnostic {
  code: TargetPluginManifestDiagnosticCode
  target: QuaTargetBootstrap
  pluginId: string
  specifier?: string
  entryTarget?: TargetPluginEntryTarget
  packageName?: string
  message: string
}

export interface TargetPluginManifestValidationResult {
  ok: boolean
  selectedEntries: TargetPluginEntryDeclaration[]
  diagnostics: TargetPluginManifestDiagnostic[]
}

export function validateTargetPluginManifest(
  options: CheckTargetPluginManifestOptions,
): TargetPluginManifestValidationResult {
  const diagnostics: TargetPluginManifestDiagnostic[] = []
  const { manifest, target } = options
  const selectedEntries = collectSelectedPluginEntries(options)

  if (options.requireTargetEntry !== false && !manifest.entries.some(entry => pluginEntryTarget(entry) === target)) {
    diagnostics.push({
      code: 'TARGET_PLUGIN_ENTRY_MISSING',
      target,
      pluginId: manifest.pluginId,
      message: `Plugin "${manifest.pluginId}" must declare a "${target}" renderer entry before it can be packaged for that target.`,
    })
  }

  if (
    options.requireTargetEntry !== false
    && options.selectedEntries
    && !selectedEntries.some(entry => pluginEntryTarget(entry) === target)
  ) {
    diagnostics.push({
      code: 'TARGET_PLUGIN_SELECTED_ENTRY_MISSING',
      target,
      pluginId: manifest.pluginId,
      message: `Plugin "${manifest.pluginId}" selected entries must include a "${target}" renderer entry.`,
    })
  }

  for (const selectedSpecifier of options.selectedEntries || []) {
    const entry = manifest.entries.find(candidate => candidate.specifier === selectedSpecifier)
    if (!entry) {
      diagnostics.push({
        code: 'TARGET_PLUGIN_SELECTED_ENTRY_UNKNOWN',
        target,
        pluginId: manifest.pluginId,
        specifier: selectedSpecifier,
        message: `Plugin "${manifest.pluginId}" selected unknown renderer entry "${selectedSpecifier}" for target "${target}".`,
      })
      continue
    }

    const entryTarget = pluginEntryTarget(entry)
    if (entryTarget !== 'shared' && entryTarget !== target) {
      diagnostics.push({
        code: 'TARGET_PLUGIN_SELECTED_ENTRY_TARGET_MISMATCH',
        target,
        pluginId: manifest.pluginId,
        specifier: entry.specifier,
        entryTarget,
        message: `Plugin "${manifest.pluginId}" selected "${entry.specifier}" for target "${target}", but that entry targets "${entryTarget}".`,
      })
    }
  }

  for (const entry of manifest.entries) {
    const entryTarget = pluginEntryTarget(entry)
    if (entryTarget !== 'shared' && entryTarget !== target && entry.eager) {
      diagnostics.push({
        code: 'TARGET_PLUGIN_INACTIVE_ENTRY_EAGER',
        target,
        pluginId: manifest.pluginId,
        specifier: entry.specifier,
        entryTarget,
        message: `Plugin "${manifest.pluginId}" entry "${entry.specifier}" targets "${entryTarget}" and must not be eagerly imported by a "${target}" artifact.`,
      })
      for (const packageName of collectPluginEntryImportPackageNames(entry)) {
        if (!isKnownTargetCoreAdapter(packageName))
          continue

        diagnostics.push({
          code: 'TARGET_PLUGIN_INACTIVE_ENTRY_TARGET_CORE_IMPORT',
          target,
          pluginId: manifest.pluginId,
          specifier: entry.specifier,
          entryTarget,
          packageName,
          message: `Plugin "${manifest.pluginId}" eager inactive entry "${entry.specifier}" targets "${entryTarget}" and would import target core adapter "${packageName}" into a "${target}" artifact.`,
        })
      }
    }
  }

  for (const entry of selectedEntries) {
    const entryTarget = pluginEntryTarget(entry)
    for (const packageName of collectPluginEntryImportPackageNames(entry)) {
      if (entryTarget === 'shared' && isKnownTargetCoreAdapter(packageName)) {
        diagnostics.push({
          code: 'TARGET_PLUGIN_SHARED_ENTRY_TARGET_CORE_IMPORT',
          target,
          pluginId: manifest.pluginId,
          specifier: entry.specifier,
          entryTarget,
          packageName,
          message: `Plugin "${manifest.pluginId}" shared entry "${entry.specifier}" must not import target core adapter "${packageName}".`,
        })
      }

      if (entryTarget === target && isForbiddenForTarget(target, packageName)) {
        diagnostics.push({
          code: 'TARGET_PLUGIN_TARGET_ENTRY_FOREIGN_CORE_IMPORT',
          target,
          pluginId: manifest.pluginId,
          specifier: entry.specifier,
          entryTarget,
          packageName,
          message: `Plugin "${manifest.pluginId}" ${target} entry "${entry.specifier}" must not import foreign target core adapter "${packageName}".`,
        })
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    selectedEntries,
    diagnostics,
  }
}

export function pluginEntryTarget(entry: TargetPluginEntryDeclaration): TargetPluginEntryTarget {
  return entry.target || 'shared'
}

function collectSelectedPluginEntries(options: CheckTargetPluginManifestOptions): TargetPluginEntryDeclaration[] {
  if (options.selectedEntries) {
    return options.selectedEntries
      .map(specifier => options.manifest.entries.find(entry => entry.specifier === specifier))
      .filter((entry): entry is TargetPluginEntryDeclaration => Boolean(entry))
  }

  return options.manifest.entries.filter((entry) => {
    const target = pluginEntryTarget(entry)
    return target === 'shared' || target === options.target
  })
}

function collectPluginEntryImportPackageNames(entry: TargetPluginEntryDeclaration): string[] {
  return Array.from(new Set((entry.imports || [])
    .map(pluginImportReferenceSpecifier)
    .filter((specifier): specifier is string => Boolean(specifier))
    .map(normalizePackageSpecifier)))
}

function pluginImportReferenceSpecifier(reference: TargetPluginImportReference): string | undefined {
  if (typeof reference === 'string')
    return reference
  return reference.packageName || reference.specifier
}

function isKnownTargetCoreAdapter(packageName: string): boolean {
  return Object.values(TARGET_BOOTSTRAP_MANIFESTS).some(manifest =>
    manifest.coreAdapters.includes(packageName)
    || manifest.corePluginFamilyRoots.includes(packageName)
    || manifest.forbiddenCoreAdapters.includes(packageName))
}

function isForbiddenForTarget(target: QuaTargetBootstrap, packageName: string): boolean {
  return TARGET_BOOTSTRAP_MANIFESTS[target].forbiddenCoreAdapters.includes(packageName)
}
