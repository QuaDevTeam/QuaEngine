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
  it('does not import Web, Cocos, or native bootstrap core packages', () => {
    const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))
    const violations = sourceFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return importSpecifiers(source)
        .filter(specifier => FORBIDDEN_TARGET_CORE_PACKAGES.some(packageName =>
          specifier === packageName || specifier.startsWith(`${packageName}/`),
        ))
        .map(specifier => `${filePath}: ${specifier}`)
    })

    expect(violations).toEqual([])
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
  const pattern = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const specifiers: string[] = []
  for (const match of source.matchAll(pattern))
    specifiers.push(match[1] ?? match[2])
  return specifiers
}
