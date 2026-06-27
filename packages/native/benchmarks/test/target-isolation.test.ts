import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FORBIDDEN_TARGET_CORE_PACKAGES = [
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
]

describe('@quajs/native-benchmarks target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from benchmark tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ]
    const violations = roots.flatMap(root => sourceFiles(root)).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return importSpecifiers(source)
        .filter(specifier => FORBIDDEN_TARGET_CORE_PACKAGES.some(packageName =>
          specifier === packageName || specifier.startsWith(`${packageName}/`),
        ))
        .map(specifier => `${filePath}: ${specifier}`)
    })

    expect(violations).toEqual([])
  })

  it('collects static, side-effect, re-export, and dynamic import specifiers', () => {
    expect(importSpecifiers(`
      import type { Thing } from '@example/types'
      import { value } from '@example/static'
      import '@example/side-effect'
      export * from '@example/export-star'
      export { value } from '@example/export-named'
      await import('@example/dynamic')
    `)).toEqual([
      '@example/types',
      '@example/static',
      '@example/side-effect',
      '@example/export-star',
      '@example/export-named',
      '@example/dynamic',
    ])
  })
})

function sourceFiles(root: string): string[] {
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
