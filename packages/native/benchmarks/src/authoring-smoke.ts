import type { BenchmarkDefinition, NativeBenchmarkRecord, NativeBenchmarkRunOptions } from './types'
import { createNativeAuthoringSmokeContext } from './authoring-smoke-context'
import {
  createNativeAuthoringDocumentParseBenchmarkDefinitions,
  createNativeAuthoringDocumentToolingBenchmarkDefinitions,
} from './authoring-smoke-document-definitions'
import {
  createNativeAuthoringProjectIndexBenchmarkDefinitions,
  createNativeAuthoringProjectionBenchmarkDefinitions,
} from './authoring-smoke-project-definitions'
import { runBenchmarkDefinition } from './runner'

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
