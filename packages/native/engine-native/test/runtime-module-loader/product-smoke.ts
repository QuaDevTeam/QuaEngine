import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createHost,
  createNativeRendererJsonFrameInput,
  createNativeRuntimeAdapters,
} from './helpers'

describe('@quajs/engine-native runtime product smoke', () => {
  afterEach(() => {
    QuaEngine.resetInstance()
  })

  it('loads a runtime QPK QuickJS GameStep and packages the engine projection for native rendering', async () => {
    const storyCode = 'import { marker } from "./shared.js"; export default function nativeStory() { return marker }'
    const sharedCode = 'export const marker = "native-qpk"'
    const manifest = createRuntimeBundleManifest({
      id: 'runtime.native.story',
      version: '1.0.0',
      priority: 7,
      scripts: [{
        id: 'runtime.native.story',
        version: '1.0.0',
        assetName: 'story.js',
        metadata: {
          nativeQuickJs: {
            imports: ['shared.js'],
          },
        },
      }],
      metadata: {
        nativeRenderer: {
          packageName: '@quajs/native-renderer',
          versionRange: '>=0.1.0',
          capabilityIds: ['native-wgpu.input.pointer@1'],
          intentEvents: ['choice/select'],
          nativeCode: false,
        },
      },
      integrity: { hash: 'native-story-hash', algorithm: 'sha256' },
      signature: { value: 'signed', algorithm: 'ed25519' },
    })
    const qpk = createQpkBundle(manifest, new Map([
      ['assets/scripts/story.js', utf8(storyCode)],
      ['assets/scripts/shared.js', utf8(sharedCode)],
    ]))
    const host = {
      ...createHost(),
      verifySignature: vi.fn(async () => true),
      evaluateQuickJsModule: vi.fn(async request => ({
        ok: true,
        moduleNamespaceId: `${request.module.packageId}:${request.module.assetName}:quickjs`,
      })),
      callQuickJsGameStepFactory: vi.fn(async request => ({
        ok: true,
        steps: [{
          uuid: 'runtime.native.story.step.1',
          runHandleId: `${request.moduleNamespaceId}:run:1`,
          metadataJson: JSON.stringify({
            point: { nodeId: 'native-start' },
          }),
        }],
      })),
      callQuickJsGameStepRun: vi.fn(async () => ({
        ok: true,
        commands: [{
          target: 'engine' as const,
          method: 'showDialogue' as const,
          argsJson: '[{"text":"Native line","mode":"narration"}]',
        }, {
          target: 'engine' as const,
          method: 'showChoices' as const,
          argsJson: '[[{"id":"stay","text":"Stay"},{"id":"leave","text":"Leave","enabled":false}]]',
        }],
      })),
      resumeQuickJsGameStepRun: vi.fn(async () => ({ ok: true })),
    }
    const adapters = createNativeRuntimeAdapters(host, { requireSignature: true })
    const engine = new QuaEngine({
      assets: {
        endpoint: 'https://cdn.example.com',
        adapter: createMemoryAdapter({
          'https://cdn.example.com/native-story.qpk': qpk,
        }, 'native-story-hash'),
      },
      runtimeModuleLoader: adapters.runtimeModuleLoader,
      trustPolicy: adapters.trustPolicy,
    })

    await engine.init()
    const state = await engine.loadRuntimePackage('native-story.qpk')
    await engine.runScriptModule('runtime.native.story')

    expect(state).toEqual(expect.objectContaining({
      id: 'runtime.native.story',
      state: 'active',
      priority: 7,
    }))
    expect(host.verifySignature).toHaveBeenCalledWith(expect.objectContaining({
      algorithm: 'ed25519',
      keyId: undefined,
    }))
    expect(host.evaluateQuickJsModule).toHaveBeenCalledWith(expect.objectContaining({
      module: expect.objectContaining({
        assetName: 'story.js',
        bundleName: 'runtime.native.story',
        code: storyCode,
        packageId: 'runtime.native.story',
      }),
      moduleGraph: [{
        assetName: 'shared.js',
        bundleName: 'runtime.native.story',
        packageId: 'runtime.native.story',
        kind: 'script',
        code: sharedCode,
        bytes: Array.from(utf8(sharedCode)),
      }],
    }))
    expect(host.callQuickJsGameStepFactory).toHaveBeenCalledWith({
      moduleNamespaceId: 'runtime.native.story:story.js:quickjs',
      exportName: 'default',
    })
    expect(engine.getViewState().dialogue).toEqual(expect.objectContaining({
      visible: true,
      text: 'Native line',
      mode: 'narration',
    }))
    expect(engine.getViewState().choices).toEqual([
      expect.objectContaining({ id: 'stay', text: 'Stay', enabled: true }),
      expect.objectContaining({ id: 'leave', text: 'Leave', enabled: false }),
    ])
    expect(engine.getStoryPoint()).toEqual(expect.objectContaining({
      stepId: 'runtime.native.story.step.1',
      contentPackageId: 'runtime.native.story',
      scriptModuleId: 'runtime.native.story',
      scriptModuleVersion: '1.0.0',
    }))

    const frame = createNativeRendererJsonFrameInput(engine.getViewState(), {
      container: { width: 1600, height: 1000, devicePixelRatio: 1 },
    })

    expect(frame.layout).toEqual(engine.getViewState().layout)
    expect(frame.view.dialogue).toEqual(expect.objectContaining({
      visible: true,
      text: 'Native line',
      mode: 'narration',
      provenance: {
        contentPackageId: 'runtime.native.story',
      },
    }))
    expect(frame.view.choices).toEqual({
      visible: true,
      choices: [{
        id: 'stay',
        text: 'Stay',
        enabled: true,
        provenance: {
          contentPackageId: 'runtime.native.story',
        },
      }, {
        id: 'leave',
        text: 'Leave',
        enabled: false,
        provenance: {
          contentPackageId: 'runtime.native.story',
        },
      }],
      provenance: {
        contentPackageId: 'runtime.native.story',
      },
    })
    expect(frame.view.ui).toEqual({
      visible: true,
      overlays: [],
    })
    expect(frame.view.audio).toBeUndefined()
    expect(JSON.parse(JSON.stringify(frame))).toEqual(expect.objectContaining({
      view: expect.any(Object),
    }))
  })
})

function createMemoryAdapter(files: Record<string, Uint8Array> = {}, hash = '') {
  const fileMap = new Map(Object.entries(files))
  return {
    name: 'engine-native-product-smoke-memory',
    storage: new MemoryAssetStorage(),
    fetcher: {
      async fetchBytes(url: string) {
        const data = fileMap.get(url) || fileMap.get(url.replace(/^\/+/, ''))
        if (!data) {
          throw new Error(`No native product smoke asset file registered: ${url}`)
        }
        return { data: new Uint8Array(data), size: data.byteLength }
      },
    },
    crypto: {
      async sha256() {
        return hash
      },
    },
  }
}

function createRuntimeBundleManifest(runtimePackage: Record<string, any>) {
  const integrity = {
    ...(runtimePackage.integrity || {}),
    algorithm: runtimePackage.integrity?.algorithm || 'sha256',
    hash: runtimePackage.integrity?.hash || `merkle:${runtimePackage.id}:${runtimePackage.version}`,
  }
  const runtimePackageWithIntegrity = {
    ...runtimePackage,
    integrity,
  }

  return {
    name: runtimePackageWithIntegrity.id,
    version: runtimePackageWithIntegrity.version,
    bundler: '@quajs/quack',
    created: new Date(0).toISOString(),
    createdAt: 0,
    format: 'qpk',
    bundleVersion: 1,
    buildNumber: 'engine-native-product-smoke',
    compression: { algorithm: 'none' },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {
      scripts: Object.fromEntries(
        collectScriptAssetNames(runtimePackage).map(assetName => [assetName, createScriptAssetInfo(assetName)]),
      ),
    },
    totalFiles: 0,
    totalSize: 0,
    merkleRoot: integrity.hash,
    compatibility: runtimePackageWithIntegrity.compatibility,
    runtimePackage: runtimePackageWithIntegrity,
  }
}

function collectScriptAssetNames(runtimePackage: Record<string, any>): string[] {
  const assetNames = new Set<string>()
  for (const script of runtimePackage.scripts || []) {
    if (typeof script.assetName === 'string') {
      assetNames.add(script.assetName)
    }
    const imports = script.metadata?.nativeQuickJs?.imports
    if (Array.isArray(imports)) {
      for (const entry of imports) {
        const assetName = typeof entry === 'string'
          ? entry
          : entry?.assetName || entry?.module || entry?.path || entry?.relativePath
        if (typeof assetName === 'string') {
          assetNames.add(assetName)
        }
      }
    }
  }
  return [...assetNames]
}

function createScriptAssetInfo(name: string) {
  return {
    name,
    path: `scripts/${name}`,
    relativePath: `scripts/${name}`,
    size: 0,
    hash: '',
    type: 'scripts' as const,
    locales: ['default'],
    mimeType: 'text/javascript',
  }
}

function createQpkBundle(manifest: Record<string, unknown>, files: Map<string, Uint8Array>): Uint8Array {
  const entries = Array.from(files.entries()).map(([path, data]) => {
    const pathBytes = utf8(path)
    const entry = new Uint8Array(4 + pathBytes.byteLength + 4 + data.byteLength)
    const view = new DataView(entry.buffer)
    view.setUint32(0, pathBytes.byteLength, true)
    entry.set(pathBytes, 4)
    view.setUint32(4 + pathBytes.byteLength, data.byteLength, true)
    entry.set(data, 4 + pathBytes.byteLength + 4)
    return entry
  })
  const dataSection = concatBytes(entries)
  const manifestBytes = utf8(JSON.stringify(manifest))
  const headerSize = 32
  const bytes = new Uint8Array(headerSize + dataSection.byteLength + manifestBytes.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x51504B00, false)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(12, headerSize, true)
  setUint64LE(view, 16, headerSize + dataSection.byteLength)
  setUint64LE(view, 24, manifestBytes.byteLength)
  bytes.set(dataSection, headerSize)
  bytes.set(manifestBytes, headerSize + dataSection.byteLength)
  return bytes
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function setUint64LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true)
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
