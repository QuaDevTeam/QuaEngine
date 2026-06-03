import type {
  QuaAssetLineageRef,
  QuaPackageHealthPackageRef,
  QuaProjectInspector,
  QuaProjectInspectorSnapshot,
  QuaRuntimePackageRef,
  QuaStoryEntryRef,
  QuaStoryLabelRef,
  QuaStoryNodeRef,
  QuaStoryPointInspection,
  QuaStorySceneRef,
  StoryTargetData,
} from '@quajs/project-inspector'
import type { ExtensionContext, Webview } from 'vscode'
import { createQuaProjectInspector } from '@quajs/project-inspector'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

type LzmaNative = typeof import('lzma-native')
type QuaScriptRuleSeverity = 'error' | 'info' | 'off' | 'warning'

interface QuaScriptClientSettings {
  decorators?: {
    autoCollect?: boolean
    mappings?: Record<string, {
      function: string
      module: string
    }>
  }
  files?: {
    exclude?: string[]
    include?: string[]
  }
  format?: {
    enable?: boolean
    insertFinalNewline?: boolean
    maxBlankLines?: number
  }
  lint?: {
    enable?: boolean
    rules?: Record<string, QuaScriptRuleSeverity>
  }
}

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath('server/server.js')
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

  client = startQuaScriptLanguageClient(serverModule, projectRoot)
  const inspectorService = new QuaProjectInspectorService(projectRoot)
  const storyTreeProvider = new StoryTreeProvider(inspectorService)
  const qpkProvider = new QpkExplorerProvider(inspectorService)
  const assetLineageProvider = new AssetLineageProvider(inspectorService)
  const storyInspectorProvider = new StoryPointInspectorProvider(context.extensionUri, inspectorService)
  const packageHealthProvider = new PackageHealthProvider(context.extensionUri, inspectorService)

  const storyTree = vscode.window.createTreeView('quascript.storyTree', { treeDataProvider: storyTreeProvider, showCollapseAll: true })
  const qpkTree = vscode.window.createTreeView('quascript.qpkExplorer', { treeDataProvider: qpkProvider, showCollapseAll: true })
  const assetLineageTree = vscode.window.createTreeView('quascript.assetLineage', { treeDataProvider: assetLineageProvider, showCollapseAll: true })

  const refresh = async () => {
    await inspectorService.refresh()
    storyTreeProvider.refresh()
    qpkProvider.refresh()
    assetLineageProvider.refresh()
    storyInspectorProvider.refresh()
    packageHealthProvider.refresh()
  }
  const inspectorWatcher = vscode.workspace.createFileSystemWatcher('**/*.{qs,json,qpk}')
  const scheduleRefresh = () => inspectorService.scheduleRefresh(refresh)

  context.subscriptions.push(
    storyTree,
    qpkTree,
    assetLineageTree,
    vscode.window.registerWebviewViewProvider('quascript.storyPointInspector', storyInspectorProvider),
    vscode.window.registerWebviewViewProvider('quascript.packageHealth', packageHealthProvider),
    vscode.commands.registerCommand('quascript.formatDocument', async () => {
      await vscode.commands.executeCommand('editor.action.formatDocument')
    }),
    vscode.commands.registerCommand('quascript.fixAll', async () => {
      await vscode.commands.executeCommand('editor.action.codeAction', {
        apply: 'first',
        kind: 'source.fixAll.quascript',
      })
    }),
    vscode.commands.registerCommand('quascript.restartLanguageServer', async () => {
      await restartQuaScriptLanguageClient(serverModule, projectRoot)
      vscode.window.showInformationMessage('QuaScript language server restarted.')
    }),
    vscode.commands.registerCommand('quascript.refreshInspector', refresh),
    vscode.commands.registerCommand('quascript.openStoryGraph', () => openStoryGraph(context.extensionUri, inspectorService, storyInspectorProvider)),
    vscode.commands.registerCommand('quascript.inspectStoryPoint', async (item?: InspectorTreeItem) => {
      const ref = item?.storyPointRef
      if (ref) {
        storyInspectorProvider.inspect(ref)
      }
    }),
    vscode.commands.registerCommand('quascript.revealPackage', async (item?: InspectorTreeItem) => {
      const packageId = item?.packageId
      const packageTreeItem = packageId ? qpkProvider.packageTreeItem(packageId) : undefined
      if (packageTreeItem) {
        await qpkTree.reveal(packageTreeItem, { expand: true, focus: true, select: true })
      }
    }),
    vscode.commands.registerCommand('quascript.filterToPackage', async (item?: InspectorTreeItem) => {
      if (item?.packageId) {
        await storyTreeProvider.setPackageFilter(item.packageId)
      }
    }),
    vscode.commands.registerCommand('quascript.clearPackageFilter', async () => {
      await storyTreeProvider.setPackageFilter(undefined)
    }),
    vscode.commands.registerCommand('quascript.openSource', async (item?: InspectorTreeItem) => {
      if (item?.source) {
        await openSource(item.source)
      }
    }),
    vscode.commands.registerCommand('quascript.copyRef', async (item?: InspectorTreeItem) => {
      await vscode.env.clipboard.writeText(item?.refText || item?.labelText || '')
    }),
    inspectorWatcher,
    inspectorWatcher.onDidChange(scheduleRefresh),
    inspectorWatcher.onDidCreate(scheduleRefresh),
    inspectorWatcher.onDidDelete(scheduleRefresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('quascript')) {
        sendQuaScriptConfiguration()
      }
    }),
    {
      dispose: () => {
        client?.stop()
      },
    },
  )

  refresh().catch(error => vscode.window.showWarningMessage(`QuaScript inspector refresh failed: ${String(error)}`))
}

export function deactivate(): Thenable<void> | undefined {
  const activeClient = client
  client = undefined
  return activeClient?.stop()
}

function startQuaScriptLanguageClient(serverModule: string, projectRoot: string | undefined): LanguageClient {
  const nextClient = new LanguageClient(
    'quascript',
    'QuaScript',
    {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
      },
      debug: {
        module: serverModule,
        options: {
          execArgv: ['--nolazy', '--inspect=6009'],
        },
        transport: TransportKind.ipc,
      },
    },
    {
      documentSelector: [
        {
          language: 'quascript',
          scheme: 'file',
        },
      ],
      initializationOptions: {
        projectRoot,
        quascript: getQuaScriptSettings(),
      },
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{qs,ts,tsx,js,jsx,json}'),
      },
    },
  )
  nextClient.start().catch(error => vscode.window.showWarningMessage(`QuaScript language server failed to start: ${String(error)}`))
  return nextClient
}

async function restartQuaScriptLanguageClient(serverModule: string, projectRoot: string | undefined): Promise<void> {
  const activeClient = client
  client = undefined
  await activeClient?.stop()
  client = startQuaScriptLanguageClient(serverModule, projectRoot)
}

function sendQuaScriptConfiguration(): void {
  client?.sendNotification('workspace/didChangeConfiguration', {
    settings: {
      quascript: getQuaScriptSettings(),
    },
  }).catch(error => vscode.window.showWarningMessage(`QuaScript configuration sync failed: ${String(error)}`))
}

function getQuaScriptSettings(): QuaScriptClientSettings {
  const configuration = vscode.workspace.getConfiguration('quascript')
  const decorators: NonNullable<QuaScriptClientSettings['decorators']> = {}
  const files: NonNullable<QuaScriptClientSettings['files']> = {}
  const format: NonNullable<QuaScriptClientSettings['format']> = {}
  const lint: NonNullable<QuaScriptClientSettings['lint']> = {}

  setExplicitConfigurationValue(configuration, 'decorators.autoCollect', decorators, 'autoCollect')
  setExplicitConfigurationValue(configuration, 'decorators.mappings', decorators, 'mappings')
  setExplicitConfigurationValue(configuration, 'files.exclude', files, 'exclude')
  setExplicitConfigurationValue(configuration, 'files.include', files, 'include')
  setExplicitConfigurationValue(configuration, 'format.enable', format, 'enable')
  setExplicitConfigurationValue(configuration, 'format.insertFinalNewline', format, 'insertFinalNewline')
  setExplicitConfigurationValue(configuration, 'format.maxBlankLines', format, 'maxBlankLines')
  setExplicitConfigurationValue(configuration, 'lint.enable', lint, 'enable')
  setExplicitConfigurationValue(configuration, 'lint.rules', lint, 'rules')

  return {
    ...(Object.keys(decorators).length > 0 ? { decorators } : {}),
    ...(Object.keys(files).length > 0 ? { files } : {}),
    ...(Object.keys(format).length > 0 ? { format } : {}),
    ...(Object.keys(lint).length > 0 ? { lint } : {}),
  }
}

function setExplicitConfigurationValue<TTarget extends object, TKey extends keyof TTarget>(
  configuration: vscode.WorkspaceConfiguration,
  section: string,
  target: TTarget,
  key: TKey,
): void {
  const inspection = configuration.inspect<TTarget[TKey]>(section)
  const value = inspection?.workspaceFolderLanguageValue
    ?? inspection?.workspaceLanguageValue
    ?? inspection?.globalLanguageValue
    ?? inspection?.workspaceFolderValue
    ?? inspection?.workspaceValue
    ?? inspection?.globalValue

  if (value !== undefined) {
    target[key] = value as TTarget[TKey]
  }
}

class QuaProjectInspectorService {
  private inspector: QuaProjectInspector
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private snapshot: QuaProjectInspectorSnapshot | undefined

  constructor(private readonly projectRoot: string | undefined) {
    this.inspector = createQuaProjectInspector({
      projectRoot,
      qpkReader: {
        decompressLzma,
      },
    })
  }

  getInspector(): QuaProjectInspector {
    return this.inspector
  }

  getSnapshot(): QuaProjectInspectorSnapshot | undefined {
    return this.snapshot
  }

  async refresh(): Promise<QuaProjectInspectorSnapshot> {
    this.snapshot = await this.inspector.refresh({ projectRoot: this.projectRoot })
    return this.snapshot
  }

  scheduleRefresh(callback: () => Promise<void>): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      callback().catch(error => vscode.window.showWarningMessage(`QuaScript inspector refresh failed: ${String(error)}`))
    }, 250)
  }
}

async function decompressLzma(data: Buffer): Promise<Buffer | Uint8Array> {
  const lzma = await import('lzma-native') as LzmaNative
  return lzma.decompress(data)
}

class StoryTreeProvider implements vscode.TreeDataProvider<InspectorTreeItem> {
  private readonly changed = new vscode.EventEmitter<InspectorTreeItem | undefined | null | void>()
  private packageFilter: string | undefined
  readonly onDidChangeTreeData = this.changed.event

  constructor(private readonly service: QuaProjectInspectorService) {}

  getChildren(element?: InspectorTreeItem): InspectorTreeItem[] {
    const snapshot = this.service.getSnapshot()
    if (!snapshot) {
      return [new InspectorTreeItem('Loading story tree', 'loading', vscode.TreeItemCollapsibleState.None, { icon: 'sync~spin' })]
    }
    if (element) {
      return element.children || []
    }
    const packageItems = snapshot.storyTree.packages
      .filter(packageRef => !this.packageFilter || packageRef.id === this.packageFilter)
      .map(packageRef => new InspectorTreeItem(
        packageRef.id,
        'package',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          description: packageRef.version,
          icon: packageRef.locked ? 'lock' : 'package',
          packageId: packageRef.id,
          refText: packageRef.id,
          source: packageRef.sourcePath ? { filePath: packageRef.sourcePath } : undefined,
        },
        this.sceneItems(snapshot, packageRef.id),
      ))
    const baseScenes = this.packageFilter ? [] : this.sceneItems(snapshot, undefined)
    if (packageItems.length === 0 && baseScenes.length === 0) {
      return [new InspectorTreeItem('No story declarations found', 'empty', vscode.TreeItemCollapsibleState.None, { icon: 'info' })]
    }
    return [
      ...baseScenes,
      ...packageItems,
    ]
  }

  getTreeItem(element: InspectorTreeItem): vscode.TreeItem {
    return element
  }

  refresh(): void {
    this.changed.fire()
  }

  async setPackageFilter(packageId: string | undefined): Promise<void> {
    this.packageFilter = packageId
    await vscode.commands.executeCommand('setContext', 'quascript.packageFilterActive', Boolean(packageId))
    this.refresh()
  }

  private sceneItems(snapshot: QuaProjectInspectorSnapshot, packageId: string | undefined): InspectorTreeItem[] {
    const scenes = uniqueBy(snapshot.storyTree.scenes
      .filter(scene => packageId === undefined ? hasBaseScene(snapshot, scene.id) : hasScenePackage(snapshot, scene.id, packageId)), scene => scene.id)
    return scenes.map(scene => new InspectorTreeItem(
      scene.id,
      'scene',
      vscode.TreeItemCollapsibleState.Collapsed,
      {
        icon: 'symbol-namespace',
        packageId,
        refText: `scene:${scene.id}`,
        source: sourceFrom(scene),
      },
      this.sceneChildren(snapshot, scene, packageId),
    ))
  }

  private sceneChildren(snapshot: QuaProjectInspectorSnapshot, scene: QuaStorySceneRef, packageId: string | undefined): InspectorTreeItem[] {
    const entries = snapshot.storyTree.entries
      .filter(entry => entry.sceneId === scene.id && (!packageId || entry.packageId === packageId))
      .map(entry => this.entryItem(snapshot, entry))
    const nodes = snapshot.storyTree.nodes
      .filter(node => node.sceneId === scene.id && (!packageId || node.packageId === packageId))
      .map(node => this.nodeItem(snapshot, node))
    const labels = snapshot.storyTree.labels
      .filter(label => label.sceneId === scene.id && (!packageId || label.packageId === packageId))
      .map(label => this.labelItem(label))
    return [...entries, ...nodes, ...labels]
  }

  private entryItem(_snapshot: QuaProjectInspectorSnapshot, entry: QuaStoryEntryRef): InspectorTreeItem {
    return new InspectorTreeItem(entry.id, 'entry', vscode.TreeItemCollapsibleState.None, {
      description: entry.packageId,
      icon: 'debug-start',
      packageId: entry.packageId,
      refText: `entry:${entry.id}`,
      source: sourceFrom(entry),
      storyPointRef: { entryId: entry.id, packageId: entry.packageId, sceneId: entry.sceneId, sourcePath: entry.sourceLocation?.filePath },
      tooltip: markdownTooltip('Entry', entry.id, entry.packageId, entry.sourceLocation?.filePath),
    })
  }

  private nodeItem(snapshot: QuaProjectInspectorSnapshot, node: QuaStoryNodeRef): InspectorTreeItem {
    const chapterSelectable = Boolean((node as QuaStoryNodeRef & { chapterSelectable?: boolean }).chapterSelectable)
    const riskCount = snapshot.risks.filter(risk => risk.targetId === node.id || risk.packageId === node.packageId).length
    return new InspectorTreeItem(node.id, 'node', vscode.TreeItemCollapsibleState.Collapsed, {
      description: [node.packageId, chapterSelectable ? 'chapter' : undefined, riskCount > 0 ? `${riskCount} risk` : undefined].filter(Boolean).join(' '),
      icon: riskCount > 0 ? 'warning' : chapterSelectable ? 'bookmark' : 'circle-large-outline',
      packageId: node.packageId,
      refText: node.packageId ? `${node.packageId}#${node.id}` : node.id,
      source: sourceFrom(node),
      storyPointRef: { nodeId: node.id, packageId: node.packageId, sceneId: node.sceneId, sourcePath: node.sourceLocation?.filePath },
      tooltip: markdownTooltip('Story Node', node.id, node.packageId, node.sourceLocation?.filePath),
    }, nodeChoiceItems(snapshot, node))
  }

  private labelItem(label: QuaStoryLabelRef): InspectorTreeItem {
    return new InspectorTreeItem(label.id, 'label', vscode.TreeItemCollapsibleState.None, {
      description: label.nodeId,
      icon: 'tag',
      packageId: label.packageId,
      refText: `#${label.id}`,
      source: sourceFrom(label),
      storyPointRef: { labelId: label.id, packageId: label.packageId, sceneId: label.sceneId, sourcePath: label.sourceLocation?.filePath },
      tooltip: markdownTooltip('Label', label.id, label.packageId, label.sourceLocation?.filePath),
    })
  }
}

class QpkExplorerProvider implements vscode.TreeDataProvider<InspectorTreeItem> {
  private readonly changed = new vscode.EventEmitter<InspectorTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this.changed.event

  constructor(private readonly service: QuaProjectInspectorService) {}

  getChildren(element?: InspectorTreeItem): InspectorTreeItem[] {
    const snapshot = this.service.getSnapshot()
    if (!snapshot) {
      return [new InspectorTreeItem('Loading packages', 'loading', vscode.TreeItemCollapsibleState.None, { icon: 'sync~spin' })]
    }
    if (element) {
      return element.children || []
    }
    if (snapshot.packageGraph.packages.length === 0) {
      return [new InspectorTreeItem('No runtime packages found', 'empty', vscode.TreeItemCollapsibleState.None, { icon: 'info' })]
    }
    return snapshot.packageGraph.packages.map(packageRef => packageItem(packageRef))
  }

  getTreeItem(element: InspectorTreeItem): vscode.TreeItem {
    return element
  }

  refresh(): void {
    this.changed.fire()
  }

  packageTreeItem(packageId: string): InspectorTreeItem | undefined {
    const snapshot = this.service.getSnapshot()
    const packageRef = snapshot?.packageGraph.packages.find(item => item.id === packageId)
    return packageRef ? packageItem(packageRef) : undefined
  }
}

class AssetLineageProvider implements vscode.TreeDataProvider<InspectorTreeItem> {
  private readonly changed = new vscode.EventEmitter<InspectorTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this.changed.event

  constructor(private readonly service: QuaProjectInspectorService) {}

  getChildren(element?: InspectorTreeItem): InspectorTreeItem[] {
    const snapshot = this.service.getSnapshot()
    if (!snapshot) {
      return [new InspectorTreeItem('Loading asset lineage', 'loading', vscode.TreeItemCollapsibleState.None, { icon: 'sync~spin' })]
    }
    if (element) {
      return element.children || []
    }
    if (snapshot.assetLineage.assets.length === 0) {
      return [new InspectorTreeItem('No asset references found', 'empty', vscode.TreeItemCollapsibleState.None, { icon: 'info' })]
    }
    return assetPackageItems(snapshot)
  }

  getTreeItem(element: InspectorTreeItem): vscode.TreeItem {
    return element
  }

  refresh(): void {
    this.changed.fire()
  }
}

class StoryPointInspectorProvider implements vscode.WebviewViewProvider {
  private currentInspection: QuaStoryPointInspection | undefined
  private view: vscode.WebviewView | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: QuaProjectInspectorService,
  ) {}

  inspect(ref: Parameters<QuaProjectInspector['inspectStoryPoint']>[0]): void {
    this.currentInspection = this.service.getInspector().inspectStoryPoint(ref)
    this.refresh()
  }

  refresh(): void {
    if (!this.view) {
      return
    }
    this.view.webview.html = renderInspectorHtml(this.view.webview, this.extensionUri, this.currentInspection)
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: false,
    }
    this.refresh()
  }
}

class PackageHealthProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: QuaProjectInspectorService,
  ) {}

  refresh(): void {
    if (!this.view) {
      return
    }
    this.view.webview.html = renderPackageHealthHtml(this.view.webview, this.extensionUri, this.service.getSnapshot())
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: false,
    }
    this.refresh()
  }
}

class InspectorTreeItem extends vscode.TreeItem {
  readonly labelText: string
  readonly packageId?: string
  readonly refText?: string
  readonly source?: { filePath: string, range?: import('@quajs/project-inspector').SourceRange }
  readonly storyPointRef?: Parameters<QuaProjectInspector['inspectStoryPoint']>[0]

  constructor(
    label: string,
    public readonly kind: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options: {
      command?: vscode.Command
      description?: string
      icon?: string
      packageId?: string
      refText?: string
      source?: { filePath: string, range?: import('@quajs/project-inspector').SourceRange }
      storyPointRef?: Parameters<QuaProjectInspector['inspectStoryPoint']>[0]
      tooltip?: vscode.MarkdownString
    } = {},
    readonly children?: InspectorTreeItem[],
  ) {
    super(label, collapsibleState)
    this.labelText = label
    this.id = `${kind}:${options.refText || label}:${options.source?.filePath || ''}`
    this.description = options.description
    this.iconPath = options.icon ? new vscode.ThemeIcon(options.icon) : undefined
    this.command = options.command ?? (options.storyPointRef
      ? {
          command: 'quascript.inspectStoryPoint',
          title: 'Inspect Story Point',
          arguments: [this],
        }
      : undefined)
    this.contextValue = kind
    this.packageId = options.packageId
    this.refText = options.refText
    this.source = options.source
    this.storyPointRef = options.storyPointRef
    this.tooltip = options.tooltip
  }
}

function packageItem(packageRef: QuaRuntimePackageRef): InspectorTreeItem {
  const children = [
    groupItem('Dependencies', 'references', packageRef.dependencies.map(dependency => new InspectorTreeItem(dependency, 'dependency', vscode.TreeItemCollapsibleState.None, { icon: 'link', packageId: packageRef.id, refText: dependency })), packageRef.id),
    groupItem('Scripts', 'symbol-method', packageRef.scripts.map(script => recordItem(script, 'script', 'file-code', packageRef.id)), packageRef.id),
    groupItem('Scenes', 'symbol-namespace', packageRef.scenes.map(scene => recordItem(scene, 'scene', 'symbol-namespace', packageRef.id)), packageRef.id),
    groupItem('Plugins', 'extensions', packageRef.plugins.map(plugin => recordItem(plugin, 'plugin', 'plug', packageRef.id)), packageRef.id),
    groupItem('Migrations', 'database', packageRef.migrations.map(migration => recordItem(migration, 'migration', 'database', packageRef.id)), packageRef.id),
    groupItem('Assets', 'files', packageRef.assets.map(asset => new InspectorTreeItem(asset.name, 'asset', vscode.TreeItemCollapsibleState.None, {
      description: [asset.type, asset.size ? formatBytes(asset.size) : undefined].filter(Boolean).join(' '),
      icon: 'file-media',
      packageId: packageRef.id,
      refText: `${asset.type}:${asset.name}`,
    })), packageRef.id),
  ].filter(item => item.children && item.children.length > 0)

  return new InspectorTreeItem(packageRef.id, 'package', vscode.TreeItemCollapsibleState.Collapsed, {
    description: [packageRef.version, packageRef.locked ? 'locked' : undefined, packageRef.risks.length > 0 ? `${packageRef.risks.length} risk` : undefined].filter(Boolean).join(' '),
    icon: packageRef.locked ? 'lock' : packageRef.risks.length > 0 ? 'warning' : 'package',
    packageId: packageRef.id,
    refText: packageRef.id,
    source: packageRef.sourcePath ? { filePath: packageRef.sourcePath } : undefined,
    tooltip: markdownTooltip('Runtime Package', packageRef.id, packageRef.version, packageRef.sourcePath),
  }, children)
}

function assetPackageItems(snapshot: QuaProjectInspectorSnapshot): InspectorTreeItem[] {
  const assetsByPackage = groupBy(snapshot.assetLineage.assets, asset => asset.packageId || 'base')
  return Array.from(assetsByPackage.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([packageId, assets]) => {
      const missingCount = assets.filter(asset => asset.status === 'missing').length
      const children = Array.from(groupBy(assets, asset => asset.type).entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, typeAssets]) => groupItem(
          type,
          'folder',
          typeAssets
            .slice()
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(assetLineageItem),
          packageId === 'base' ? undefined : packageId,
        ))
      return new InspectorTreeItem(packageId, 'assetPackage', vscode.TreeItemCollapsibleState.Collapsed, {
        description: [assets.length === 1 ? '1 ref' : `${assets.length} refs`, missingCount > 0 ? `${missingCount} missing` : undefined].filter(Boolean).join(' '),
        icon: missingCount > 0 ? 'warning' : packageId === 'base' ? 'folder' : 'package',
        packageId: packageId === 'base' ? undefined : packageId,
        refText: packageId,
      }, children)
    })
}

function assetLineageItem(asset: QuaAssetLineageRef): InspectorTreeItem {
  const source = asset.sourceLocation?.filePath ? { filePath: asset.sourceLocation.filePath, range: asset.sourceLocation.range } : undefined
  const description = [
    asset.sourceKind,
    asset.field,
    asset.status === 'missing' ? 'missing' : undefined,
  ].filter(Boolean).join(' ')
  return new InspectorTreeItem(asset.name, 'assetLineage', vscode.TreeItemCollapsibleState.None, {
    command: source
      ? {
          command: 'quascript.openSource',
          title: 'Open Source',
          arguments: [{ source }],
        }
      : undefined,
    description,
    icon: asset.status === 'missing' ? 'error' : asset.status === 'present' ? 'pass' : 'file-media',
    packageId: asset.packageId,
    refText: `${asset.packageId || 'base'}:${asset.type}:${asset.name}`,
    source,
    tooltip: assetLineageTooltip(asset),
  })
}

function groupItem(label: string, icon: string, children: InspectorTreeItem[], packageId?: string): InspectorTreeItem {
  return new InspectorTreeItem(label, 'group', vscode.TreeItemCollapsibleState.Collapsed, { icon, packageId }, children)
}

function recordItem(record: Record<string, unknown>, kind: string, icon: string, packageId?: string): InspectorTreeItem {
  const id = typeof record.id === 'string' ? record.id : kind
  const version = typeof record.version === 'string' ? record.version : undefined
  return new InspectorTreeItem(id, kind, vscode.TreeItemCollapsibleState.None, {
    description: version,
    icon,
    packageId,
    refText: id,
    tooltip: new vscode.MarkdownString(`\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``),
  })
}

function nodeChoiceItems(snapshot: QuaProjectInspectorSnapshot, node: QuaStoryNodeRef): InspectorTreeItem[] {
  return snapshot.storyTree.choices
    .filter(choice => choice.point?.nodeId === node.id || choice.point?.stepId === node.point?.stepId)
    .map(choice => new InspectorTreeItem(choice.text, 'choice', vscode.TreeItemCollapsibleState.None, {
      description: choice.target ? targetLabel(choice.target) : undefined,
      icon: 'arrow-right',
      refText: choice.id,
      source: sourceFrom(choice),
      tooltip: markdownTooltip('Choice', choice.text, undefined, choice.sourceLocation?.filePath),
    }))
}

async function openSource(source: { filePath: string, range?: import('@quajs/project-inspector').SourceRange }): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(source.filePath))
  const editor = await vscode.window.showTextDocument(document)
  if (source.range) {
    const range = new vscode.Range(
      source.range.start.line,
      source.range.start.column,
      source.range.end.line,
      source.range.end.column,
    )
    editor.selection = new vscode.Selection(range.start, range.end)
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
  }
}

function openStoryGraph(extensionUri: vscode.Uri, service: QuaProjectInspectorService, inspectorProvider: StoryPointInspectorProvider): void {
  const panel = vscode.window.createWebviewPanel('quascript.storyGraph', 'QuaScript Story Graph', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  panel.webview.html = renderGraphHtml(panel.webview, extensionUri, service.getSnapshot())
  panel.webview.onDidReceiveMessage((message: { command?: string, nodeId?: string, packageId?: string, sceneId?: string }) => {
    if (message.command === 'inspect' && message.nodeId) {
      inspectorProvider.inspect({ nodeId: message.nodeId, packageId: message.packageId, sceneId: message.sceneId })
    }
    if (message.command === 'openSource' && message.nodeId) {
      const node = service.getSnapshot()?.storyTree.nodes.find(item =>
        item.id === message.nodeId
        && (!message.packageId || item.packageId === message.packageId)
        && (!message.sceneId || item.sceneId === message.sceneId),
      )
      const source = node ? sourceFrom(node) : undefined
      if (source) {
        openSource(source).catch(error => vscode.window.showWarningMessage(`QuaScript source open failed: ${String(error)}`))
      }
    }
  })
}

function renderInspectorHtml(webview: Webview, extensionUri: vscode.Uri, inspection?: QuaStoryPointInspection): string {
  const nonce = getNonce()
  const style = baseWebviewStyle()
  const title = inspectionTitle(inspection)
  if (!inspection || !title) {
    return htmlDocument(webview, extensionUri, nonce, `${style}<main class="empty"><h1>No Story Point Selected</h1><p>Select a story point in Story Tree to inspect package provenance, dependencies, edges, and assets.</p></main>`)
  }
  const risks = inspection.risks.map(risk => `<li class="risk ${risk.severity}">${escapeHtml(risk.message)}</li>`).join('')
  const assets = inspection.assets.map(asset => `
    <tr>
      <td>${escapeHtml(asset.type)}</td>
      <td>${escapeHtml(asset.name)}</td>
      <td>${escapeHtml(asset.packageId || '')}</td>
      <td><span class="status ${asset.status}">${escapeHtml(asset.status)}</span></td>
    </tr>
  `).join('')
  const inbound = inspection.edges.inbound.map(edge => `<li>${escapeHtml(edge.from)} -> ${escapeHtml(edge.to)}</li>`).join('')
  const outbound = inspection.edges.outbound.map(edge => `<li>${escapeHtml(edge.from)} -> ${escapeHtml(edge.to)}</li>`).join('')
  return htmlDocument(webview, extensionUri, nonce, `${style}
    <main>
      <header>
        <span class="eyebrow">${escapeHtml(inspection.kind ? `Story ${inspection.kind}` : 'Story Point')}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml([inspection.node?.sceneId || inspection.entry?.sceneId || inspection.label?.sceneId, inspection.packageId].filter(Boolean).join(' / ') || 'Base content')}</p>
      </header>
      <section class="grid">
        <article>
          <h2>Provenance</h2>
          <dl>
            <dt>Package</dt><dd>${escapeHtml(inspection.packageId || 'base')}</dd>
            <dt>Required</dt><dd>${escapeHtml(inspection.requiredRuntimePackages.join(', ') || 'none')}</dd>
            <dt>Source</dt><dd>${escapeHtml(inspection.sourceLocation?.filePath || 'manifest')}</dd>
          </dl>
        </article>
        <article>
          <h2>Edges</h2>
          <div class="columns"><div><h3>Inbound</h3><ul>${inbound || '<li>None</li>'}</ul></div><div><h3>Outbound</h3><ul>${outbound || '<li>None</li>'}</ul></div></div>
        </article>
      </section>
      <section>
        <h2>Assets</h2>
        <table><thead><tr><th>Type</th><th>Name</th><th>Package</th><th>Status</th></tr></thead><tbody>${assets || '<tr><td colspan="4">No asset references.</td></tr>'}</tbody></table>
      </section>
      <section>
        <h2>Risks</h2>
        <ul class="risks">${risks || '<li>No risks detected for this point.</li>'}</ul>
      </section>
    </main>`)
}

function renderPackageHealthHtml(webview: Webview, extensionUri: vscode.Uri, snapshot?: QuaProjectInspectorSnapshot): string {
  const nonce = getNonce()
  const style = baseWebviewStyle()
  if (!snapshot) {
    return htmlDocument(webview, extensionUri, nonce, `${style}<main class="empty"><h1>Package Health</h1><p>Project inspector is still loading.</p></main>`)
  }
  const report = snapshot.packageHealthReport
  const summary = report.summary
  const rows = report.packages.map(packageHealthRow).join('')
  const risks = report.risks.map(risk => `<li class="risk ${risk.severity}">${escapeHtml(risk.packageId || 'workspace')}: ${escapeHtml(risk.message)}</li>`).join('')
  return htmlDocument(webview, extensionUri, nonce, `${style}
    <main>
      <header>
        <span class="eyebrow">Runtime Packages</span>
        <h1>Package Health</h1>
        <p>${summary.packageCount} packages / ${summary.riskCounts.error} errors / ${summary.riskCounts.warning} warnings</p>
      </header>
      <section class="stats" aria-label="Package health summary">
        ${statItem('Packages', summary.packageCount)}
        ${statItem('Story Points', summary.storyPointCount)}
        ${statItem('Assets', summary.assetCount)}
        ${statItem('Referenced', summary.referencedAssetCount)}
        ${statItem('Missing Assets', summary.missingAssetCount, summary.missingAssetCount > 0 ? 'error' : undefined)}
        ${statItem('Missing Deps', summary.missingDependencyCount, summary.missingDependencyCount > 0 ? 'error' : undefined)}
        ${statItem('Signed', summary.signaturePackageCount)}
        ${statItem('Integrity', summary.integrityPackageCount)}
      </section>
      <section>
        <h2>Packages</h2>
        <table>
          <thead>
            <tr>
              <th>Package</th>
              <th>Risk</th>
              <th>Dependencies</th>
              <th>Story</th>
              <th>Runtime</th>
              <th>Assets</th>
              <th>Trust</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7">No runtime packages found.</td></tr>'}</tbody>
        </table>
      </section>
      <section>
        <h2>Risks</h2>
        <ul class="risks">${risks || '<li>No package health risks detected.</li>'}</ul>
      </section>
    </main>`)
}

function packageHealthRow(packageRef: QuaPackageHealthPackageRef): string {
  const missingDependencies = packageRef.missingDependencies.length > 0
    ? `<span class="status missing">${escapeHtml(packageRef.missingDependencies.join(', '))}</span>`
    : `${packageRef.dependencyCount}`
  const riskSummary = [
    packageRef.riskCounts.error > 0 ? `<span class="risk-pill error">${packageRef.riskCounts.error}</span>` : '',
    packageRef.riskCounts.warning > 0 ? `<span class="risk-pill warning">${packageRef.riskCounts.warning}</span>` : '',
    packageRef.riskCounts.info > 0 ? `<span class="risk-pill info">${packageRef.riskCounts.info}</span>` : '',
  ].filter(Boolean).join(' ') || '<span class="muted">none</span>'
  const trust = [
    packageRef.locked ? '<span class="pill warning">locked</span>' : '',
    packageRef.hasSignature ? '<span class="pill ok">signed</span>' : '<span class="pill neutral">unsigned</span>',
    packageRef.hasIntegrity ? '<span class="pill ok">integrity</span>' : '<span class="pill neutral">no integrity</span>',
  ].filter(Boolean).join(' ')
  return `
    <tr>
      <td class="package-cell"><strong>${escapeHtml(packageRef.id)}</strong><span>${escapeHtml(packageRef.version || '')}</span></td>
      <td>${riskSummary}</td>
      <td>${missingDependencies}</td>
      <td>${compactCounts([
        [packageRef.storyPointCount, 'points'],
        [packageRef.sceneCount, 'scenes'],
        [packageRef.storyGraphDeltaCount, 'deltas'],
      ])}</td>
      <td>${compactCounts([
        [packageRef.scriptCount, 'scripts'],
        [packageRef.pluginCount, 'plugins'],
        [packageRef.migrationCount, 'migrations'],
      ])}</td>
      <td>${compactCounts([
        [packageRef.assetCount, 'bundled'],
        [packageRef.referencedAssetCount, 'refs'],
        [packageRef.missingAssetCount, 'missing'],
      ], packageRef.missingAssetCount > 0)}</td>
      <td>${trust}</td>
    </tr>`
}

function statItem(label: string, value: number, tone?: 'error' | 'warning'): string {
  return `<div class="stat ${tone || ''}"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`
}

function compactCounts(items: Array<[number, string]>, hasError = false): string {
  return `<span class="${hasError ? 'status missing' : ''}">${items
    .filter(([value]) => value > 0)
    .map(([value, label]) => `${value} ${escapeHtml(label)}`)
    .join(' / ') || '0'}</span>`
}

function renderGraphHtml(webview: Webview, extensionUri: vscode.Uri, snapshot?: QuaProjectInspectorSnapshot): string {
  const nonce = getNonce()
  const style = baseWebviewStyle()
  const nodes = snapshot?.storyTree.nodes || []
  const edges = snapshot?.storyTree.edges || []
  const packages = uniqueStrings(nodes.map(node => node.packageId).filter(Boolean) as string[])
  const scenes = uniqueStrings(nodes.map(node => node.sceneId).filter(Boolean) as string[])
  const riskNodeIds = new Set((snapshot?.risks || []).map(risk => risk.targetId).filter(Boolean) as string[])
  const nodeIds = new Set(nodes.map(node => node.id))
  const missingTargets = new Set(edges.flatMap(edge => [edge.from, edge.to]).filter(id => !nodeIds.has(id)))
  const positions = nodes.map((node, index) => ({
    ...node,
    hasRisk: riskNodeIds.has(node.id),
    x: 80 + (index % 4) * 220,
    y: 80 + Math.floor(index / 4) * 140,
  }))
  const nodeById = new Map(positions.map(node => [node.id, node]))
  const edgeSvg = edges.map((edge) => {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!from || !to) {
      return ''
    }
    return `<g class="edge-group" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-package="${escapeHtml(edge.packageId || '')}">
      <line x1="${from.x + 70}" y1="${from.y}" x2="${to.x - 70}" y2="${to.y}" class="edge" />
      <text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 6}">${escapeHtml(edge.kind)}</text>
    </g>`
  }).join('')
  const missingSvg = Array.from(missingTargets).map((id, index) => {
    const x = 80 + ((positions.length + index) % 4) * 220
    const y = 80 + Math.floor((positions.length + index) / 4) * 140
    return `<g class="node missing" tabindex="0" data-node="${escapeHtml(id)}" data-package="" data-scene="" data-risk="true">
      <rect x="${x - 70}" y="${y - 28}" width="140" height="56" rx="6"></rect>
      <text x="${x}" y="${y + 4}" text-anchor="middle">${escapeHtml(id)}</text>
    </g>`
  }).join('')
  const nodeSvg = positions.map((node) => {
    const chapterSelectable = Boolean((node as typeof node & { chapterSelectable?: boolean }).chapterSelectable)
    return `<g class="node ${node.packageId ? 'runtime' : 'base'} ${node.hasRisk ? 'risk-node' : ''} ${chapterSelectable ? 'chapter-selectable' : ''}" tabindex="0" data-node="${escapeHtml(node.id)}" data-package="${escapeHtml(node.packageId || '')}" data-scene="${escapeHtml(node.sceneId || '')}" data-risk="${node.hasRisk ? 'true' : 'false'}">
    <rect x="${node.x - 70}" y="${node.y - 28}" width="140" height="56" rx="6"></rect>
    <text x="${node.x}" y="${node.y + 4}" text-anchor="middle">${escapeHtml(node.id)}</text>
  </g>`
  }).join('')
  return htmlDocument(webview, extensionUri, nonce, `${style}
    <main>
      <header><span class="eyebrow">QuaScript</span><h1>Story Graph</h1><p>${nodes.length} nodes / ${edges.length} edges</p></header>
      <nav class="toolbar" aria-label="Story graph filters">
        <label>Package<select id="packageFilter"><option value="">All</option>${packages.map(packageId => `<option value="${escapeHtml(packageId)}">${escapeHtml(packageId)}</option>`).join('')}</select></label>
        <label>Scene<select id="sceneFilter"><option value="">All</option>${scenes.map(sceneId => `<option value="${escapeHtml(sceneId)}">${escapeHtml(sceneId)}</option>`).join('')}</select></label>
        <label class="check"><input id="riskOnly" type="checkbox"> Risk only</label>
      </nav>
      <svg viewBox="0 0 960 720" role="img" aria-label="Story graph">${edgeSvg}${nodeSvg}${missingSvg}</svg>
    </main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const packageFilter = document.getElementById('packageFilter');
      const sceneFilter = document.getElementById('sceneFilter');
      const riskOnly = document.getElementById('riskOnly');
      const applyFilters = () => {
        const selectedPackage = packageFilter.value;
        const selectedScene = sceneFilter.value;
        const onlyRisk = riskOnly.checked;
        document.querySelectorAll('.node').forEach((node) => {
          const hidden = (selectedPackage && node.dataset.package !== selectedPackage)
            || (selectedScene && node.dataset.scene !== selectedScene)
            || (onlyRisk && node.dataset.risk !== 'true');
          node.classList.toggle('hidden', Boolean(hidden));
        });
        document.querySelectorAll('.edge-group').forEach((edge) => {
          const fromNode = document.querySelector('.node[data-node="' + CSS.escape(edge.dataset.from) + '"]');
          const toNode = document.querySelector('.node[data-node="' + CSS.escape(edge.dataset.to) + '"]');
          edge.classList.toggle('hidden', !fromNode || !toNode || fromNode.classList.contains('hidden') || toNode.classList.contains('hidden'));
        });
      };
      packageFilter.addEventListener('change', applyFilters);
      sceneFilter.addEventListener('change', applyFilters);
      riskOnly.addEventListener('change', applyFilters);
      document.querySelectorAll('.node').forEach((node) => {
        node.addEventListener('click', () => vscode.postMessage({ command: 'inspect', nodeId: node.dataset.node, packageId: node.dataset.package, sceneId: node.dataset.scene }));
        node.addEventListener('dblclick', () => vscode.postMessage({ command: 'openSource', nodeId: node.dataset.node, packageId: node.dataset.package, sceneId: node.dataset.scene }));
        node.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') vscode.postMessage({ command: 'inspect', nodeId: node.dataset.node, packageId: node.dataset.package, sceneId: node.dataset.scene });
        });
      });
    </script>`)
}

function htmlDocument(_webview: Webview, _extensionUri: vscode.Uri, nonce: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>QuaScript Inspector</title></head><body>${body}</body></html>`
}

function baseWebviewStyle(): string {
  return `<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; }
    main { padding: 18px; }
    header { border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 16px; padding-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 600; margin: 4px 0; }
    h2 { font-size: 13px; margin: 0 0 10px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    h3 { font-size: 12px; margin: 0 0 6px; }
    p, dd, li, td, th { font-size: 12px; line-height: 1.45; }
    button, input, select { font: inherit; }
    input { accent-color: var(--vscode-focusBorder); }
    label { align-items: center; display: inline-flex; gap: 6px; }
    select { background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); color: var(--vscode-dropdown-foreground); padding: 3px 22px 3px 6px; }
    .eyebrow { color: var(--vscode-descriptionForeground); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
    .toolbar { align-items: center; border-bottom: 1px solid var(--vscode-panel-border); display: flex; flex-wrap: wrap; gap: 10px 16px; margin: -4px 0 12px; padding: 0 0 12px; }
    .check { color: var(--vscode-descriptionForeground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
    .stat { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; }
    .stat strong { display: block; font-size: 18px; line-height: 1.1; margin-bottom: 3px; }
    .stat span { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .stat.error strong { color: var(--vscode-errorForeground); }
    .stat.warning strong { color: var(--vscode-editorWarning-foreground); }
    article, section { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; margin-bottom: 12px; background: var(--vscode-sideBar-background); }
    dl { display: grid; grid-template-columns: 80px 1fr; gap: 6px 10px; margin: 0; }
    dt { color: var(--vscode-descriptionForeground); font-size: 12px; }
    dd { margin: 0; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    td { overflow-wrap: anywhere; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .risk.error { color: var(--vscode-errorForeground); }
    .risk.warning { color: var(--vscode-editorWarning-foreground); }
    .risk.info { color: var(--vscode-descriptionForeground); }
    .status.missing { color: var(--vscode-errorForeground); }
    .status.present { color: var(--vscode-testing-iconPassed); }
    .muted { color: var(--vscode-descriptionForeground); }
    .package-cell strong { display: block; font-weight: 600; }
    .package-cell span { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .pill, .risk-pill { border: 1px solid var(--vscode-panel-border); border-radius: 999px; display: inline-block; font-size: 11px; line-height: 1.2; margin: 0 3px 3px 0; padding: 2px 6px; }
    .pill.ok { color: var(--vscode-testing-iconPassed); }
    .pill.warning, .risk-pill.warning { color: var(--vscode-editorWarning-foreground); }
    .pill.neutral, .risk-pill.info { color: var(--vscode-descriptionForeground); }
    .risk-pill.error { color: var(--vscode-errorForeground); }
    .empty { color: var(--vscode-descriptionForeground); }
    svg { width: 100%; min-height: 520px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-sideBar-background); }
    .edge { stroke: var(--vscode-descriptionForeground); stroke-width: 1.5; }
    .edge-group.hidden { display: none; }
    svg text { fill: var(--vscode-foreground); font-size: 11px; }
    .node rect { fill: var(--vscode-editor-background); stroke: var(--vscode-focusBorder); stroke-width: 1.5; }
    .node.runtime rect { stroke: var(--vscode-charts-blue); }
    .node.missing rect { stroke: var(--vscode-errorForeground); stroke-dasharray: 5 4; }
    .node.risk-node rect { stroke: var(--vscode-editorWarning-foreground); }
    .node.hidden { display: none; }
    .node:focus rect, .node:hover rect { stroke-width: 2.5; }
  </style>`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function getNonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

function hasScenePackage(snapshot: QuaProjectInspectorSnapshot, sceneId: string, packageId: string): boolean {
  return snapshot.storyTree.nodes.some(node => node.sceneId === sceneId && node.packageId === packageId)
    || snapshot.storyTree.entries.some(entry => entry.sceneId === sceneId && entry.packageId === packageId)
    || snapshot.storyTree.labels.some(label => label.sceneId === sceneId && label.packageId === packageId)
}

function hasBaseScene(snapshot: QuaProjectInspectorSnapshot, sceneId: string): boolean {
  return snapshot.storyTree.nodes.some(node => node.sceneId === sceneId && !node.packageId)
    || snapshot.storyTree.entries.some(entry => entry.sceneId === sceneId && !entry.packageId)
    || snapshot.storyTree.labels.some(label => label.sceneId === sceneId && !label.packageId)
}

function markdownTooltip(kind: string, id: string, detail?: string, source?: string): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true)
  tooltip.appendMarkdown(`**${kind}** \`${id}\``)
  if (detail) {
    tooltip.appendMarkdown(`\n\n${detail}`)
  }
  if (source) {
    tooltip.appendMarkdown(`\n\n${source}`)
  }
  return tooltip
}

function assetLineageTooltip(asset: QuaAssetLineageRef): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true)
  tooltip.appendMarkdown(`**Asset** \`${asset.type}:${asset.name}\``)
  tooltip.appendMarkdown(`\n\nStatus: \`${asset.status}\``)
  tooltip.appendMarkdown(`\n\nSource: \`${asset.sourceKind}\``)
  if (asset.field) {
    tooltip.appendMarkdown(`\n\nField: \`${asset.field}\``)
  }
  if (asset.packageId) {
    tooltip.appendMarkdown(`\n\nPackage: \`${asset.packageId}\``)
  }
  if (asset.sourceLocation?.filePath) {
    tooltip.appendMarkdown(`\n\n${asset.sourceLocation.filePath}`)
  }
  return tooltip
}

function sourceFrom(value: { sourceLocation?: { filePath?: string, range?: import('@quajs/project-inspector').SourceRange } }): { filePath: string, range?: import('@quajs/project-inspector').SourceRange } | undefined {
  return value.sourceLocation?.filePath ? { filePath: value.sourceLocation.filePath, range: value.sourceLocation.range } : undefined
}

function targetLabel(target: StoryTargetData): string {
  if (target.kind === 'package-node') {
    return `${target.packageId || 'package'}#${target.nodeId || 'node'}`
  }
  return target.id || target.nodeId || target.sceneId || target.kind
}

function inspectionTitle(inspection: QuaStoryPointInspection | undefined): string | undefined {
  if (inspection?.kind === 'entry') {
    return inspection.entry?.id
  }
  if (inspection?.kind === 'label') {
    return inspection.label?.id
  }
  return inspection?.node?.id
    || inspection?.entry?.id
    || inspection?.label?.id
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right))
}

function uniqueBy<T>(items: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const itemKey = key(item)
    if (seen.has(itemKey)) {
      return false
    }
    seen.add(itemKey)
    return true
  })
}

function groupBy<T>(items: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const groupKey = key(item)
    const group = groups.get(groupKey)
    if (group) {
      group.push(item)
    }
    else {
      groups.set(groupKey, [item])
    }
  }
  return groups
}
