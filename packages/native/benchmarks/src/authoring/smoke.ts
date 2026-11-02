import type { BenchmarkDefinition, NativeBenchmarkRecord, NativeBenchmarkRunOptions } from '../types'
import { runBenchmarkDefinition } from '../measurement/runner'
import { createNativeAuthoringSmokeContext } from './context'
import {
  createNativeAuthoringDocumentParseBenchmarkDefinitions,
  createNativeAuthoringDocumentToolingBenchmarkDefinitions,
} from './document-definitions'
import {
  createNativeAuthoringProjectIndexBenchmarkDefinitions,
  createNativeAuthoringProjectionBenchmarkDefinitions,
} from './project-definitions'

export function runNativeAuthoringSmokeBenchmarks(
  options: NativeBenchmarkRunOptions = {},
): NativeBenchmarkRecord[] {
  const context = createNativeAuthoringSmokeContext()
  const definitions: BenchmarkDefinition[] = [
    ...createNativeAuthoringDocumentParseBenchmarkDefinitions(context),
    ...createNativeAuthoringProjectionBenchmarkDefinitions(context),
    ...createNativeAuthoringDocumentToolingBenchmarkDefinitions(context),
    ...createNativeAuthoringProjectIndexBenchmarkDefinitions(context),
  ]

  return definitions.map(definition => runBenchmarkDefinition(definition, options.iterations))
}
