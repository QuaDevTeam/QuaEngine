import { describe, expect, it } from 'vitest'
import {
  createNativeProductBridgeFromBridge,
  createNativeProductBridgeProjectionFrameRequest,
  createNativeRendererIntent,
} from '../../src'
import { createHostInfo } from './helpers'

describe('native product bridge adapter contracts', () => {
  it('adapts product bridge dispatchers to a typed product runtime facade', async () => {
    const requests: unknown[] = []
    const rendererIntents = [
      createNativeRendererIntent({ type: 'ui/intent', payload: { action: 'open' } }),
    ]
    const bridge = createNativeProductBridgeFromBridge(async (request) => {
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
        case 'renderProjectionFrame':
          return {
            ok: true,
            payload: {
              type: 'projectionFrame',
              value: {
                frameNumber: 2,
                renderedFrameCount: 2,
                revision: 7,
                passCount: 3,
                batchCount: 4,
                commandCount: 5,
                resourceCount: 6,
                missingResourceCount: 0,
                textureUploadPendingRequestCount: 1,
                textureUploadUploadedCount: 1,
                textureUploadErrorCount: 0,
                textureUploadResubmitCount: 1,
                resubmittedAfterTextureUpload: true,
                textureLifecycleInitialSync: false,
                textureLifecycleTrackedPackageCount: 1,
                textureLifecycleReleasedPackageCount: 0,
                rendererIntents,
              },
            },
          }
        case 'tickLifecycle':
          return {
            ok: true,
            payload: {
              type: 'lifecycleTick',
              value: {
                renderedFrameCount: 2,
                initialSync: false,
                observedBundleCount: 1,
                currentPackageIds: ['runtime.chapter'],
                removedPackageIds: [],
                releasedPackageIds: [],
                trackedPackageIds: ['runtime.chapter'],
                releaseAttemptCount: 0,
                releasedResourceCount: 0,
                textureCleanupErrorCount: 0,
                rendererIntents,
              },
            },
          }
        case 'drainRendererIntents':
          return {
            ok: true,
            payload: {
              type: 'rendererIntents',
              value: rendererIntents,
            },
          }
        case 'shutdown':
          return {
            ok: true,
            payload: {
              type: 'shutdown',
              value: {
                renderedFrameCount: 2,
                releasedResourceCount: 3,
                hostCleanupCount: 3,
                textureCleanupReleasedCount: 2,
                textureCleanupErrorCount: 0,
                rendererIntents: [],
              },
            },
          }
      }
    })

    await expect(bridge.getHostInfo()).resolves.toEqual(createHostInfo())
    await expect(bridge.renderProjectionFrame('{"view":{}}')).resolves.toMatchObject({
      frameNumber: 2,
      renderedFrameCount: 2,
      rendererIntents,
    })
    await expect(bridge.renderProjectionFrame({ view: {} })).resolves.toMatchObject({
      revision: 7,
      resubmittedAfterTextureUpload: true,
    })
    await expect(bridge.renderProjectionFrame({ frameJson: '{"view":{}}' })).resolves.toMatchObject({
      commandCount: 5,
    })
    await expect(bridge.tickLifecycle()).resolves.toMatchObject({
      renderedFrameCount: 2,
      trackedPackageIds: ['runtime.chapter'],
      rendererIntents,
    })
    await expect(bridge.drainRendererIntents()).resolves.toEqual(rendererIntents)
    await expect(bridge.shutdown()).resolves.toMatchObject({
      releasedResourceCount: 3,
      rendererIntents: [],
    })

    expect(requests).toEqual(expect.arrayContaining([
      { method: 'getHostInfo' },
      { method: 'renderProjectionFrame', params: { frameJson: '{"view":{}}' } },
      { method: 'renderProjectionFrame', params: { frame: { view: {} } } },
      { method: 'tickLifecycle' },
      { method: 'drainRendererIntents' },
      { method: 'shutdown' },
    ]))
  })

  it('turns product bridge error responses into thrown errors', async () => {
    const bridge = createNativeProductBridgeFromBridge(async () => ({
      ok: false,
      error: {
        code: 'invalidRequest',
        message: 'Native product bridge projection frame failed.',
      },
    }))

    await expect(bridge.renderProjectionFrame('{"view":{}}'))
      .rejects.toThrow('Native product bridge projection frame failed.')
  })

  it('normalizes projection frame request inputs without stringifying frame objects', () => {
    expect(createNativeProductBridgeProjectionFrameRequest('{"view":{}}'))
      .toEqual({ frameJson: '{"view":{}}' })
    expect(createNativeProductBridgeProjectionFrameRequest({ view: {} }))
      .toEqual({ frame: { view: {} } })
    expect(createNativeProductBridgeProjectionFrameRequest({ frameJson: '{"view":{}}' }))
      .toEqual({ frameJson: '{"view":{}}' })
  })
})
