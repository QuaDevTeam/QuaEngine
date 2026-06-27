import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectForbiddenTargetCoreImportViolations } from '../../ui-compiler/test/target-isolation-helpers'

describe('qua-native-authoring VSCode extension target isolation', () => {
  it('does not import Web, Cocos, or native runtime bootstrap packages from extension tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      fileURLToPath(new URL('../vite.server.config.ts', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })
})
