import type { EditorAnalysis, EditorDefinition, EditorDevtoolsDescriptor, EditorDiagnostic, EditorDocument, EditorFileOperation, EditorImageMetadata, EditorLanguageRequest, EditorPluginIndexerDescriptor, EditorProject, EditorProjectCheck, EditorRange } from '@quajs/editor-core'
import type { QuaScriptDiagnostic, SourceRange } from '@quajs/script-compiler'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { extractWritingContext } from '@quajs/editor-novel-writer/project'
import { analyzeQuaScript, checkTypeScriptProject, formatQuaScriptDocumentEdits, getQuaScriptCompletions, getQuaScriptDefinitions, getQuaScriptHover, getQuaScriptSignatureHelp, QuaScriptTypeScriptSession } from '@quajs/language-server'
import { createQuaProjectInspector } from '@quajs/project-inspector'
import { loadQuaProjectConfig } from '@quajs/quack/project'
import { loadQuaScriptToolingConfig } from '@quajs/script-compiler'
import { pluginProject } from '../plugins/project-info.js'
import { importAssetFiles, projectPath } from './asset-files.js'
import { readProjectDocument, resolveDocumentPath } from './documents.js'
import { eslintSource, ProjectESLint } from './eslint.js'
import { operateFiles, operationSource } from './file-operations.js'
import { listSourceFiles, MAX_DOCUMENT_BYTES } from './files.js'
import { SourceLanguages } from './languages/index.js'
import { inspectEditorPlugins } from './plugins.js'
import { createStoryOutline } from './story-outline.js'

export class ProjectService {
  async writingContext(root: string) {
    if (!this.snapshot || root !== this.root)
      throw new Error('项目已切换。')
    return extractWritingContext(this.snapshot, path => readProjectDocument(root, path))
  }

  private pluginRoot = ''
  private devtools: EditorDevtoolsDescriptor[] = []
  private pluginIndexers: EditorPluginIndexerDescriptor[] = []
  setPlugins(root: string, devtools: EditorDevtoolsDescriptor[], indexers: EditorPluginIndexerDescriptor[]): void {
    if (root !== this.root)
      throw new Error('项目已切换。')
    this.pluginRoot = root
    this.devtools = devtools
    this.pluginIndexers = indexers
  }

  private root?: string
  private snapshot?: EditorProject
  private readonly typescriptSession = new QuaScriptTypeScriptSession()
  private readonly analyses = new Map<string, EditorAnalysis>()
  private sourceLanguages?: SourceLanguages
  private fingerprint = ''
  watchDirectories: string[] = []
  configure(project: EditorProject): void {
    if (this.root !== project.root) {
      this.sourceLanguages?.dispose()
      this.sourceLanguages = undefined
    }
    this.root = project.root
    this.snapshot = project
    this.analyses.clear()
    this.typescriptSession.dispose()
    this.sourceLanguages?.configure(project)
  }

  private get languages(): SourceLanguages {
    if (!this.snapshot)
      throw new Error('请先打开项目。')
    return this.sourceLanguages ??= new SourceLanguages(this.snapshot)
  }

  async syncDocuments(root: string, documents: { path: string, text: string }[]): Promise<void> {
    if (root !== this.root)
      throw new Error('项目已切换。')
    await this.languages.sync(documents)
    this.analyses.clear()
  }

  async open(root: string): Promise<EditorProject> {
    const canonicalRoot = await realpath(root)
    const plugin = await pluginProject(canonicalRoot)
    const config = plugin ? { name: plugin.metadata?.title || plugin.name || 'Plugin', bundleId: plugin.name, targets: { web: { enabled: false }, native: { enabled: false } } } : await loadQuaProjectConfig({ cwd: canonicalRoot, validateAssets: false })
    const manifest = JSON.parse(await readFile(join(canonicalRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const sources = await listSourceFiles(canonicalRoot)
    const inspection = plugin ? undefined : await createQuaProjectInspector({ projectRoot: canonicalRoot, files: sources.entries.filter(entry => entry.kind === 'package' || (entry.kind === 'document' && entry.size <= MAX_DOCUMENT_BYTES)).map(entry => join(canonicalRoot, entry.path)) }).refresh()
    const fingerprint = `${canonicalRoot}:${sources.entries.filter(entry => entry.kind === 'document').map(entry => `${entry.path}:${entry.modified}:${entry.size}`).join('|')}`
    if (fingerprint !== this.fingerprint) {
      this.analyses.clear()
      this.typescriptSession.dispose()
      this.fingerprint = fingerprint
    }
    const webScript = manifest.scripts?.['dev:web'] ? 'dev:web' : manifest.scripts?.dev ? 'dev' : undefined
    const nativeScript = manifest.scripts?.['dev:native'] ? 'dev:native' : undefined
    const target = (enabled: boolean, script: string | undefined) => ({
      enabled: enabled && Boolean(script),
      script,
      reason: !enabled ? '项目未启用此目标。' : !script ? '项目缺少对应的开发启动脚本。' : undefined,
    })
    const snapshot: EditorProject = {
      pluginProject: plugin,
      devtools: this.pluginRoot === canonicalRoot ? this.devtools : [],
      plugins: await inspectEditorPlugins({ root: canonicalRoot, entries: sources.entries, readDocument: (path) => {
        if (!sources.files.includes(path))
          throw new Error('未索引的源文件。')
        return readProjectDocument(canonicalRoot, path)
      } }, this.pluginRoot === canonicalRoot ? this.pluginIndexers : []),
      root: canonicalRoot,
      name: config.name,
      bundleId: config.bundleId,
      files: sources.files,
      entries: sources.entries,
      directories: sources.directories.map(path => relative(canonicalRoot, path).replaceAll('\\', '/')),
      targets: { web: target(config.targets.web.enabled, webScript), native: target(Boolean(config.targets.native?.enabled), nativeScript) },
      story: createStoryOutline(inspection?.storyTree.outline ?? [], canonicalRoot),
      diagnostics: plugin?.error
        ? [{ code: 'EDITOR_PLUGIN_METADATA', message: plugin.error, severity: 'error' }]
        : (inspection?.risks ?? []).map(risk => ({
            code: risk.code,
            message: risk.message,
            severity: risk.severity,
            filePath: risk.filePath,
            line: risk.range ? risk.range.start.line + 1 : undefined,
            column: risk.range ? risk.range.start.column + 1 : undefined,
            endLine: risk.range ? risk.range.end.line + 1 : undefined,
            endColumn: risk.range ? risk.range.end.column + 1 : undefined,
          })),
    }
    if (sources.truncated)
      snapshot.diagnostics.push({ code: 'EDITOR_INDEX_LIMIT', severity: 'warning', message: '项目索引达到 20000 个文件、1024 个目录或 10 层深度上限，部分内容未列出或监听。' })
    this.root = canonicalRoot
    this.snapshot = snapshot
    this.watchDirectories = sources.directories
    return snapshot
  }

  async refresh(): Promise<EditorProject> {
    if (!this.root || !this.snapshot)
      throw new Error('请先打开项目。')
    try {
      return await this.open(this.root)
    }
    catch (error) {
      const reason = `项目刷新失败：${error instanceof Error ? error.message : String(error)}`
      const sources = await listSourceFiles(this.root).catch(() => undefined)
      this.analyses.clear()
      this.typescriptSession.dispose()
      if (sources)
        this.watchDirectories = sources.directories
      this.snapshot = {
        ...this.snapshot,
        plugins: {},
        devtools: [],
        ...(sources ? { files: sources.files, entries: sources.entries, directories: sources.directories.map(path => relative(this.root!, path).replaceAll('\\', '/')) } : {}),
        diagnostics: [{ code: 'EDITOR_PROJECT_REFRESH', severity: 'error', message: reason }],
        targets: { web: { enabled: false, reason }, native: { enabled: false, reason } },
      }
      return this.snapshot
    }
  }

  current(): EditorProject | undefined {
    return this.snapshot
  }

  async fileOperation(root: string, operation: EditorFileOperation): Promise<void> {
    if (!this.snapshot || root !== this.root)
      throw new Error('项目已切换。')
    await operateFiles(this.snapshot, operation)
  }

  async mutationPath(root: string, path: string): Promise<string> {
    if (!this.snapshot || root !== this.root)
      throw new Error('项目已切换。')
    return operationSource(this.snapshot, path)
  }

  async thumbnail(root: string, path: string, preview = false): Promise<Uint8Array> {
    if (!this.root || root !== this.root)
      throw new Error('项目已切换。')
    const entry = this.snapshot?.entries.find(entry => entry.path === path)
    if (entry?.kind !== 'image' || entry.size > 32 * 1024 * 1024)
      throw new Error('图片无法生成缩略图或超过 32 MB。')
    const canonical = await projectPath(root, path)
    const { default: sharp } = await import('sharp')
    sharp.cache({ memory: 16, files: 0, items: 32 })
    sharp.concurrency(2)
    return sharp(await readFile(canonical), { limitInputPixels: 40_000_000, animated: false }).rotate().resize(preview ? 1280 : 160, preview ? 900 : 120, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  }

  async imageMetadata(root: string, path: string): Promise<EditorImageMetadata> {
    if (!this.root || root !== this.root)
      throw new Error('项目已切换。')
    const entry = this.snapshot?.entries.find(entry => entry.path === path)
    if (entry?.kind !== 'image' || entry.size > 32 * 1024 * 1024)
      throw new Error('图片不可读取或超过 32 MB 上限。')
    const canonical = await projectPath(root, path)
    const { default: sharp } = await import('sharp')
    const metadata = await sharp(canonical, { limitInputPixels: 40_000_000, animated: false }).metadata()
    const width = metadata.width
    const height = metadata.pageHeight ?? metadata.height
    if (!width || !height || !metadata.format)
      throw new Error('无法读取原图尺寸。')
    const rotated = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8
    return { width: rotated ? height : width, height: rotated ? width : height, format: metadata.format, hasAlpha: metadata.hasAlpha }
  }

  async importAssets(root: string, directory: string, sources: string[]) {
    if (!this.root || root !== this.root)
      throw new Error('项目已切换。')
    return importAssetFiles(root, directory, sources)
  }

  async read(path: string): Promise<EditorDocument> {
    if (!this.root)
      throw new Error('请先打开项目。')
    return readProjectDocument(this.root, path)
  }

  async save(document: EditorDocument): Promise<EditorDocument> {
    if (typeof document.text !== 'string' || Buffer.byteLength(document.text) > MAX_DOCUMENT_BYTES)
      throw new Error('文档超过 2 MB 编辑上限。')
    const current = await this.read(document.path)
    if (current.revision !== document.revision)
      throw new Error('文件已被外部修改，请比较磁盘版本后处理；当前编辑内容仍保留。')
    const temporary = join(dirname(current.path), `.qua-editor-${randomUUID()}.tmp`)
    try {
      const metadata = await stat(current.path)
      await writeFile(temporary, document.text, { flag: 'wx', mode: metadata.mode })
      const latest = await this.read(current.path)
      if (latest.revision !== current.revision)
        throw new Error('保存期间文件发生外部修改，请重新比较磁盘版本。')
      await rename(temporary, current.path)
    }
    finally {
      await rm(temporary, { force: true })
    }
    return { path: current.path, text: document.text, revision: revision(Buffer.from(document.text)) }
  }

  async analyze(path: string, text: string): Promise<EditorAnalysis> {
    const filePath = await this.documentPath(path)
    if (!filePath.endsWith('.qs'))
      return { diagnostics: await this.languages.diagnostics(filePath, text), dialogueHighlights: [], previewSteps: [] }
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_DOCUMENT_BYTES)
      throw new Error('文档超过 2 MB 编辑上限。')
    const options = this.languageOptions(filePath)
    const key = `${filePath}:${revision(Buffer.from(text))}:${JSON.stringify(options.toolingConfig)}`
    const cached = this.analyses.get(key)
    if (cached)
      return cached
    const analysis = await analyzeQuaScript(text, { ...options, authoring: true })
    const result: EditorAnalysis = {
      authoring: analysis.authoring,
      previewSteps: analysis.previewSteps.map(step => ({ index: step.index, line: step.range.start.line + 1, endLine: step.range.end.line + 1 })),
      diagnostics: analysis.diagnostics.map(diagnostic => editorDiagnostic(diagnostic, filePath)),
      dialogueHighlights: analysis.dialogueHighlights.map(item => ({ character: item.character, speaker: editorRange(item.speaker), text: item.text.map(editorRange) })),
    }
    this.analyses.set(key, result)
    while (this.analyses.size > 32) this.analyses.delete(this.analyses.keys().next().value!)
    return result
  }

  async* checkProject(root: string): AsyncGenerator<EditorProjectCheck> {
    if (!this.snapshot || root !== this.root)
      throw new Error('项目已切换。')
    const files = this.snapshot.files.filter(path => path.endsWith('.qs'))
    const lintFiles = this.snapshot.entries.filter(entry => entry.kind === 'document' && entry.size <= MAX_DOCUMENT_BYTES && eslintSource(entry.path))
    const linter = new ProjectESLint(root)
    const state: EditorProjectCheck = { root, phase: 'checking', completed: 0, total: files.length + lintFiles.length + 1, diagnostics: [] }
    yield { ...state }
    for (const file of files) {
      try {
        const document = await this.read(file)
        state.diagnostics.push(...(await this.analyze(document.path, document.text)).diagnostics)
      }
      catch (error) {
        state.diagnostics.push({ code: 'EDITOR_CHECK_FILE', severity: 'error', filePath: join(root, file), message: String(error).replace(/^Error: /, '') })
      }
      state.completed++
      yield { ...state, diagnostics: [...state.diagnostics] }
    }
    state.diagnostics.push(...checkTypeScriptProject(root).map(diagnostic => editorDiagnostic(diagnostic, diagnostic.filePath)))
    state.completed++
    yield { ...state, diagnostics: [...state.diagnostics] }
    for (const file of lintFiles) {
      try {
        const document = await this.read(file.path)
        state.diagnostics.push(...await linter.analyze(document.path, document.text))
      }
      catch (error) {
        state.diagnostics.push({ code: 'ESLint/read', severity: 'warning', filePath: join(root, file.path), message: String(error) })
      }
      state.completed++
      yield { ...state, diagnostics: [...state.diagnostics] }
    }
    yield { ...state, completed: state.total, phase: 'complete' }
  }

  async complete(request: EditorLanguageRequest) {
    if (!request.path.endsWith('.qs'))
      return this.languages.complete(request)
    const options = await this.languageRequest(request)
    const items = await getQuaScriptCompletions(request.text, { line: request.position.line - 1, character: request.position.column - 1 }, options)
    return items.map(item => ({ ...item, range: item.range ? editorRange(item.range) : undefined }))
  }

  async signature(request: EditorLanguageRequest) {
    const options = await this.languageRequest(request)
    if (!request.path.endsWith('.qs'))
      return undefined
    return getQuaScriptSignatureHelp(request.text, { line: request.position.line - 1, character: request.position.column - 1 }, options)
  }

  async hover(request: EditorLanguageRequest) {
    if (!request.path.endsWith('.qs'))
      return this.languages.hover(request)
    const options = await this.languageRequest(request)
    const hover = await getQuaScriptHover(request.text, { line: request.position.line - 1, character: request.position.column - 1 }, options)
    return hover ? { contents: hover.contents, range: hover.range ? editorRange(hover.range) : undefined } : undefined
  }

  async define(request: EditorLanguageRequest): Promise<EditorDefinition[]> {
    if (!request.path.endsWith('.qs'))
      return this.languages.define(request)
    const options = await this.languageRequest(request)
    const definitions = await getQuaScriptDefinitions(request.text, { line: request.position.line - 1, character: request.position.column - 1 }, options)
    const result: EditorDefinition[] = []
    for (const definition of definitions) {
      try {
        // Navigation has the same source-file boundary as manual file access.
        const path = await this.documentPath(definition.filePath || options.filePath)
        result.push({ path, range: editorRange(definition.range) })
      }
      catch {
        // External dependencies and generated files are not editable in this workbench.
      }
    }
    return result
  }

  async format(path: string, text: string, formattingOptions?: { tabSize: number, insertSpaces: boolean }) {
    if (!path.endsWith('.qs'))
      return this.languages.format(path, text, formattingOptions)
    const options = await this.languageRequest({ path, text, position: { line: 1, column: 1 } })
    return formatQuaScriptDocumentEdits(text, options).map(edit => ({ range: editorRange(edit.range), newText: edit.newText }))
  }

  private languageOptions(filePath: string) {
    return { projectRoot: this.root, filePath, toolingConfig: loadQuaScriptToolingConfig(this.root), typescriptSession: this.typescriptSession, extraFiles: this.sourceLanguages?.extraFiles }
  }

  private async languageRequest(request: EditorLanguageRequest) {
    if (!request || typeof request.text !== 'string' || Buffer.byteLength(request.text) > MAX_DOCUMENT_BYTES)
      throw new Error('无效文档或文档超过 2 MB 编辑上限。')
    const filePath = await this.documentPath(request.path)
    if (!filePath.endsWith('.qs'))
      throw new Error('QuaScript 语言服务仅用于 .qs 文件。')
    const { line, column } = request.position || {}
    const lines = request.text.split(/\r?\n/)
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1 || line > lines.length || column > lines[line - 1].length + 1)
      throw new Error('无效的文档位置。')
    return this.languageOptions(filePath)
  }

  private async documentPath(path: string): Promise<string> {
    if (!this.root)
      throw new Error('请先打开项目。')
    return resolveDocumentPath(this.root, path)
  }
}
function editorDiagnostic(diagnostic: QuaScriptDiagnostic, filePath?: string): EditorDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    filePath,
    line: diagnostic.range ? diagnostic.range.start.line + 1 : undefined,
    column: diagnostic.range ? diagnostic.range.start.column + 1 : undefined,
    endLine: diagnostic.range ? diagnostic.range.end.line + 1 : undefined,
    endColumn: diagnostic.range ? diagnostic.range.end.column + 1 : undefined,
  }
}
function revision(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
function editorRange(range: SourceRange): EditorRange {
  return {
    start: { line: range.start.line + 1, column: range.start.column + 1 },
    end: { line: range.end.line + 1, column: range.end.column + 1 },
  }
}
