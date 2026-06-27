import { collectTargetCoreAdapterRoots, normalizePackageSpecifier } from './bootstrap'
import type {
  NativeGuardPackageReference,
  NativeGuardRuntimePackageManifest,
  NativeRuntimePackageGuardDiagnostic,
} from './package-guard'

export function collectTargetCoreDependencyDeclarations(
  runtimePackage: NativeGuardRuntimePackageManifest,
  diagnostics: NativeRuntimePackageGuardDiagnostic[],
): void {
  const targetCoreRoots = collectTargetCoreAdapterRoots()
  collectTargetCorePackageReferenceDeclarations(runtimePackage, diagnostics, targetCoreRoots, 'executableDependencies', runtimePackage.executableDependencies)
  collectTargetCorePackageReferenceDeclarations(runtimePackage, diagnostics, targetCoreRoots, 'rendererEntries', runtimePackage.rendererEntries)
}

function collectTargetCorePackageReferenceDeclarations(
  runtimePackage: NativeGuardRuntimePackageManifest,
  diagnostics: NativeRuntimePackageGuardDiagnostic[],
  targetCoreRoots: ReadonlySet<string>,
  field: 'executableDependencies' | 'rendererEntries',
  references: readonly NativeGuardPackageReference[] | undefined,
): void {
  for (const reference of references || []) {
    for (const packageName of packageReferenceSpecifiers(reference).map(normalizePackageSpecifier)) {
      if (!targetCoreRoots.has(packageName))
        continue

      diagnostics.push({
        code: 'NATIVE_PACKAGE_TARGET_CORE_DEPENDENCY_FORBIDDEN',
        severity: 'error',
        packageId: runtimePackage.id,
        field,
        message: `Native runtime package "${runtimePackage.id}" must not declare target core adapter "${packageName}" through "${field}".`,
      })
    }
  }
}

function packageReferenceSpecifiers(reference: NativeGuardPackageReference): string[] {
  if (typeof reference === 'string')
    return [reference]

  return Array.from(new Set(
    [reference.specifier, reference.packageName]
      .filter((specifier): specifier is string => Boolean(specifier)),
  ))
}
