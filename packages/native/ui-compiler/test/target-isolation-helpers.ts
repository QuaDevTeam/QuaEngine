import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const FORBIDDEN_NATIVE_AUTHORING_TARGET_CORE_PACKAGES = [
  '@quajs/assets-native',
  '@quajs/assets-web',
  '@quajs/cocos-host',
  '@quajs/engine-native',
  '@quajs/renderer-cocos',
  '@quajs/renderer-react',
  '@quajs/renderer-svelte',
  '@quajs/renderer-vue',
  '@quajs/renderer-web',
  '@quajs/store-native',
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
