import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const FORBIDDEN_NATIVE_AUTHORING_TARGET_CORE_PACKAGES = [
  '@quajs/assets-cocos',
  '@quajs/assets-native',
  '@quajs/assets-web',
  '@quajs/cocos-host',
  '@quajs/engine-native',
  '@quajs/renderer-cocos',
  '@quajs/renderer-react',
  '@quajs/renderer-svelte',
  '@quajs/renderer-vue',
  '@quajs/renderer-web',
  '@quajs/store-cocos',
  '@quajs/store-native',
  '@quajs/store-web',
] as const

export function collectForbiddenTargetCoreImportViolations(roots: readonly string[]): string[] {
  return roots.flatMap(root => sourceFiles(root)).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return importSpecifiers(source)
      .filter(specifier => FORBIDDEN_NATIVE_AUTHORING_TARGET_CORE_PACKAGES.some(packageName =>
        specifier === packageName || specifier.startsWith(`${packageName}/`),
      ))
      .map(specifier => `${filePath}: ${specifier}`)
  })
}

export function collectForbiddenTargetCoreManifestDependencyViolations(manifestPaths: readonly string[]): string[] {
  return manifestPaths.flatMap((manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      peerDependencies?: Record<string, unknown>
      optionalDependencies?: Record<string, unknown>
    }
    return [
      ...manifestDependencyViolations(manifestPath, 'dependencies', manifest.dependencies),
      ...manifestDependencyViolations(manifestPath, 'devDependencies', manifest.devDependencies),
      ...manifestDependencyViolations(manifestPath, 'peerDependencies', manifest.peerDependencies),
      ...manifestDependencyViolations(manifestPath, 'optionalDependencies', manifest.optionalDependencies),
    ]
  })
}

export function sourceFiles(root: string): string[] {
  if (!statSync(root).isDirectory())
    return root.endsWith('.ts') ? [root] : []

  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    if (statSync(path).isDirectory())
      return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

export function importSpecifiers(source: string): string[] {
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const specifiers: string[] = []
  for (const match of source.matchAll(pattern))
    specifiers.push(match[1] ?? match[2])
  return specifiers
}

function manifestDependencyViolations(
  manifestPath: string,
  field: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies',
  dependencies: Record<string, unknown> | undefined,
): string[] {
  if (!dependencies)
    return []

  return Object.keys(dependencies)
    .filter(dependency => FORBIDDEN_NATIVE_AUTHORING_TARGET_CORE_PACKAGES.some(packageName =>
      dependency === packageName || dependency.startsWith(`${packageName}/`),
    ))
    .map(dependency => `${manifestPath} ${field}: ${dependency}`)
}
