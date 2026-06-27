import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectForbiddenTargetCoreManifestDependencyViolations,
  collectForbiddenTargetCoreImportViolations,
  importSpecifiers,
} from '../../ui-compiler/test/target-isolation-helpers'

describe('@quajs/native-benchmarks target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from benchmark tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ]
    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })

  it('does not depend on Web, Cocos, or native bootstrap core packages from benchmark tooling', () => {
    expect(collectForbiddenTargetCoreManifestDependencyViolations([
      fileURLToPath(new URL('../package.json', import.meta.url)),
    ])).toEqual([])
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
