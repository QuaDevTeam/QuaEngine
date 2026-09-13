import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FORBIDDEN_TARGET_RUNTIME_PACKAGES = [
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

describe('@quajs/native-contracts target isolation', () => {
  it('does not import Web, Cocos, or native runtime packages from shared contracts', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ]

    expect(collectForbiddenTargetRuntimeImportViolations(roots)).toEqual([])
  })
})

function collectForbiddenTargetRuntimeImportViolations(roots: readonly string[]): string[] {
  return roots.flatMap(root => sourceFiles(root)).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return importSpecifiers(source)
      .filter(specifier => FORBIDDEN_TARGET_RUNTIME_PACKAGES.some(packageName =>
        specifier === packageName || specifier.startsWith(`${packageName}/`),
      ))
      .map(specifier => `${filePath}: ${specifier}`)
  })
}

function sourceFiles(root: string): string[] {
  if (!statSync(root).isDirectory())
    return root.endsWith('.ts') ? [root] : []

  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry)
    if (statSync(path).isDirectory())
      return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

function importSpecifiers(source: string): string[] {
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const specifiers: string[] = []
  for (const match of source.matchAll(pattern))
    specifiers.push(match[1] ?? match[2])
  return specifiers
}
