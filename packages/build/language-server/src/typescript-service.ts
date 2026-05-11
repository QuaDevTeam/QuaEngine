import type { QuaScriptDiagnostic, SourceRange } from '@quajs/script-compiler'
import type { QuaScriptLanguageOptions } from './index'
import type { QuaScriptVirtualDocument } from './virtual'
import { dirname, isAbsolute, resolve } from 'node:path'
import ts from 'typescript'
import {
  createQuaScriptVirtualDocument,
  mapSourceOffsetToRange,
  mapSourceOffsetToVirtualOffset,
  mapVirtualOffsetToSourceOffset,
  mapVirtualRangeToSourceRange,
  sourcePositionToOffset,
} from './virtual'

export interface QuaScriptTypeScriptContext {
  fileName: string
  getFileText: (fileName: string) => string | undefined
  service: ts.LanguageService
  virtualDocument: QuaScriptVirtualDocument
}

export interface QuaScriptHover {
  contents: string
  range?: SourceRange
}

export interface QuaScriptDefinition {
  filePath?: string
  range: SourceRange
}

export function createQuaScriptTypeScriptContext(
  source: string,
  options: QuaScriptLanguageOptions = {},
): QuaScriptTypeScriptContext {
  const virtualDocument = createQuaScriptVirtualDocument(source, options)
  const fileName = normalizeFileName(virtualDocument.fileName)
  const extraFiles = normalizeExtraFiles(options.extraFiles, options.projectRoot || dirname(fileName))
  const compilerOptions = getCompilerOptions(options.projectRoot)
  const files = new Map<string, { text: string, version: string }>([
    [fileName, { text: virtualDocument.text, version: '0' }],
    ...Array.from(extraFiles.entries()).map(([path, text]) => [path, { text, version: '0' }] as const),
  ])

  const getFileText = (requestedFileName: string): string | undefined => {
    const normalized = normalizeFileName(requestedFileName)
    return files.get(normalized)?.text || ts.sys.readFile(normalized)
  }

  const host: ts.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: filePath => files.has(normalizeFileName(filePath)) || ts.sys.fileExists(filePath),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => options.projectRoot || dirname(fileName),
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    getDirectories: ts.sys.getDirectories,
    getScriptFileNames: () => Array.from(files.keys()),
    getScriptKind: (scriptFileName) => {
      if (scriptFileName === fileName) {
        return ts.ScriptKind.TS
      }
      if (scriptFileName.endsWith('.tsx')) {
        return ts.ScriptKind.TSX
      }
      if (scriptFileName.endsWith('.jsx')) {
        return ts.ScriptKind.JSX
      }
      if (scriptFileName.endsWith('.js') || scriptFileName.endsWith('.mjs') || scriptFileName.endsWith('.cjs')) {
        return ts.ScriptKind.JS
      }
      return ts.ScriptKind.TS
    },
    getScriptSnapshot: (scriptFileName) => {
      const text = getFileText(scriptFileName)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getScriptVersion: scriptFileName => files.get(normalizeFileName(scriptFileName))?.version || '0',
    readFile: getFileText,
    readDirectory: ts.sys.readDirectory,
    realpath: ts.sys.realpath,
  }

  return {
    fileName,
    getFileText,
    service: ts.createLanguageService(host),
    virtualDocument,
  }
}

export function collectQuaScriptTypeScriptDiagnostics(context: QuaScriptTypeScriptContext): QuaScriptDiagnostic[] {
  return [
    ...context.service.getSyntacticDiagnostics(context.fileName),
    ...context.service.getSemanticDiagnostics(context.fileName),
  ]
    .map(diagnostic => mapTypeScriptDiagnostic(context, diagnostic))
    .filter((diagnostic): diagnostic is QuaScriptDiagnostic => Boolean(diagnostic))
}

export function getTypeScriptCompletionsAtSourcePosition(
  context: QuaScriptTypeScriptContext,
  position: { character: number, line: number },
): ts.CompletionInfo | undefined {
  const sourceOffset = sourcePositionToOffset(context.virtualDocument.source, position)
  const virtualOffset = mapSourceOffsetToVirtualOffset(context.virtualDocument, sourceOffset)
  if (virtualOffset === undefined) {
    return undefined
  }

  return context.service.getCompletionsAtPosition(context.fileName, virtualOffset, {
    allowIncompleteCompletions: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsForModuleExports: true,
    includeCompletionsWithInsertText: true,
  })
}

export function getTypeScriptHoverAtSourcePosition(
  context: QuaScriptTypeScriptContext,
  position: { character: number, line: number },
): QuaScriptHover | undefined {
  const sourceOffset = sourcePositionToOffset(context.virtualDocument.source, position)
  const virtualOffset = mapSourceOffsetToVirtualOffset(context.virtualDocument, sourceOffset)
  if (virtualOffset === undefined) {
    return undefined
  }

  const quickInfo = context.service.getQuickInfoAtPosition(context.fileName, virtualOffset)
  if (!quickInfo) {
    return undefined
  }

  const contents = [
    ts.displayPartsToString(quickInfo.displayParts || []),
    ts.displayPartsToString(quickInfo.documentation || []),
  ].filter(Boolean).join('\n\n')

  return {
    contents,
    range: quickInfo.textSpan
      ? mapVirtualRangeToSourceRange(context.virtualDocument, quickInfo.textSpan.start, quickInfo.textSpan.length)
      : undefined,
  }
}

export function getTypeScriptDefinitionsAtSourcePosition(
  context: QuaScriptTypeScriptContext,
  position: { character: number, line: number },
): QuaScriptDefinition[] {
  const sourceOffset = sourcePositionToOffset(context.virtualDocument.source, position)
  const virtualOffset = mapSourceOffsetToVirtualOffset(context.virtualDocument, sourceOffset)
  if (virtualOffset === undefined) {
    return []
  }

  return (context.service.getDefinitionAtPosition(context.fileName, virtualOffset) || [])
    .map(definition => mapDefinition(context, definition))
    .filter((definition): definition is QuaScriptDefinition => Boolean(definition))
}

function mapTypeScriptDiagnostic(
  context: QuaScriptTypeScriptContext,
  diagnostic: ts.Diagnostic,
): QuaScriptDiagnostic | undefined {
  if (diagnostic.file?.fileName !== context.fileName || diagnostic.start === undefined) {
    return undefined
  }

  const range = mapVirtualRangeToSourceRange(context.virtualDocument, diagnostic.start, diagnostic.length || 0)
  if (!range) {
    return undefined
  }

  return {
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    range,
    severity: diagnostic.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
  }
}

function mapDefinition(
  context: QuaScriptTypeScriptContext,
  definition: ts.DefinitionInfo,
): QuaScriptDefinition | undefined {
  if (definition.fileName === context.fileName) {
    const sourceStart = mapVirtualOffsetToSourceOffset(context.virtualDocument, definition.textSpan.start)
    if (sourceStart === undefined) {
      return undefined
    }
    return {
      range: mapSourceOffsetToRange(context.virtualDocument, sourceStart, definition.textSpan.length),
    }
  }

  const fileText = context.getFileText(definition.fileName)
  if (!fileText) {
    return undefined
  }
  const lineStarts = createLineStarts(fileText)
  return {
    filePath: definition.fileName,
    range: {
      start: positionAt(lineStarts, definition.textSpan.start),
      end: positionAt(lineStarts, definition.textSpan.start + definition.textSpan.length),
    },
  }
}

function normalizeExtraFiles(extraFiles: Record<string, string> | undefined, baseDir: string): Map<string, string> {
  const files = new Map<string, string>()
  Object.entries(extraFiles || {}).forEach(([filePath, content]) => {
    files.set(normalizeFileName(isAbsolute(filePath) ? filePath : resolve(baseDir, filePath)), content)
  })
  return files
}

function normalizeFileName(fileName: string): string {
  return fileName.replace(/\\/g, '/')
}

function getCompilerOptions(projectRoot?: string): ts.CompilerOptions {
  const fallback: ts.CompilerOptions = {
    allowImportingTsExtensions: true,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  }

  if (!projectRoot) {
    return fallback
  }

  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists)
  if (!configPath) {
    return fallback
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    return fallback
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  return {
    ...fallback,
    ...parsed.options,
    allowImportingTsExtensions: true,
    noEmit: true,
  }
}

function createLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) {
      starts.push(index + 1)
    }
  }
  return starts
}

function positionAt(lineStarts: readonly number[], offset: number): { column: number, line: number, offset: number } {
  const safeOffset = Math.max(0, offset)
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const start = lineStarts[middle]
    const next = middle + 1 < lineStarts.length ? lineStarts[middle + 1] : Number.POSITIVE_INFINITY
    if (safeOffset < start) {
      high = middle - 1
    }
    else if (safeOffset >= next) {
      low = middle + 1
    }
    else {
      return {
        column: safeOffset - start,
        line: middle,
        offset: safeOffset,
      }
    }
  }

  const lastLine = lineStarts.length - 1
  return {
    column: safeOffset - lineStarts[lastLine],
    line: lastLine,
    offset: safeOffset,
  }
}
