import { describe, expect, it, vi } from 'vitest'
import {
  createHost,
  getNativeQuickJsNamespaceSummary,
  getNativeQuickJsPackageNamespaceSummary,
  releaseNativeQuickJsModuleNamespace,
  releaseNativeQuickJsPackageNamespaces,
} from './helpers'

describe('@quajs/engine-native runtime module loader namespace cleanup', () => {
  it('releases host QuickJS module namespaces without treating handles as engine modules', async () => {
    const namespaceRecord = {
      id: 'quickjs:module:1',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
      kind: 'script' as const,
      moduleBytes: 3,
      codeBytes: 36,
      revision: 1,
    }
    const summary = {
      namespaceCount: 1,
      packageCount: 1,
      moduleBytes: 3,
      codeBytes: 36,
      totalBytes: 39,
    }
    const host = {
      ...createHost(),
      releaseQuickJsModuleNamespace: vi.fn(async () => namespaceRecord),
      releaseQuickJsPackageNamespaces: vi.fn(async () => [namespaceRecord]),
      getQuickJsNamespaceSummary: vi.fn(async () => summary),
      getQuickJsPackageNamespaceSummary: vi.fn(async () => summary),
    }

    await expect(releaseNativeQuickJsModuleNamespace(host, 'quickjs:module:1')).resolves.toEqual(namespaceRecord)
    await expect(releaseNativeQuickJsPackageNamespaces(host, 'runtime.chapter.native-ui')).resolves.toEqual([namespaceRecord])
    await expect(getNativeQuickJsNamespaceSummary(host)).resolves.toEqual(summary)
    await expect(getNativeQuickJsPackageNamespaceSummary(host, 'runtime.chapter.native-ui')).resolves.toEqual(summary)

    expect(host.releaseQuickJsModuleNamespace).toHaveBeenCalledWith('quickjs:module:1')
    expect(host.releaseQuickJsPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(host.getQuickJsPackageNamespaceSummary).toHaveBeenCalledWith('runtime.chapter.native-ui')

    await expect(releaseNativeQuickJsModuleNamespace(createHost(), 'quickjs:missing')).resolves.toBeUndefined()
    await expect(releaseNativeQuickJsPackageNamespaces(createHost(), 'runtime.chapter.native-ui')).resolves.toEqual([])
    await expect(getNativeQuickJsNamespaceSummary(createHost())).resolves.toBeUndefined()
  })
})
