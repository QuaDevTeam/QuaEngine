import type { QuaScriptDiagnostic, SourceRange } from '@quajs/script-compiler'
import type { QuaScriptLanguageOptions } from './index'
import type { QuaScriptVirtualDocument } from './virtual'
import { statSync } from 'node:fs'
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
  dispose: () => void
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
  virtualDocument = createQuaScriptVirtualDocument(source, options),
): QuaScriptTypeScriptContext {
  const session = options.typescriptSession ?? new QuaScriptTypeScriptSession()
  return { ...session.context(virtualDocument, options), dispose: options.typescriptSession ? () => {} : () => session.dispose() }
}

/** One active virtual document; TypeScript retains library and dependency syntax trees. */
export class QuaScriptTypeScriptSession {
  private service?: ts.LanguageService
  private files = new Map<string, { text: string, version: string }>()
  private root = ''
  private generation = 0
  private options: ts.CompilerOptions = {}

  context(virtualDocument: QuaScriptVirtualDocument, options: QuaScriptLanguageOptions): Omit<QuaScriptTypeScriptContext, 'dispose'> {
    const fileName = normalizeFileName(virtualDocument.fileName)
    const root = options.projectRoot || dirname(fileName)
    if (this.root !== root)
      this.dispose()
    this.root = root
    this.options = getCompilerOptions(root)
    const version = String(++this.generation)
    this.files = new Map([
      [fileName, { text: virtualDocument.text, version }],
      ...Array.from(normalizeExtraFiles(options.extraFiles, root), ([path, text]) => [path, { text, version }] as const),
    ])
    const getFileText = (path: string): string | undefined => this.files.get(normalizeFileName(path))?.text ?? ts.sys.readFile(path)
    if (!this.service) {
      const host: ts.LanguageServiceHost = {
        directoryExists: ts.sys.directoryExists,
        fileExists: path => this.files.has(normalizeFileName(path)) || ts.sys.fileExists(path),
        getCompilationSettings: () => this.options,
        getCurrentDirectory: () => this.root,
        getDefaultLibFileName: ts.getDefaultLibFilePath,
        getDirectories: ts.sys.getDirectories,
        getProjectVersion: () => String(this.generation),
        getScriptFileNames: () => [...this.files.keys()],
        getScriptSnapshot: (path) => {
          const text = getFileText(path)
          return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
        },
        getScriptVersion: (path) => {
          const file = this.files.get(normalizeFileName(path))
          if (file)
            return file.version
          try {
            const stat = statSync(path)
            return `${stat.mtimeMs}:${stat.size}`
          }
          catch { return 'missing' }
        },
        readFile: getFileText,
        readDirectory: ts.sys.readDirectory,
        realpath: ts.sys.realpath,
      }
      this.service = ts.createLanguageService(host)
    }
    return { fileName, getFileText, service: this.service, virtualDocument }
  }

  dispose(): void {
    this.service?.dispose()
    this.service = undefined
    this.files.clear()
  }
}

/** Checks the actual tsconfig program, including config/syntax/semantic errors. No emit. */
export function checkTypeScriptProject(projectRoot: string): Array<QuaScriptDiagnostic & { filePath?: string }> {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists)
  if (!configPath)
    return []
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config || {}, ts.sys, dirname(configPath), { noEmit: true }, configPath)
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
  return [...(config.error ? [config.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].map(diagnostic => ({
    code: `TS_${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    severity: mapTypeScriptDiagnosticSeverity(diagnostic.category),
    source: 'quascript/typescript',
    filePath: diagnostic.file?.fileName || configPath,
    range: diagnostic.file && diagnostic.start !== undefined
      ? {
          start: { ...positionAt(createLineStarts(diagnostic.file.text), diagnostic.start) },
          end: { ...positionAt(createLineStarts(diagnostic.file.text), diagnostic.start + (diagnostic.length || 1)) },
        }
      : undefined,
  }))
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
    code: `TS_${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    range,
    severity: mapTypeScriptDiagnosticSeverity(diagnostic.category),
    source: 'quascript/typescript',
  }
}

function mapTypeScriptDiagnosticSeverity(category: ts.DiagnosticCategory): QuaScriptDiagnostic['severity'] {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return 'warning'
    case ts.DiagnosticCategory.Suggestion:
    case ts.DiagnosticCategory.Message:
      return 'info'
    default:
      return 'error'
  }
}

export function mapDefinition(
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
