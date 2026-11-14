import { arch, platform } from 'node:process'

export type QuaSceneTarget = 'cocos' | 'godot' | 'unity'

/** Declaration of implementation bounds, not fabricated SDK/runtime test evidence. */
export function createQuaHostCompatibility(target: QuaSceneTarget, configuredVersion?: string) {
  const sdk = target === 'cocos'
    ? { name: 'Cocos Creator', minimum: '3.8.8', maximumExclusive: '3.8.9', series: '3.8.8', configuredVersion: configuredVersion || '3.8.8' }
    : target === 'godot'
      ? { name: 'Godot', minimum: '4.7.0', maximumExclusive: '4.8.0', series: '4.7.x', configuredVersion: configuredVersion || '4.7' }
      : { name: 'Unity', minimum: '6000.3.0f1', maximumExclusive: '6000.4.0a1', series: '6000.3.x LTS', configuredVersion }
  return {
    schemaVersion: 1,
    target,
    sdk,
    host: { platform, arch },
    runtime: target === 'cocos' ? 'Creator JSB / JavaScript' : 'QuickJS',
    runtimePackages: 'build-time-static-only',
    // Exporting source/binaries does not execute the target SDK.
    sdkRuntimeValidation: 'required-on-consumer-host',
    embedding: { ownsApplicationExit: false, standaloneOwnsApplicationExit: target !== 'unity', namespaceStorage: true, scopedContainer: true },
  }
}
