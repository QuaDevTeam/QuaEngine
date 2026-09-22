import { describe, expect, it, vi } from 'vitest'
import {
  createHost,
  getNativeJscNamespaceSummary,
  getNativeJscPackageNamespaceSummary,
  releaseNativeJscModuleNamespace,
  releaseNativeJscPackageNamespaces,
} from './helpers'

describe('@quajs/engine-native runtime module loader namespace cleanup', () => {
  it('releases host JavaScriptCore module namespaces without treating handles as engine modules', async () => {
    const namespaceRecord = {
      id: 'jsc:module:1',
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
      releaseJscModuleNamespace: vi.fn(async () => namespaceRecord),
      releaseJscPackageNamespaces: vi.fn(async () => [namespaceRecord]),
      getJscNamespaceSummary: vi.fn(async () => summary),
      getJscPackageNamespaceSummary: vi.fn(async () => summary),
    }

    await expect(releaseNativeJscModuleNamespace(host, 'jsc:module:1')).resolves.toEqual(namespaceRecord)
    await expect(releaseNativeJscPackageNamespaces(host, 'runtime.chapter.native-ui')).resolves.toEqual([namespaceRecord])
    await expect(getNativeJscNamespaceSummary(host)).resolves.toEqual(summary)
    await expect(getNativeJscPackageNamespaceSummary(host, 'runtime.chapter.native-ui')).resolves.toEqual(summary)

    expect(host.releaseJscModuleNamespace).toHaveBeenCalledWith('jsc:module:1')
    expect(host.releaseJscPackageNamespaces).toHaveBeenCalledWith('runtime.chapter.native-ui')
    expect(host.getJscPackageNamespaceSummary).toHaveBeenCalledWith('runtime.chapter.native-ui')

    await expect(releaseNativeJscModuleNamespace(createHost(), 'jsc:missing')).resolves.toBeUndefined()
    await expect(releaseNativeJscPackageNamespaces(createHost(), 'runtime.chapter.native-ui')).resolves.toEqual([])
    await expect(getNativeJscNamespaceSummary(createHost())).resolves.toBeUndefined()
  })
})
