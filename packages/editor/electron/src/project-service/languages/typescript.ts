import type { EditorCompletion, EditorDefinition, EditorDiagnostic, EditorFormatOptions, EditorHover, EditorProject, EditorRange, EditorTextEdit } from '@quajs/editor-core'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { TextDocument } from 'vscode-languageserver-textdocument'

export const isTypeScript = (path: string): boolean => /\.[cm]?[jt]sx?$/iu.test(path)
export class TypeScriptLanguage {
  private readonly service: ts.LanguageService
  private generation = 0
  constructor(project: EditorProject, private readonly buffers: Map<string, TextDocument>) {
    const configPath = ts.findConfigFile(project.root, ts.sys.fileExists) ?? ts.findConfigFile(project.root, ts.sys.fileExists, 'jsconfig.json')
    const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile).config : {}
    const parsed = ts.parseJsonConfigFileContent(config || {}, ts.sys, configPath ? dirname(configPath) : project.root)
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
      checkJs: true,
      allowNonTsExtensions: true,
      ...parsed.options,
      noEmit: true,
    }
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getCurrentDirectory: () => project.root,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      getScriptFileNames: () => [...new Set([...parsed.fileNames, ...project.files.filter(isTypeScript).map(path => join(project.root, path)), ...buffers.keys()].filter(isTypeScript))],
      getProjectVersion: () => String(this.generation),
      getScriptVersion: (path) => {
        const buffer = buffers.get(path)
        if (buffer)
          return String(buffer.version)
        try {
          const file = statSync(path)
          return `${file.mtimeMs}:${file.size}`
        }
        catch { return 'missing' }
      },
      getScriptSnapshot: (path) => {
        const text = this.text(path)
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
      },
      fileExists: path => buffers.has(path) || ts.sys.fileExists(path),
      readFile: path => this.text(path),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    }
    this.service = ts.createLanguageService(host)
  }

  changed(): void { this.generation++ }
  dispose(): void { this.service.dispose() }
  private text(path: string): string | undefined { return this.buffers.get(path)?.getText() ?? ts.sys.readFile(path) }
  private range(path: string, span: ts.TextSpan): EditorRange {
    const document = this.buffers.get(path) ?? TextDocument.create(path, 'typescript', 0, this.text(path) || '')
    const start = document.positionAt(span.start)
    const end = document.positionAt(span.start + span.length)
    return { start: { line: start.line + 1, column: start.character + 1 }, end: { line: end.line + 1, column: end.character + 1 } }
  }

  diagnostics(path: string): EditorDiagnostic[] {
    return [...this.service.getSyntacticDiagnostics(path), ...this.service.getSemanticDiagnostics(path)].map((item) => {
      const range = this.range(path, { start: item.start || 0, length: item.length || 1 })
      return { code: `TS_${item.code}`, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'), severity: item.category === ts.DiagnosticCategory.Error ? 'error' : 'warning', filePath: path, line: range.start.line, column: range.start.column, endLine: range.end.line, endColumn: range.end.column }
    })
  }

  complete(path: string, offset: number): EditorCompletion[] {
    return (this.service.getCompletionsAtPosition(path, offset, { includeCompletionsWithInsertText: true })?.entries || []).slice(0, 1000).map(item => ({
      label: item.name,
      kind: item.kind,
      insertText: item.insertText,
      sortText: item.sortText,
      range: item.replacementSpan ? this.range(path, item.replacementSpan) : undefined,
      snippet: item.isSnippet,
    }))
  }

  hover(path: string, offset: number): EditorHover | undefined {
    const info = this.service.getQuickInfoAtPosition(path, offset)
    return info ? { contents: `\`\`\`typescript\n${ts.displayPartsToString(info.displayParts)}\n\`\`\`\n\n${ts.displayPartsToString(info.documentation)}`, range: this.range(path, info.textSpan) } : undefined
  }

  define(path: string, offset: number): EditorDefinition[] {
    return (this.service.getDefinitionAtPosition(path, offset) || []).map(item => ({ path: item.fileName, range: this.range(item.fileName, item.textSpan) }))
  }

  format(path: string, options: EditorFormatOptions): EditorTextEdit[] {
    return this.service.getFormattingEditsForDocument(path, {
      indentSize: options.tabSize,
      tabSize: options.tabSize,
      convertTabsToSpaces: options.insertSpaces,
      newLineCharacter: '\n',
      insertSpaceAfterCommaDelimiter: true,
      insertSpaceAfterSemicolonInForStatements: true,
      insertSpaceBeforeAndAfterBinaryOperators: true,
      insertSpaceAfterKeywordsInControlFlowStatements: true,
      insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    }).map(edit => ({ range: this.range(path, edit.span), newText: edit.newText }))
  }
}
