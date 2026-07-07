import { describe, expect, it } from 'vitest'
import {
  createNativeHostApiFromBridge,
  createNativeQuickJsEvaluationRequest,
  createNativeRendererIntent,
} from '../../src'
import { createHostInfo } from './helpers'

describe('native host bridge adapter contracts', () => {
  it('adapts host bridge dispatchers to the QuaNativeHostApi shape', async () => {
    const requests: unknown[] = []
    const namespaceRecord = {
      id: 'quickjs:module:1',
      packageId: 'runtime.chapter.native-ui',
      bundleName: 'runtime.chapter.native-ui',
      assetName: 'scripts/opening.js',
      kind: 'script',
      moduleBytes: 3,
      codeBytes: 36,
      revision: 1,
    } as const
    const namespaceSummary = {
      namespaceCount: 1,
      packageCount: 1,
      moduleBytes: 3,
      codeBytes: 36,
      totalBytes: 39,
    } as const
    const host = createNativeHostApiFromBridge(async (request) => {
      requests.push(request)
      switch (request.method) {
        case 'getHostInfo':
          return {
            ok: true,
            payload: {
              type: 'hostInfo',
              value: createHostInfo(),
            },
          }
        case 'readAssetBytes':
          return { ok: true, payload: { type: 'assetBytes', value: [1, 2, 3] } }
        case 'readStorage':
          return { ok: true, payload: { type: 'storageBytes', value: [4, 5, 6] } }
        case 'writeStorage':
        case 'deleteStorage':
        case 'emitRendererIntent':
          return { ok: true }
        case 'listStorageKeys':
          return { ok: true, payload: { type: 'storageKeys', value: ['profile/save-1'] } }
        case 'hashBytes':
          return { ok: true, payload: { type: 'hash', value: 'sha256:test' } }
        case 'verifySignature':
          return { ok: true, payload: { type: 'signatureValid', value: true } }
        case 'evaluateQuickJsModule':
          return {
            ok: true,
            payload: {
              type: 'quickJsEvaluation',
              value: {
                ok: true,
                moduleNamespaceId: `${request.params.module.packageId}:${request.params.module.assetName}`,
              },
            },
          }
        case 'callQuickJsModuleExport':
          return {
            ok: true,
            payload: {
              type: 'quickJsExportCall',
              value: {
                ok: true,
                valueJson: JSON.stringify({
                  namespace: request.params.moduleNamespaceId,
                  exportName: request.params.exportName,
                  args: JSON.parse(request.params.argsJson || '[]'),
                }),
              },
            },
          }
        case 'callQuickJsGameStepFactory':
          return {
            ok: true,
            payload: {
              type: 'quickJsGameStepFactoryCall',
              value: {
                ok: true,
                steps: [{
                  uuid: 'intro.1',
                  runHandleId: `${request.params.moduleNamespaceId}:run:1`,
                  metadataJson: JSON.stringify({
                    exportName: request.params.exportName,
                    scope: JSON.parse(request.params.scopeJson || '{}'),
                  }),
                }],
              },
            },
          }
        case 'callQuickJsGameStepRun':
          return {
            ok: true,
            payload: {
              type: 'quickJsGameStepRun',
              value: {
                ok: true,
              },
            },
          }
        case 'releaseQuickJsModuleNamespace':
          return {
            ok: true,
            payload: {
              type: 'quickJsNamespace',
              value: request.params.moduleNamespaceId === 'missing'
                ? null
                : {
                    ...namespaceRecord,
                    id: request.params.moduleNamespaceId,
                  },
            },
          }
        case 'releaseQuickJsPackageNamespaces':
          return {
            ok: true,
            payload: {
              type: 'quickJsNamespaces',
              value: [namespaceRecord],
            },
          }
        case 'getQuickJsNamespaceSummary':
          return {
            ok: true,
            payload: {
              type: 'quickJsNamespaceSummary',
              value: namespaceSummary,
            },
          }
        case 'getQuickJsPackageNamespaceSummary':
          return {
            ok: true,
            payload: {
              type: 'quickJsNamespaceSummary',
              value: request.params.packageId === namespaceRecord.packageId
                ? namespaceSummary
                : {
                    namespaceCount: 0,
                    packageCount: 0,
                    moduleBytes: 0,
                    codeBytes: 0,
                    totalBytes: 0,
                  },
            },
          }
        case 'listMountedBundles':
          return { ok: true, payload: { type: 'mountedBundles', value: [{ name: 'base' }] } }
      }
    })

    await expect(host.getHostInfo()).resolves.toEqual(createHostInfo())
    await expect(host.readAssetBytes({ url: 'images/bg.png' })).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await expect(host.readStorage('profile/save-1')).resolves.toEqual(new Uint8Array([4, 5, 6]))
    await expect(host.writeStorage('profile/save-1', new Uint8Array([7, 8]))).resolves.toBeUndefined()
    await expect(host.deleteStorage('profile/save-1')).resolves.toBeUndefined()
    await expect(host.listStorageKeys?.('profile/')).resolves.toEqual(['profile/save-1'])
    await expect(host.hashBytes(new Uint8Array([1]), 'sha256')).resolves.toBe('sha256:test')
    await expect(host.verifySignature?.({
      bytes: new Uint8Array([1]),
      signature: new Uint8Array([2]),
      algorithm: 'ed25519',
    })).resolves.toBe(true)
    await expect(host.evaluateQuickJsModule?.(createNativeQuickJsEvaluationRequest({
      assetName: 'scripts/opening.js',
      bundleName: 'runtime.chapter.native-ui',
      bytes: new Uint8Array([1, 2, 3]),
      code: 'export default function opening() {}',
      kind: 'script',
      packageId: 'runtime.chapter.native-ui',
    }))).resolves.toEqual({
      ok: true,
      moduleNamespaceId: 'runtime.chapter.native-ui:scripts/opening.js',
    })
    await expect(host.callQuickJsModuleExport?.({
      moduleNamespaceId: 'quickjs:module:1',
      exportName: 'default',
      argsJson: '[{"scene":"opening"}]',
    })).resolves.toEqual({
      ok: true,
      valueJson: '{"namespace":"quickjs:module:1","exportName":"default","args":[{"scene":"opening"}]}',
    })
    await expect(host.callQuickJsGameStepFactory?.({
      moduleNamespaceId: 'quickjs:module:1',
      exportName: 'default',
      scopeJson: '{"title":"Opening"}',
    })).resolves.toEqual({
      ok: true,
      steps: [{
        uuid: 'intro.1',
        runHandleId: 'quickjs:module:1:run:1',
        metadataJson: '{"exportName":"default","scope":{"title":"Opening"}}',
      }],
    })
    await expect(host.callQuickJsGameStepRun?.({
      runHandleId: 'quickjs:module:1:run:1',
      ctxJson: '{"stepId":"intro.1"}',
    })).resolves.toEqual({
      ok: true,
    })
    await expect(host.releaseQuickJsModuleNamespace?.('quickjs:module:1')).resolves.toEqual(namespaceRecord)
    await expect(host.releaseQuickJsModuleNamespace?.('missing')).resolves.toBeUndefined()
    await expect(host.releaseQuickJsPackageNamespaces?.('runtime.chapter.native-ui')).resolves.toEqual([namespaceRecord])
    await expect(host.getQuickJsNamespaceSummary?.()).resolves.toEqual(namespaceSummary)
    await expect(host.getQuickJsPackageNamespaceSummary?.('runtime.chapter.native-ui')).resolves.toEqual(namespaceSummary)
    await expect(host.getQuickJsPackageNamespaceSummary?.('runtime.other')).resolves.toEqual({
      namespaceCount: 0,
      packageCount: 0,
      moduleBytes: 0,
      codeBytes: 0,
      totalBytes: 0,
    })
    await expect(host.listMountedBundles?.()).resolves.toEqual([{ name: 'base' }])
    host.emitRendererIntent?.(createNativeRendererIntent({ type: 'ui/intent', payload: { action: 'close' } }))

    expect(requests).toEqual(expect.arrayContaining([
      { method: 'readAssetBytes', params: { url: 'images/bg.png' } },
      { method: 'writeStorage', params: { key: 'profile/save-1', value: [7, 8] } },
      expect.objectContaining({ method: 'evaluateQuickJsModule' }),
      {
        method: 'callQuickJsModuleExport',
        params: {
          moduleNamespaceId: 'quickjs:module:1',
          exportName: 'default',
          argsJson: '[{"scene":"opening"}]',
        },
      },
      {
        method: 'callQuickJsGameStepFactory',
        params: {
          moduleNamespaceId: 'quickjs:module:1',
          exportName: 'default',
          scopeJson: '{"title":"Opening"}',
        },
      },
      {
        method: 'callQuickJsGameStepRun',
        params: {
          runHandleId: 'quickjs:module:1:run:1',
          ctxJson: '{"stepId":"intro.1"}',
        },
      },
      { method: 'releaseQuickJsModuleNamespace', params: { moduleNamespaceId: 'quickjs:module:1' } },
      { method: 'releaseQuickJsPackageNamespaces', params: { packageId: 'runtime.chapter.native-ui' } },
      { method: 'getQuickJsNamespaceSummary' },
      { method: 'getQuickJsPackageNamespaceSummary', params: { packageId: 'runtime.chapter.native-ui' } },
      { method: 'emitRendererIntent', params: { type: 'ui/intent', payloadJson: '{"action":"close"}' } },
    ]))
  })

  it('turns host bridge error responses into thrown errors', async () => {
    const host = createNativeHostApiFromBridge(async () => ({
      ok: false,
      error: {
        code: 'assetNotFound',
        message: 'Native asset "missing.png" was not found.',
        assetUrl: 'missing.png',
      },
    }))

    await expect(host.readAssetBytes({ url: 'missing.png' }))
      .rejects.toThrow('Native asset "missing.png" was not found.')
  })
})
