import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectForbiddenTargetCoreImportViolations,
  collectForbiddenTargetCoreManifestDependencyViolations,
} from '../../ui-compiler/test/target-isolation-helpers'

describe('qua-native-authoring VSCode extension target isolation', () => {
  it('does not import Web, Cocos, or native runtime bootstrap packages from extension tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      fileURLToPath(new URL('../vite.server.config.ts', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })

  it('does not depend on Web, Cocos, or native runtime bootstrap packages from extension tooling', () => {
    expect(collectForbiddenTargetCoreManifestDependencyViolations([
      fileURLToPath(new URL('../package.json', import.meta.url)),
    ])).toEqual([])
  })
})
