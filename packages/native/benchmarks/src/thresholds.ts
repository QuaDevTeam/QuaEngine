import type { NativeBenchmarkRecord } from './types'

export function assertNativeBenchmarkSmokeThresholds(records: readonly NativeBenchmarkRecord[]): string[] {
  const failures: string[] = []
  for (const record of records) {
    if (record.elapsedMs > smokeThresholdMs(record.bench)) {
      failures.push(`${record.bench} exceeded smoke threshold: ${record.elapsedMs.toFixed(3)}ms`)
    }
    if (record.diagnostics > 0)
      failures.push(`${record.bench} produced ${record.diagnostics} diagnostics`)
    if (record.checksum <= 0)
      failures.push(`${record.bench} produced an empty checksum`)
  }
  return failures
}

function smokeThresholdMs(bench: string): number {
  if (bench.includes('completion_hover'))
    return 1500
  if (bench.includes('project_index'))
    return 3000
  if (bench.includes('format'))
    return 2500
  return 3000
}
