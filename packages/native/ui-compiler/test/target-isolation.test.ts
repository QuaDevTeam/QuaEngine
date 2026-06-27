import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectForbiddenTargetCoreManifestDependencyViolations,
  collectForbiddenTargetCoreImportViolations,
  importSpecifiers,
} from './target-isolation-helpers'

describe('@quajs/native-ui-compiler target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from compiler tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })

  it('does not depend on Web, Cocos, or native bootstrap core packages from compiler tooling', () => {
    expect(collectForbiddenTargetCoreManifestDependencyViolations([
      fileURLToPath(new URL('../package.json', import.meta.url)),
    ])).toEqual([])
  })

  it('collects forbidden target-core package manifest dependencies', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'qua-native-target-isolation-'))
    const manifestPath = join(fixtureDir, 'package.json')
    try {
      writeFileSync(manifestPath, JSON.stringify({
        dependencies: {
          '@quajs/renderer-web': 'workspace:*',
          '@quajs/native-ui-compiler': 'workspace:*',
        },
        devDependencies: {
          '@quajs/engine-native': 'workspace:*',
        },
      }))

      expect(collectForbiddenTargetCoreManifestDependencyViolations([manifestPath])).toEqual([
        `${manifestPath} dependencies: @quajs/renderer-web`,
        `${manifestPath} devDependencies: @quajs/engine-native`,
      ])
    }
    finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
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
