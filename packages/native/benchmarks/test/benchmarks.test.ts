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
      'native.authoring.qui.format.smoke',
      'native.authoring.qss.format.smoke',
      'native.authoring.completion_hover.smoke',
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
  })
})
