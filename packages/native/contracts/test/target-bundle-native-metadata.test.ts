import type { TargetBundleManifest } from '../src'
import { describe, expect, it } from 'vitest'
import {
  createTargetBundleNativeRendererInfo,
  createTargetBundleNativeRuntimeInfo,
  validateTargetBundleManifest,
} from '../src'
import {
  NATIVE_RENDERER_CAPABILITIES,
  nativeRendererInfo,
  nativeRuntimeInfo,
  sha256Fixture,
  targetBundleManifest,
  targetBundleManifestFor,
} from './target-bundle-fixtures'

describe('target bundle native metadata validation', () => {
  it('creates native renderer manifest metadata from renderer capabilities', () => {
    const renderer = nativeRendererInfo()
    const changedRenderer = createTargetBundleNativeRendererInfo({
      version: '0.1.0',
      capabilities: [
        ...NATIVE_RENDERER_CAPABILITIES,
        {
          id: 'native-wgpu.video@1',
          target: 'native',
          version: '1.0.0',
          ownerPackage: '@quajs/native-renderer',
          projectionKeys: ['background.video'],
          assetKinds: ['video', 'images'],
          fallback: 'warn-once',
        },
      ],
    }, sha256Fixture)

    expect(renderer).toEqual({
      packageName: '@quajs/native-renderer',
      version: '0.1.0',
      backend: 'wgpu',
      backendVersion: 'wgpu-0.20',
      capabilityIds: [
        'native-wgpu.stage-layout@1',
        'native-wgpu.ui.surface@1',
        'native-wgpu.input.pointer@1',
      ],
      capabilityManifestHash: expect.stringMatching(/^sha256:fixture-/),
    })
    expect(changedRenderer.capabilityIds).toContain('native-wgpu.video@1')
    expect(changedRenderer.capabilityManifestHash).not.toBe(renderer.capabilityManifestHash)
  })

  it('creates native runtime manifest metadata from host runtime info', () => {
    expect(nativeRuntimeInfo()).toEqual({
      quickjsVersion: '2025-04-26',
      nativeRuntimeVersion: '0.1.0',
      assetAdapterVersion: '0.1.0',
      storeAdapterVersion: '0.1.0',
    })
    expect(createTargetBundleNativeRuntimeInfo({
      quickjsVersion: 'unsupported',
      nativeRuntimeVersion: '0.2.0',
      assetAdapterVersion: '0.3.0',
      storeAdapterVersion: '0.4.0',
    })).toEqual({
      quickjsVersion: 'unsupported',
      nativeRuntimeVersion: '0.2.0',
      assetAdapterVersion: '0.3.0',
      storeAdapterVersion: '0.4.0',
    })
  })

  it('requires native artifacts to record renderer version and capability metadata', () => {
    const manifest = targetBundleManifest()
    delete manifest.nativeRenderer
    const result = validateTargetBundleManifest(manifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_MISSING',
        target: 'native',
      }),
    ]))
  })

  it('requires native artifacts to record native runtime, QuickJS, asset adapter, and store adapter metadata', () => {
    const manifest = targetBundleManifest()
    delete manifest.nativeRuntime
    const result = validateTargetBundleManifest(manifest)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_MISSING',
        target: 'native',
      }),
    ]))
  })

  it('rejects incomplete native renderer metadata on native artifacts', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      nativeRenderer: {
        packageName: '@quajs/renderer-web',
        backend: 'canvas',
        capabilityIds: [],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_PACKAGE_MISMATCH',
        packageName: '@quajs/renderer-web',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_BACKEND_MISMATCH',
        backend: 'canvas',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_VERSION_MISSING',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_MANIFEST_HASH_MISSING',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RENDERER_CAPABILITY_IDS_MISSING',
      }),
    ]))
  })

  it('rejects incomplete native runtime metadata on native artifacts', () => {
    const result = validateTargetBundleManifest(targetBundleManifest({
      nativeRuntime: {
        quickjsVersion: '',
        nativeRuntimeVersion: 42,
      } as unknown as NonNullable<TargetBundleManifest['nativeRuntime']>,
    }))

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_EMPTY',
        field: 'quickjsVersion',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_INVALID',
        field: 'nativeRuntimeVersion',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_MISSING',
        field: 'assetAdapterVersion',
      }),
      expect.objectContaining({
        code: 'TARGET_BUNDLE_NATIVE_RUNTIME_FIELD_MISSING',
        field: 'storeAdapterVersion',
      }),
    ]))
  })

  it('rejects native renderer metadata in Web and Cocos artifacts', () => {
    for (const target of ['web', 'cocos'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        nativeRenderer: nativeRendererInfo(),
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_NATIVE_RENDERER_UNEXPECTED',
          target,
        }),
      ]))
    }
  })

  it('rejects native runtime metadata in Web and Cocos artifacts', () => {
    for (const target of ['web', 'cocos'] as const) {
      const result = validateTargetBundleManifest(targetBundleManifestFor(target, {
        nativeRuntime: nativeRuntimeInfo(),
      }))

      expect(result.ok).toBe(false)
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_BUNDLE_NATIVE_RUNTIME_UNEXPECTED',
          target,
        }),
      ]))
    }
  })

  it('requires native target bundle app metadata needed by release packaging', () => {
    const missingIcon = targetBundleManifest({
      app: {
        bundleId: 'dev.quajs.native.fixture',
        version: '1.0.0',
        buildNumber: '100',
      },
    })
    const emptyBuild = targetBundleManifest({
      app: {
        bundleId: 'dev.quajs.native.fixture',
        version: '1.0.0',
        buildNumber: '',
        icon: 'AppIcon.icns',
      },
    })

    const missingIconResult = validateTargetBundleManifest(missingIcon)
    const emptyBuildResult = validateTargetBundleManifest(emptyBuild)

    expect(missingIconResult.ok).toBe(false)
    expect(missingIconResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_APP_METADATA_MISSING',
        target: 'native',
        field: 'icon',
      }),
    ]))

    expect(emptyBuildResult.ok).toBe(false)
    expect(emptyBuildResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_APP_METADATA_EMPTY',
        target: 'native',
        field: 'buildNumber',
      }),
    ]))
  })

  it('requires native target bundle profile and platform metadata needed by packaging and startup', () => {
    const missingProfile = targetBundleManifest() as unknown as TargetBundleManifest & { profile?: unknown }
    delete missingProfile.profile
    const invalidProfile = {
      ...targetBundleManifest(),
      profile: 'staging',
    } as unknown as TargetBundleManifest
    const missingPlatform = targetBundleManifest()
    delete missingPlatform.platform
    const emptyPlatform = targetBundleManifest({ platform: ' ' })
    const invalidPlatform = targetBundleManifest({ platform: 'ios' })

    const missingProfileResult = validateTargetBundleManifest(missingProfile as TargetBundleManifest)
    const invalidProfileResult = validateTargetBundleManifest(invalidProfile)
    const missingPlatformResult = validateTargetBundleManifest(missingPlatform)
    const emptyPlatformResult = validateTargetBundleManifest(emptyPlatform)
    const invalidPlatformResult = validateTargetBundleManifest(invalidPlatform)

    expect(missingProfileResult.ok).toBe(false)
    expect(missingProfileResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROFILE_MISSING',
        target: 'native',
        field: 'profile',
      }),
    ]))

    expect(invalidProfileResult.ok).toBe(false)
    expect(invalidProfileResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PROFILE_INVALID',
        target: 'native',
        field: 'profile',
        value: 'staging',
      }),
    ]))

    expect(missingPlatformResult.ok).toBe(false)
    expect(missingPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_MISSING',
        target: 'native',
        field: 'platform',
      }),
    ]))

    expect(emptyPlatformResult.ok).toBe(false)
    expect(emptyPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_EMPTY',
        target: 'native',
        field: 'platform',
      }),
    ]))

    expect(invalidPlatformResult.ok).toBe(false)
    expect(invalidPlatformResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_BUNDLE_PLATFORM_INVALID',
        target: 'native',
        field: 'platform',
        value: 'ios',
      }),
    ]))
  })
})
