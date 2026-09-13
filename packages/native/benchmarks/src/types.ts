export type NativeBenchmarkProfile = 'smoke'

export interface NativeBenchmarkMemoryDelta {
  heapUsedBytes: number
  rssBytes: number
}

export interface NativeBenchmarkRecord {
  backend: 'typescript'
  bench: string
  checksum: number
  diagnostics: number
  documentBytes: number
  elapsedMs: number
  iterations: number
  memory: NativeBenchmarkMemoryDelta
  metrics: Record<string, number>
  packageVersion: string
  platform: NodeJS.Platform
  profile: NativeBenchmarkProfile
  schemaVersion: number
  suite: 'native.authoring'
}

export interface NativeBenchmarkRunOptions {
  iterations?: number
}

export interface BenchmarkOperationMetrics {
  checksum: number
  diagnostics: number
  metrics: Record<string, number>
}

export interface BenchmarkDefinition {
  bench: string
  defaultIterations: number
  documentBytes: number
  run: (iterations: number) => BenchmarkOperationMetrics
}
