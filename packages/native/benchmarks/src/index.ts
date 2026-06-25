import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  buildNativeUiProjectIndex,
  formatNativeUiDocumentEdits,
  getNativeUiLanguageCompletions,
  getNativeUiLanguageHover,
  lintNativeUiDocument,
  updateNativeUiProjectIndex,
} from '@quajs/native-language-server'
import {
  analyzeNativeUiDocument,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
} from '@quajs/native-ui-compiler'
import {
  createNativeAuthoringBenchmarkFixtures,
  createUpdatedQuiProjectSource,
} from './fixtures'

export const NATIVE_BENCHMARK_SCHEMA_VERSION = 1
export const NATIVE_BENCHMARK_PACKAGE_VERSION = '0.1.0'

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

interface BenchmarkDefinition {
  bench: string
  defaultIterations: number
  documentBytes: number
  run: (iterations: number) => BenchmarkOperationMetrics
}

interface BenchmarkOperationMetrics {
  checksum: number
  diagnostics: number
  metrics: Record<string, number>
}

export function runNativeAuthoringSmokeBenchmarks(
  options: NativeBenchmarkRunOptions = {},
): NativeBenchmarkRecord[] {
  const fixtures = createNativeAuthoringBenchmarkFixtures()
  const quiCompletionOffset = fixtures.qui.indexOf('Button(action')
  const quiHoverOffset = fixtures.qui.indexOf('Button')
  const qssCompletionOffset = fixtures.qss.indexOf('background-color')
  const qssHoverOffset = fixtures.qss.indexOf('border-radius')
  const projectIndexOptions = {
    language: {
      lint: {
        strictComponents: true,
      },
    },
  } as const
  const projectDocumentBytes = fixtures.projectFiles.reduce((total, file) => total + byteLength(file.source), 0)
  const initialProjectIndex = buildNativeUiProjectIndex(fixtures.projectFiles, projectIndexOptions)

  const definitions: BenchmarkDefinition[] = [
    {
      bench: 'native.authoring.qui.parse_validate.smoke',
      defaultIterations: 32,
      documentBytes: byteLength(fixtures.qui),
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let nodes = 0
        let props = 0
        for (let index = 0; index < iterations; index += 1) {
          const document = analyzeNativeUiDocument(fixtures.qui, {
            filePath: 'bench/menu.qui',
            lint: {
              strictComponents: true,
            },
          })
          if (document.kind === 'qui') {
            nodes += document.nodes.length
            props += document.props.length
            checksum += document.imports.length + document.nodes.length + document.props.length
          }
          diagnostics += document.diagnostics.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            nodes,
            props,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qss.parse_validate.smoke',
      defaultIterations: 32,
      documentBytes: byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let declarations = 0
        let diagnostics = 0
        let rules = 0
        for (let index = 0; index < iterations; index += 1) {
          const document = analyzeNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            lint: {
              strictComponents: true,
            },
          })
          if (document.kind === 'qss') {
            rules += document.rules.length
            declarations += document.rules.reduce((total, rule) => total + rule.declarations.length, 0)
            checksum += document.atRules.length + document.rules.length + declarations
          }
          diagnostics += document.diagnostics.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            declarations,
            rules,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qui.format.smoke',
      defaultIterations: 24,
      documentBytes: byteLength(fixtures.qui),
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let formattedBytes = 0
        for (let index = 0; index < iterations; index += 1) {
          const formatted = formatNativeUiDocument(fixtures.qui, {
            filePath: 'bench/menu.qui',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const edits = formatNativeUiDocumentEdits(fixtures.qui, {
            filePath: 'bench/menu.qui',
          })
          formattedBytes += byteLength(formatted)
          diagnostics += lintNativeUiDocument(formatted, {
            filePath: 'bench/menu.qui',
          }).diagnostics.length
          checksum += formatted.length + edits.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            formattedBytes,
          },
        }
      },
    },
    {
      bench: 'native.authoring.qss.format.smoke',
      defaultIterations: 24,
      documentBytes: byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let formattedBytes = 0
        for (let index = 0; index < iterations; index += 1) {
          const formatted = formatNativeUiDocument(fixtures.qss, {
            filePath: 'bench/menu.qss',
            format: {
              indentSize: 2,
              insertFinalNewline: true,
            },
          })
          const edits = formatNativeUiDocumentEdits(fixtures.qss, {
            filePath: 'bench/menu.qss',
          })
          formattedBytes += byteLength(formatted)
          diagnostics += lintNativeUiDocument(formatted, {
            filePath: 'bench/menu.qss',
          }).diagnostics.length
          checksum += formatted.length + edits.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            formattedBytes,
          },
        }
      },
    },
    {
      bench: 'native.authoring.completion_hover.smoke',
      defaultIterations: 128,
      documentBytes: byteLength(fixtures.qui) + byteLength(fixtures.qss),
      run(iterations) {
        let checksum = 0
        const diagnostics = 0
        let completionItems = 0
        let hoverHits = 0
        for (let index = 0; index < iterations; index += 1) {
          const quiCompletions = getNativeUiLanguageCompletions(
            fixtures.qui,
            positionAtOffset(fixtures.qui, quiCompletionOffset),
            { filePath: 'bench/menu.qui' },
          )
          const qssCompletions = getNativeUiCompletions(
            fixtures.qss,
            qssCompletionOffset,
            { filePath: 'bench/menu.qss' },
          )
          const quiHover = getNativeUiLanguageHover(
            fixtures.qui,
            positionAtOffset(fixtures.qui, quiHoverOffset),
            { filePath: 'bench/menu.qui' },
          )
          const qssHover = getNativeUiHover(
            fixtures.qss,
            qssHoverOffset,
            { filePath: 'bench/menu.qss' },
          )
          completionItems += quiCompletions.length + qssCompletions.length
          hoverHits += (quiHover ? 1 : 0) + (qssHover ? 1 : 0)
          checksum += completionItems + hoverHits
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            completionItems,
            hoverHits,
          },
        }
      },
    },
    {
      bench: 'native.authoring.project_index.build.smoke',
      defaultIterations: 6,
      documentBytes: projectDocumentBytes,
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let documentLinks = 0
        let documentCount = 0
        let references = 0
        let qssRules = 0
        for (let index = 0; index < iterations; index += 1) {
          const projectIndex = buildNativeUiProjectIndex(fixtures.projectFiles, projectIndexOptions)
          diagnostics += projectIndex.summary.diagnostics
          documentLinks += projectIndex.documentLinks.length
          documentCount += projectIndex.summary.documentCount
          references += projectIndex.references.length
          qssRules += projectIndex.summary.qssRules
          checksum += projectIndex.summary.documentBytes
            + projectIndex.summary.components
            + projectIndex.summary.qssDeclarations
            + projectIndex.documentLinks.length
            + projectIndex.references.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            documentLinks,
            documentCount,
            references,
            qssRules,
          },
        }
      },
    },
    {
      bench: 'native.authoring.project_index.incremental_update.smoke',
      defaultIterations: 48,
      documentBytes: projectDocumentBytes,
      run(iterations) {
        let checksum = 0
        let diagnostics = 0
        let documentLinks = 0
        let documentCount = 0
        let references = 0
        let qssRules = 0
        let projectIndex = initialProjectIndex
        const targetFile = fixtures.projectFiles[0]
        for (let index = 0; index < iterations; index += 1) {
          projectIndex = updateNativeUiProjectIndex(projectIndex, [
            {
              ...targetFile,
              source: createUpdatedQuiProjectSource(targetFile.source, index),
              version: index + 2,
            },
          ], projectIndexOptions)
          diagnostics += projectIndex.summary.diagnostics
          documentLinks += projectIndex.documentLinks.length
          documentCount += projectIndex.summary.documentCount
          references += projectIndex.references.length
          qssRules += projectIndex.summary.qssRules
          checksum += projectIndex.summary.documentBytes
            + projectIndex.summary.components
            + projectIndex.summary.qssDeclarations
            + projectIndex.documentLinks.length
            + projectIndex.references.length
        }
        return {
          checksum,
          diagnostics,
          metrics: {
            documentLinks,
            documentCount,
            references,
            qssRules,
          },
        }
      },
    },
  ]

  return definitions.map(definition => runDefinition(definition, options.iterations))
}

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

function runDefinition(definition: BenchmarkDefinition, overrideIterations?: number): NativeBenchmarkRecord {
  const iterations = overrideIterations ?? definition.defaultIterations
  collectGarbage()
  const memoryBefore = process.memoryUsage()
  const start = performance.now()
  const result = definition.run(iterations)
  const elapsedMs = performance.now() - start
  const memoryAfter = process.memoryUsage()

  return {
    backend: 'typescript',
    bench: definition.bench,
    checksum: result.checksum,
    diagnostics: result.diagnostics,
    documentBytes: definition.documentBytes,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    iterations,
    memory: {
      heapUsedBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rssBytes: memoryAfter.rss - memoryBefore.rss,
    },
    metrics: result.metrics,
    packageVersion: NATIVE_BENCHMARK_PACKAGE_VERSION,
    platform: process.platform,
    profile: 'smoke',
    schemaVersion: NATIVE_BENCHMARK_SCHEMA_VERSION,
    suite: 'native.authoring',
  }
}

function byteLength(source: string): number {
  return Buffer.byteLength(source, 'utf8')
}

function positionAtOffset(source: string, offset: number): { character: number, line: number } {
  const safeOffset = Math.max(0, Math.min(source.length, offset))
  const before = source.slice(0, safeOffset)
  const lines = before.split(/\r?\n/)
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  }
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

function collectGarbage(): void {
  const gc = (globalThis as { gc?: () => void }).gc
  if (gc)
    gc()
}
