import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  NATIVE_BENCHMARK_PACKAGE_VERSION,
  NATIVE_BENCHMARK_SCHEMA_VERSION,
} from './constants'
import type { BenchmarkDefinition, NativeBenchmarkRecord } from './types'

export function runBenchmarkDefinition(
  definition: BenchmarkDefinition,
  overrideIterations?: number,
  hooks: {
    now?: () => number
    memoryUsage?: () => Pick<NodeJS.MemoryUsage, 'heapUsed' | 'rss'>
  } = {},
): NativeBenchmarkRecord {
  const iterations = overrideIterations ?? definition.defaultIterations
  const now = hooks.now || (() => performance.now())
  const memoryUsage = hooks.memoryUsage || (() => process.memoryUsage())
  collectGarbage()
  const memoryBefore = memoryUsage()
  const start = now()
  const result = definition.run(iterations)
  const elapsedMs = now() - start
  const memoryAfter = memoryUsage()

  return {
    backend: 'typescript',
    bench: definition.bench,
    checksum: result.checksum,
    diagnostics: result.diagnostics,
    documentBytes: definition.documentBytes,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterations,
    memory: {
      heapUsedBytes: nonNegativeDelta(memoryAfter.heapUsed, memoryBefore.heapUsed),
      rssBytes: nonNegativeDelta(memoryAfter.rss, memoryBefore.rss),
    },
    metrics: result.metrics,
    packageVersion: NATIVE_BENCHMARK_PACKAGE_VERSION,
    platform: process.platform,
    profile: 'smoke',
    schemaVersion: NATIVE_BENCHMARK_SCHEMA_VERSION,
    suite: 'native.authoring',
  }
}

export function byteLength(source: string): number {
  return Buffer.byteLength(source, 'utf8')
}

function nonNegativeDelta(after: number, before: number): number {
  return Math.max(0, after - before)
}

function collectGarbage(): void {
  const gc = (globalThis as { gc?: () => void }).gc
  if (gc)
    gc()
}
