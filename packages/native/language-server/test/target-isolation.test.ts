import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectForbiddenTargetCoreImportViolations,
  collectForbiddenTargetCoreManifestDependencyViolations,
} from '../../ui-compiler/test/target-isolation-helpers'

describe('@quajs/native-language-server target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from LSP tooling', () => {
    const roots = [
      fileURLToPath(new URL('..', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })

  it('does not depend on Web, Cocos, or native bootstrap core packages from LSP tooling', () => {
    expect(collectForbiddenTargetCoreManifestDependencyViolations([
      fileURLToPath(new URL('../package.json', import.meta.url)),
    ])).toEqual([])
  })
})
