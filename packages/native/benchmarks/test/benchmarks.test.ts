import { describe, expect, it } from 'vitest'
import {
  assertNativeBenchmarkSmokeThresholds,
  NATIVE_BENCHMARK_SCHEMA_VERSION,
  runNativeAuthoringSmokeBenchmarks,
} from '../src'

describe('@quajs/native-benchmarks', () => {
  it('emits deterministic native authoring smoke records', () => {
    const records = runNativeAuthoringSmokeBenchmarks({ iterations: 1 })

    expect(records.map(record => record.bench)).toEqual([
      'native.authoring.qui.parse_validate.smoke',
      'native.authoring.qss.parse_validate.smoke',
      'native.authoring.qss.resolve_style.smoke',
      'native.authoring.qui.format.smoke',
      'native.authoring.qss.format.smoke',
      'native.authoring.completion_hover.smoke',
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
    expect(records.find(record => record.bench === 'native.authoring.project_index.build.smoke')?.metrics)
      .toEqual(expect.objectContaining({
        classes: expect.any(Number),
        components: expect.any(Number),
      }))
  })
})
