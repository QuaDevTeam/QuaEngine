import { describe, expect, it } from 'vitest'
import {
  assertNativeBenchmarkSmokeThresholds,
  NATIVE_BENCHMARK_SCHEMA_VERSION,
  runNativeAuthoringSmokeBenchmarks,
} from '../src'
import { runBenchmarkDefinition } from '../src/runner'

describe('@quajs/native-benchmarks', () => {
  it('emits deterministic native authoring smoke records', () => {
    const records = runNativeAuthoringSmokeBenchmarks({ iterations: 1 })

    expect(records.map(record => record.bench)).toEqual([
      'native.authoring.qui.parse_validate.smoke',
      'native.authoring.qss.parse_validate.smoke',
      'native.authoring.qss.resolve_style.smoke',
      'native.authoring.surface_projection.compile.smoke',
      'native.authoring.qui.format.smoke',
      'native.authoring.qss.format.smoke',
      'native.authoring.completion_hover.smoke',
      'native.authoring.asset_code_actions.smoke',
      'native.authoring.project_index.build.smoke',
      'native.authoring.project_index.incremental_update.smoke',
    ])
    expect(assertNativeBenchmarkSmokeThresholds(records)).toEqual([])

    for (const record of records) {
      expect(record.schemaVersion).toBe(NATIVE_BENCHMARK_SCHEMA_VERSION)
      expect(record.profile).toBe('smoke')
      expect(record.backend).toBe('typescript')
      expect(record.documentBytes).toBeGreaterThan(100)
      expect(record.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(record.iterations).toBe(1)
      expect(record.checksum).toBeGreaterThan(0)
    }

    expect(records.find(record => record.bench === 'native.authoring.qui.parse_validate.smoke')?.metrics)
      .toEqual(expect.objectContaining({
        actions: expect.any(Number),
        astComponents: expect.any(Number),
        astNodes: expect.any(Number),
        astSlots: expect.any(Number),
      }))
    expect(records.find(record => record.bench === 'native.authoring.qss.resolve_style.smoke')?.metrics)
      .toEqual(expect.objectContaining({
        resolvedDeclarations: expect.any(Number),
        resolvedRules: expect.any(Number),
        styleFields: expect.any(Number),
        zIndexes: expect.any(Number),
      }))
    const projectionMetrics = records.find(record => record.bench === 'native.authoring.surface_projection.compile.smoke')?.metrics
    expect(projectionMetrics)
      .toEqual(expect.objectContaining({
        assetKinds: expect.any(Number),
        compatibilityAssetKinds: expect.any(Number),
        compatibilityCapabilities: expect.any(Number),
        compatibilityNativeCodeFalse: expect.any(Number),
        compatibilityQssFeatures: expect.any(Number),
        compatibilityQuiComponents: expect.any(Number),
        intents: expect.any(Number),
        intentEvents: expect.any(Number),
        nodes: expect.any(Number),
        projectionFields: expect.any(Number),
        qssFeatures: expect.any(Number),
        quiComponents: expect.any(Number),
        styleFields: expect.any(Number),
        textNodes: expect.any(Number),
      }))
    expect(projectionMetrics?.assetKinds).toBeGreaterThan(0)
    expect(projectionMetrics?.compatibilityAssetKinds).toBeGreaterThan(0)
    expect(projectionMetrics?.compatibilityCapabilities).toBeGreaterThan(0)
    expect(projectionMetrics?.compatibilityNativeCodeFalse).toBe(1)
    expect(projectionMetrics?.compatibilityQssFeatures).toBeGreaterThan(0)
    expect(projectionMetrics?.compatibilityQuiComponents).toBeGreaterThan(0)
    expect(projectionMetrics?.intentEvents).toBeGreaterThan(0)
    expect(projectionMetrics?.projectionFields).toBeGreaterThan(0)
    expect(projectionMetrics?.qssFeatures).toBeGreaterThan(0)
    expect(projectionMetrics?.quiComponents).toBeGreaterThan(0)
    expect(records.find(record => record.bench === 'native.authoring.asset_code_actions.smoke')?.metrics)
      .toEqual(expect.objectContaining({
        assetDiagnostics: expect.any(Number),
        codeActions: expect.any(Number),
        fixAllActions: expect.any(Number),
        fixAllEdits: expect.any(Number),
        quickFixes: expect.any(Number),
      }))
    const qssFormatMetrics = records.find(record => record.bench === 'native.authoring.qss.format.smoke')?.metrics
    expect(qssFormatMetrics)
      .toEqual(expect.objectContaining({
        declarations: expect.any(Number),
        formatIdempotentPasses: expect.any(Number),
        formattedBytes: expect.any(Number),
        resolvedRules: expect.any(Number),
        styleFields: expect.any(Number),
      }))
    expect(qssFormatMetrics?.formatIdempotentPasses).toBe(1)
    expect(qssFormatMetrics?.resolvedRules).toBeGreaterThan(0)
    expect(qssFormatMetrics?.styleFields).toBeGreaterThan(0)
    expect(records.find(record => record.bench === 'native.authoring.project_index.build.smoke')?.metrics)
      .toEqual(expect.objectContaining({
        assetReferences: expect.any(Number),
        classes: expect.any(Number),
        components: expect.any(Number),
      }))
  })

  it('records benchmark memory deltas as non-negative pressure metrics', () => {
    const memorySamples = [
      { heapUsed: 1000, rss: 2000 },
      { heapUsed: 900, rss: 1500 },
    ]
    const record = runBenchmarkDefinition({
      bench: 'native.authoring.memory.fixture',
      defaultIterations: 1,
      documentBytes: 128,
      run: () => ({
        checksum: 1,
        diagnostics: 0,
        metrics: {},
      }),
    }, undefined, {
      now: (() => {
        let current = 0
        return () => current += 1
      })(),
      memoryUsage: () => memorySamples.shift() || { heapUsed: 900, rss: 1500 },
    })

    expect(record.memory).toEqual({
      heapUsedBytes: 0,
      rssBytes: 0,
    })
  })
})
