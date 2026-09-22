import type { EditorCompletion, EditorDefinition, EditorDiagnostic, EditorFormatOptions, EditorHover, EditorLanguageRequest, EditorProject, EditorRange, EditorTextEdit } from '@quajs/editor-core'
import type { CompletionItem, Diagnostic, Hover, Range } from 'vscode-languageserver-types'
import { extname } from 'node:path'
import { getLanguageService as jsonLanguage } from 'vscode-json-languageservice'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver-types'
import { DiagnosticLevel } from 'vscode-markdown-languageservice'
import { URI } from 'vscode-uri'
import { getLanguageService as yamlLanguage } from 'yaml-language-server/lib/umd/languageservice/yamlLanguageService.js'
import { readProjectDocument, resolveDocumentPath } from '../documents.js'
import { MAX_DOCUMENT_BYTES } from '../files.js'
import { markdownLanguage, markdownToken } from './markdown.js'
import { isTypeScript, TypeScriptLanguage } from './typescript.js'

function language(path: string): string {
  if (isTypeScript(path))
    return 'typescript'
  const extension = extname(path).toLowerCase()
  return ({ '.json': 'json', '.jsonc': 'jsonc', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown' } as Record<string, string>)[extension] || 'plaintext'
}
export class SourceLanguages {
  private readonly buffers = new Map<string, TextDocument>()
  private typescript?: TypeScriptLanguage
  private markdown?: ReturnType<typeof markdownLanguage>
  private version = 0
  private readonly schemas = new Set<string>()
  private readonly json = jsonLanguage({ schemaRequestService: uri => this.schema(uri), workspaceContext: { resolveRelativePath: (path, base) => new URL(path, base).href } })
  private readonly yaml = yamlLanguage({ schemaRequestService: uri => this.schema(uri), workspaceContext: { resolveRelativePath: (path, base) => new URL(path, base).href } })
  constructor(private project: EditorProject) {
    this.json.configure({ validate: true, allowComments: false })
    this.yaml.configure({ validate: true, completion: true, hover: true, format: true, hoverAnchor: true })
  }

  configure(project: EditorProject): void {
    this.project = project
    this.typescript?.dispose()
    this.typescript = undefined
    this.markdown?.dispose()
    this.markdown = undefined
    this.resetSchemas()
  }

  dispose(): void {
    this.configure(this.project)
    this.buffers.clear()
  }

  private get ts(): TypeScriptLanguage { return this.typescript ??= new TypeScriptLanguage(this.project, this.buffers) }
  private get md(): ReturnType<typeof markdownLanguage> { return this.markdown ??= markdownLanguage(this.project, this.buffers) }
  get extraFiles(): Record<string, string> {
    return Object.fromEntries([...this.buffers].filter(([path]) => isTypeScript(path)).map(([path, document]) => [path, document.getText()]))
  }

  async sync(documents: { path: string, text: string }[]): Promise<void> {
    if (!Array.isArray(documents) || documents.length > 24 || documents.reduce((size, item) => size + (typeof item.text === 'string' ? item.text.length * 2 : Infinity), 0) > 24 * 1024 * 1024)
      throw new Error('语言服务文档超出上限。')
    const candidates = await Promise.all(documents.map(async (item) => {
      this.validateText(item.text)
      try {
        return { ...item, path: await resolveDocumentPath(this.project.root, item.path) }
      }
      catch (error) {
        // A watcher may report deletion after this snapshot was sent. Keep other
        // tabs usable; the editor still owns the missing document's dirty draft.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return undefined
        throw error
      }
    }))
    const checked = candidates.filter(item => item !== undefined)
    const active = new Set(checked.map(item => item.path))
    for (const path of this.buffers.keys()) {
      if (!active.has(path)) {
        this.buffers.delete(path)
        this.resetSchemas()
      }
    }
    for (const item of checked) this.update(item.path, item.text)
    this.typescript?.changed()
    // Markdown caches are keyed by URI/version; invalidate cross-file links on draft changes.
    this.markdown?.dispose()
    this.markdown = undefined
  }

  private validateText(text: string): void {
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_DOCUMENT_BYTES)
      throw new Error('文档超过 2 MB 编辑上限。')
  }

  private update(path: string, text: string): TextDocument {
    let document = this.buffers.get(path)
    if (document?.getText() !== text) {
      document = TextDocument.create(URI.file(path).toString(), language(path), ++this.version, text)
      this.buffers.set(path, document)
      this.typescript?.changed()
      this.resetSchemas()
      let size = [...this.buffers.values()].reduce((sum, item) => sum + item.getText().length * 2, 0)
      while (this.buffers.size > 32 || size > 24 * 1024 * 1024) {
        const key = [...this.buffers.keys()].find(key => key !== path)!
        size -= this.buffers.get(key)!.getText().length * 2
        this.buffers.delete(key)
      }
    }
    return document!
  }

  private async document(path: string, text: string): Promise<TextDocument> {
    this.validateText(text)
    const canonical = await resolveDocumentPath(this.project.root, path)
    return this.update(canonical, text)
  }

  private async request(request: EditorLanguageRequest) {
    const document = await this.document(request.path, request.text)
    const position = { line: request.position.line - 1, character: request.position.column - 1 }
    const offset = document.offsetAt(position)
    const actual = document.positionAt(offset)
    if (!Number.isInteger(position.line) || !Number.isInteger(position.character) || actual.line !== position.line || actual.character !== position.character)
      throw new Error('无效的文档位置。')
    return { document, position, offset, path: URI.parse(document.uri).fsPath }
  }

  private async schema(uri: string): Promise<string> {
    const resource = URI.parse(uri)
    if (resource.scheme !== 'file')
      throw new Error('请使用项目内的本地 JSON Schema；编辑器不会自动下载远程 Schema。')
    this.schemas.add(uri)
    const document = await readProjectDocument(this.project.root, resource.fsPath)
    return this.buffers.get(document.path)?.getText() ?? document.text
  }

  private resetSchemas(): void {
    for (const uri of this.schemas) {
      this.json.resetSchema(uri)
      this.yaml.resetSchema(uri)
    }
    this.schemas.clear()
  }

  async diagnostics(path: string, text: string): Promise<EditorDiagnostic[]> {
    const document = await this.document(path, text)
    path = URI.parse(document.uri).fsPath
    if (document.languageId === 'typescript')
      return this.ts.diagnostics(path)
    let diagnostics: Diagnostic[] = []
    if (document.languageId === 'json' || document.languageId === 'jsonc') {
      diagnostics = await this.json.doValidation(document, this.json.parseJSONDocument(document), { comments: document.languageId === 'jsonc' || /(?:^|[/\\])(?:tsconfig|jsconfig)(?:\.[^/\\]+)?\.json$/u.test(path) ? 'ignore' : 'error', trailingCommas: 'warning' })
    }
    else if (document.languageId === 'yaml') {
      diagnostics = await this.yaml.doValidation(document, false)
    }
    else if (document.languageId === 'markdown') {
      diagnostics = await this.md.computeDiagnostics(document, {
        validateReferences: DiagnosticLevel.warning,
        validateFragmentLinks: DiagnosticLevel.warning,
        validateFileLinks: DiagnosticLevel.warning,
        validateMarkdownFileLinkFragments: DiagnosticLevel.warning,
        validateDuplicateLinkDefinitions: DiagnosticLevel.warning,
        validateUnusedLinkDefinitions: DiagnosticLevel.ignore,
        ignoreLinks: [],
      }, markdownToken)
    }
    return diagnostics.map(item => ({
      code: `${document.languageId.toUpperCase()}_${item.code || 'DIAGNOSTIC'}`,
      message: typeof item.message === 'string' ? item.message : item.message.value,
      severity: item.severity === 1 ? 'error' : item.severity === 2 ? 'warning' : 'info',
      filePath: path,
      line: item.range.start.line + 1,
      column: item.range.start.character + 1,
      endLine: item.range.end.line + 1,
      endColumn: item.range.end.character + 1,
    }))
  }

  async complete(request: EditorLanguageRequest): Promise<EditorCompletion[]> {
    const { document, position, offset, path } = await this.request(request)
    if (document.languageId === 'typescript')
      return this.ts.complete(path, offset)
    let items: CompletionItem[] = []
    if (document.languageId === 'json' || document.languageId === 'jsonc')
      items = (await this.json.doComplete(document, position, this.json.parseJSONDocument(document)))?.items || []
    else if (document.languageId === 'yaml')
      items = (await this.yaml.doComplete(document, position, false)).items
    else if (document.languageId === 'markdown')
      items = await this.md.getCompletionItems(document, position, {}, markdownToken)
    return items.slice(0, 1000).map(item => ({
      label: item.label,
      kind: item.kind ? (Object.entries(CompletionItemKind).find(([, value]) => value === item.kind)?.[0] || 'text').toLowerCase() : 'text',
      detail: item.detail,
      sortText: item.sortText,
      insertText: item.textEdit?.newText ?? item.insertText,
      snippet: item.insertTextFormat === InsertTextFormat.Snippet,
      range: item.textEdit ? editorRange('range' in item.textEdit ? item.textEdit.range : item.textEdit.replace) : undefined,
    }))
  }

  async hover(request: EditorLanguageRequest): Promise<EditorHover | undefined> {
    const { document, position, offset, path } = await this.request(request)
    if (document.languageId === 'typescript')
      return this.ts.hover(path, offset)
    let hover: Hover | null | undefined
    if (document.languageId === 'json' || document.languageId === 'jsonc')
      hover = await this.json.doHover(document, position, this.json.parseJSONDocument(document))
    else if (document.languageId === 'yaml')
      hover = await this.yaml.doHover(document, position)
    // Markdown media hovers generate images; keep the workbench's existing bounded asset preview path instead.
    if (!hover)
      return undefined
    const contents = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map(value => typeof value === 'string' ? value : value.value).join('\n\n')
    return { contents, range: hover.range ? editorRange(hover.range) : undefined }
  }

  async define(request: EditorLanguageRequest): Promise<EditorDefinition[]> {
    const { document, position, offset, path } = await this.request(request)
    let definitions: EditorDefinition[] = []
    if (document.languageId === 'typescript') {
      definitions = this.ts.define(path, offset)
    }
    else if (document.languageId === 'markdown') {
      const result = await this.md.getDefinition(document, position, markdownToken)
      definitions = (result ? Array.isArray(result) ? result : [result] : []).map(item => ({ path: URI.parse(item.uri).fsPath, range: editorRange(item.range) }))
    }
    else if (document.languageId === 'yaml') {
      definitions = (this.yaml.doDefinition(document, { textDocument: { uri: document.uri }, position }) || []).map(item => ({ path: URI.parse(item.targetUri).fsPath, range: editorRange(item.targetSelectionRange) }))
    }
    else if (document.languageId === 'json' || document.languageId === 'jsonc') {
      definitions = (await this.json.findDefinition(document, position, this.json.parseJSONDocument(document))).map(item => ({ path: URI.parse(item.targetUri).fsPath, range: editorRange(item.targetSelectionRange) }))
    }
    const result: EditorDefinition[] = []
    for (const definition of definitions) {
      try {
        result.push({ ...definition, path: await resolveDocumentPath(this.project.root, definition.path) })
      }
      catch { /* Navigation shares the editor's project boundary. */ }
    }
    return result
  }

  async format(path: string, text: string, options: EditorFormatOptions = { tabSize: 2, insertSpaces: true }): Promise<EditorTextEdit[]> {
    const document = await this.document(path, text)
    if (![2, 4, 8].includes(options.tabSize) || typeof options.insertSpaces !== 'boolean')
      throw new Error('无效格式化选项。')
    path = URI.parse(document.uri).fsPath
    if (document.languageId === 'typescript')
      return this.ts.format(path, options)
    if (document.languageId === 'json' || document.languageId === 'jsonc')
      return this.json.format(document, undefined, { ...options }).map(edit => ({ range: editorRange(edit.range), newText: edit.newText }))
    const parser = ({ '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.css': 'css', '.scss': 'scss', '.html': 'html', '.vue': 'vue' } as Record<string, string>)[extname(path).toLowerCase()]
    if (!parser)
      return []
    const { format } = await import('prettier')
    const formatted = await format(text, { parser, tabWidth: options.tabSize, useTabs: !options.insertSpaces, proseWrap: 'preserve' })
    return formatted === text ? [] : [{ range: editorRange({ start: document.positionAt(0), end: document.positionAt(text.length) }), newText: formatted }]
  }
}
function editorRange(range: Range): EditorRange {
  return { start: { line: range.start.line + 1, column: range.start.character + 1 }, end: { line: range.end.line + 1, column: range.end.character + 1 } }
}
