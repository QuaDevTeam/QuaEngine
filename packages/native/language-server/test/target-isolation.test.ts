import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectForbiddenTargetCoreImportViolations } from '../../ui-compiler/test/target-isolation-helpers'

describe('@quajs/native-language-server target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from LSP tooling', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })
})
