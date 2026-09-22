import type { EditorBridge, EditorDiagnostic, EditorDocument, EditorProject, EditorProjectChange, PreviewState, PreviewTarget } from '@quajs/editor-core'
import { button } from '@quajs/editor-controls'
import { ProductionBuild } from '../features/build/controller'
import { DebugConsole } from '../features/console/controller'
import { NativeSurfacePreview } from '../features/preview/native-surface'
import { ProblemsPanel } from '../features/problems/panel'
import { ProjectSetup } from '../features/project/setup'
import { VisualScriptEditor } from '../features/properties/controller'
import { SettingsPanel } from '../features/settings/controller'
import { DialogueColors } from '../features/source/dialogue-colors'
import { DiskDiff } from '../features/source/disk-diff'
import { connectLanguageService } from '../features/source/language'
import { createScriptEditor, documentLanguage, monaco } from '../features/source/monaco'
import { PeekModels } from '../features/source/peek-models'
import { registerPreviewAction } from '../features/source/preview-action'
import { workbenchEmpty } from '../shared/empty-state'
import { setIconButton } from '../shared/icons'
import { Workbench } from '../workbench/controller'
import { connectTitlebar } from '../workbench/titlebar'
import { createAuthoringSourceEdits } from './authoring/source-edits'
import { connectWritingBridge } from './authoring/writing-bridge'
import { createDocumentsDisk } from './documents/disk'
import { createDocumentsFiles } from './documents/files'
import { createDocumentsLifecycle } from './documents/lifecycle'
import { createDocumentsTabs } from './documents/tabs'
import { createPreviewController } from './preview/controller'
import { createProjectLifecycle } from './project/lifecycle'
import './shell/workbench-shell'
import '@quajs/editor-controls/styles.scss'
import '../workbench/styles/index.scss'
import '../workbench/layout/styles.scss'

declare global {
  interface Window {
    quaEditor: EditorBridge
  }
}
const context = applicationContext()
const { hideGitDiff, showGitDiff, activateGitDiff, closeActiveTab, reportDirty, renderTabs, saveAll, switchTab } = createDocumentsTabs(context)
const { openDocument, saveDocument, setDirty } = createDocumentsLifecycle(context)
const { mutateFiles } = createDocumentsFiles(context)
const { closeDiskDiff, clearDiskChange, flushProjectChange, checkDiskDocument } = createDocumentsDisk(context)
const { applyPluginEdit, openPreviewSource } = createAuthoringSourceEdits(context)
const { setProject, updateProject, openProject, scheduleAnalysis } = createProjectLifecycle(context)
const { run, controlPreview, seekPreview, setPreviewState, renderPreviewEmpty, updatePreviewBounds } = createPreviewController(context)
const bridge = window.quaEditor

const app = document.querySelector<HTMLDivElement>('#app')!
const shell = document.createElement('qua-workbench-shell') as import('lit').LitElement
app.append(shell)
// eslint-disable-next-line antfu/no-top-level-await -- Mount Lit hosts before attaching imperative editors.
await shell.updateComplete
// eslint-disable-next-line antfu/no-top-level-await -- Each child owns its first render.
await Promise.all([...shell.querySelectorAll<import('lit').LitElement>('qua-source-pane, qua-preview-pane')].map(pane => pane.updateComplete))
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const welcomeFind = button('查找文件', findFile, 'primary')
welcomeFind.id = 'welcome-find'
welcomeFind.hidden = true
const welcome = workbenchEmpty('document', '开始创作', '打开已有项目，或创建一个新的故事。', [element('welcome-open'), element('welcome-create'), welcomeFind])
for (const action of welcome.actions.children)
  action.classList.add('editor-button')
element('editor-empty').replaceChildren(welcome.element)
const explorerEmpty = workbenchEmpty('folder', '尚未打开项目', '', [button('打开项目', () => element('welcome-open').click())])
explorerEmpty.element.classList.add('explorer-empty')
explorerEmpty.element.dataset.compact = ''
element('view-explorer').append(explorerEmpty.element)
const previewRun = button('运行预览', () => element('run').click(), 'primary')
const previewEmpty = workbenchEmpty('play', '预览尚未运行', '打开项目后，在这里预览故事效果。', [previewRun])
previewRun.hidden = true
element('preview-empty').append(previewEmpty.element)
connectTitlebar(document.querySelector('.titlebar')!, bridge, showError)
const peekModels = new PeekModels(path => bridge.readDocument(path), findOpenModel)
const editor = createScriptEditor(element('editor'), { textModelService: peekModels })
editor.onDidDispose(() => peekModels.clear())
editor.onDidChangeCursorPosition(({ position }) => {
  element('cursor-position').textContent = `行 ${position.lineNumber}，列 ${position.column}`
})
const diskDiff = new DiskDiff(element('disk-diff'))
const gitDiff = new DiskDiff(element('git-diff'))
const nativePreview = new NativeSurfacePreview(element<HTMLElement>('native-surface'), bridge, showError)
export interface OpenTab {
  document: EditorDocument
  model: monaco.editor.ITextModel
  view: monaco.editor.ICodeEditorViewState | null
  dirty: boolean
  unavailable: boolean
}
export interface GitDiffTab {
  path: string
  staged: boolean
  view?: monaco.editor.IDiffEditorViewState | null
}
const tabs: OpenTab[] = []
function findOpenModel(path: string): monaco.editor.ITextModel | undefined {
  return tabs.find(tab => tab.document.path === path)?.model
}
const gitTabs: GitDiffTab[] = []
let activeGitTab: GitDiffTab | undefined
let gitGeneration = 0
let activeTab: OpenTab | undefined
const settings = new SettingsPanel(editor, () => tabs.map(tab => tab.model), () => updatePreviewBounds())
element('settings-button').onclick = () => settings.show()
let project: EditorProject | undefined
let documentModel: EditorDocument | undefined
let dirty = false
let workspaceBusy = false
let changingDocument = false
let openGeneration = 0
let analysisGeneration = 0
let analysisTimer: ReturnType<typeof setTimeout> | undefined
let documentDiagnostics: EditorDiagnostic[] = []
let checkedDiagnostics: EditorDiagnostic[] = []
let analyzedPath: string | undefined
let checkTimer: ReturnType<typeof setTimeout> | undefined
const dialogueColors = new DialogueColors(editor, element('dialogue-legend'))
const problems = new ProblemsPanel(element('diagnostics'), (diagnostic) => {
  if (diagnostic.filePath)
    void openDocument(diagnostic.filePath, diagnostic.line, diagnostic.column).catch(showError)
})
let diskVersion: EditorDocument | undefined
let reviewedDisk: EditorDocument | undefined
let diskUnavailable = false
let diskReadGeneration = 0
let saving = false
let pendingProjectChange: EditorProjectChange | undefined
let previewState: PreviewState = { phase: 'idle' }
let previewCommandBusy = false
let previewNeedsRestart = false
const visualEditor = new VisualScriptEditor(editor, () => project, () => Boolean(documentModel && !workspaceBusy && !saving && !diskUnavailable && !activeGitTab && element('disk-diff').hidden), () => context.workbench.dock.open('properties'), () => context.workbench.dock.open('source'))
const debugConsole = new DebugConsole(element('logs'))
const setup = new ProjectSetup(bridge, () => updatePreviewBounds(), async (request) => {
  await openProject(request)
})
const workbench = new Workbench(bridge, (path, line, column) => void openDocument(path, line, column).catch(showError), showError, status, showGitDiff, saveAll, mutateFiles, () => queueMicrotask(updatePreviewBounds), applyPluginEdit, openPreviewSource)
const productionBuild = new ProductionBuild(bridge, () => project, saveAll, () => updatePreviewBounds())
registerPreviewAction(editor, line => seekPreview(line).catch(showError))
settings.resetLayout = () => workbench.dock.reset()
function findFile(): void {
  workbench.findFile()
}

element('git-refresh-diff').onclick = () => {
  if (activeGitTab)
    void activateGitDiff(activeGitTab)
}
element('git-open-file').onclick = () => {
  if (activeGitTab)
    void openDocument(activeGitTab.path).catch(showError)
}
let tabSignature = ''
let reportedDirty: boolean | undefined

element('document-tabs').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    void switchTab(event.key === 'ArrowRight' ? 1 : -1, true).catch(showError)
  }
})
window.addEventListener('keydown', (event) => {
  if (element('panel-terminal').contains(document.activeElement))
    return
  if (event.defaultPrevented || event.isComposing)
    return
  const modifier = (event.metaKey || event.ctrlKey) && !event.altKey
  let action: (() => void) | undefined
  if (modifier && !event.altKey && event.key.toLowerCase() === 'z' && editor.hasTextFocus()) {
    action = () => {
      void editor.getModel()?.[event.shiftKey ? 'redo' : 'undo']()
    }
  }
  else if (modifier && event.key === ',') {
    action = () => settings.show()
  }
  else if (modifier && event.key.toLowerCase() === 's') {
    action = () => void (event.shiftKey ? saveAll() : saveDocument()).catch(showError)
  }
  else if (modifier && event.key.toLowerCase() === 'w') {
    action = () => void closeActiveTab().catch(showError)
  }
  else if (event.ctrlKey && event.key === 'Tab') {
    action = () => void switchTab(event.shiftKey ? -1 : 1).catch(showError)
  }
  else if (modifier && ['PageUp', 'PageDown'].includes(event.key)) {
    action = () => void switchTab(event.key === 'PageDown' ? 1 : -1).catch(showError)
  }
  else if (!activeGitTab && event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
    action = () => void editor.getAction('editor.action.formatDocument')?.run().catch(showError)
  }
  else if (event.key === 'F10' && !event.shiftKey) {
    action = () => void controlPreview({ action: 'step' }).catch(showError)
  }
  else if ((event.metaKey || event.ctrlKey) && event.altKey && event.key === 'Enter') {
    action = () => void seekPreview().catch(showError)
  }
  else if (event.key === 'F5') {
    action = () => void (event.shiftKey ? bridge.stopPreview() : run()).catch(showError)
  }
  if (!action || document.querySelector('dialog[open]'))
    return
  event.preventDefault()
  event.stopImmediatePropagation()
  action()
}, true)
function showError(error: unknown): void {
  element('status').textContent = String(error).replace(/^Error: /u, '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
  element('status').title = element('status').textContent ?? ''
  element('status').classList.add('error')
}
function status(text: string): void {
  element('status').textContent = text
  element('status').title = text
  element('status').classList.remove('error')
}

async function mayDiscard(): Promise<boolean> {
  return !tabs.some(tab => tab.dirty) || await bridge.confirmDiscard()
}
function renderDiagnostics(items: EditorDiagnostic[]): void {
  problems.render([
    ...items,
    ...checkedDiagnostics.filter(item => !item.filePath || projectRelativePath(item.filePath) !== analyzedPath),
  ])
}
function projectRelativePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const root = project?.root.replaceAll('\\', '/').replace(/\/$/, '')
  return root && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized
}

connectWritingBridge(context)

const languageService = connectLanguageService(bridge, editor, openDocument, showError, model => tabs.find(tab => tab.model === model && !tab.unavailable && !workspaceBusy)?.document.path, () => project ? { root: project.root, documents: tabs.filter(tab => !tab.unavailable).map(tab => ({ path: tab.document.path, model: tab.model })) } : undefined)

editor.onDidChangeModelContent(() => {
  if (changingDocument)
    return
  setDirty(diskUnavailable || Boolean(documentModel && editor.getValue() !== documentModel.text))
  scheduleAnalysis()
})
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveDocument().catch(showError))
element('save').onclick = () => void saveDocument().catch(showError)
element('format').onclick = () => void editor.getAction('editor.action.formatDocument')?.run().catch(showError)

element('welcome-create').onclick = () => setup.show()
element('welcome-open').onclick = () => void openProject()

bridge.onCommand((command) => {
  if (command === 'source-workspace') {
    workbench.showSidebar('explorer')
    workbench.dock.open('source')
    editor.focus()
    return
  }
  const modal = document.querySelector<HTMLDialogElement>('dialog[open]')
  if (modal && command !== 'undo' && command !== 'redo') {
    if (command === 'close-tab' && !workspaceBusy)
      modal.close()
    return
  }
  if (command === 'build-project') {
    productionBuild.show()
  }
  else if (command === 'terminal' || command === 'new-terminal') {
    workbench.openTerminal(command === 'new-terminal')
  }
  else if (command === 'new-project') {
    setup.show()
  }
  else if (command === 'open-project') {
    void openProject()
  }
  else if (command === 'undo' || command === 'redo') {
    if (editor.hasTextFocus() || element('editor').contains(document.activeElement) || visualEditor.hasFocus())
      void editor.getModel()?.[command]()
    else document.execCommand(command)
  }
  else if (command === 'settings') {
    settings.show()
  }
  else if (command === 'save') {
    void saveDocument().catch(showError)
  }
  else if (command === 'save-all') {
    void saveAll().catch(showError)
  }
  else if (command === 'close-tab') {
    void closeActiveTab().catch(showError)
  }
  else if (command === 'format' && !activeGitTab) {
    void editor.getAction('editor.action.formatDocument')?.run().catch(showError)
  }
  else if (project) {
    void bridge.refreshProject().then(() => status('项目已刷新')).catch(showError)
  }
})

bridge.onProjectChange((change) => {
  pendingProjectChange = pendingProjectChange ? { ...change, paths: [''] } : change
  flushProjectChange()
})

element('compare-disk').onclick = () => {
  if (!diskVersion || !documentModel)
    return
  hideGitDiff()
  diskDiff.show(diskVersion.text, editor.getValue(), documentLanguage(documentModel.path))
  reviewedDisk = diskVersion
  element<HTMLButtonElement>('keep-local').disabled = false
  element('editor').hidden = true
  element('close-diff').hidden = false
  element('disk-message').textContent = '红色为磁盘版本，绿色为未保存内容；保留本地将替换此磁盘版本。'
}
element('keep-local').onclick = () => {
  if (reviewedDisk) {
    void saveDocument(reviewedDisk).catch((error) => {
      showError(error)
      void checkDiskDocument()
    })
  }
}
element('close-diff').onclick = closeDiskDiff
element('reload-disk').onclick = () => {
  if (documentModel)
    void openDocument(documentModel.path, undefined, undefined, true).catch(showError)
}
bridge.onProjectCheck((check) => {
  if (check.root !== project?.root)
    return
  checkedDiagnostics = check.diagnostics
  problems.setChecking(check.phase === 'checking')
  const errors = check.diagnostics.filter(diagnostic => diagnostic.severity === 'error').length
  const warnings = check.diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length
  setCheckIndicator(check.phase, check.phase === 'checking' ? `静态检查 ${check.completed}/${check.total}` : check.phase === 'error' ? '静态检查失败；点击查看问题' : `静态检查：${errors} 个错误，${warnings} 个警告；点击查看问题`, check.phase === 'error' || errors ? 'error' : warnings ? 'warning' : 'success')
  renderDiagnostics([...(project?.diagnostics || []), ...documentDiagnostics])
})
function setCheckIndicator(phase: 'checking' | 'complete' | 'error', title: string, tone = 'success'): void {
  const indicator = element<HTMLButtonElement>('check-indicator')
  indicator.dataset.phase = phase
  indicator.dataset.tone = tone
  setIconButton(indicator, phase === 'checking' ? 'refresh' : tone === 'error' || tone === 'warning' ? 'warning' : 'check', title)
}

element('preview-refresh').onclick = element('preview-retry').onclick = () => void saveAll().then(() => bridge.reloadPreview()).catch(showError)
element('preview-window').onclick = () => void bridge.presentPreview(previewState.detached ? 'embedded' : 'window').catch(showError)
element('preview-mute').onclick = () => void bridge.setPreviewMuted(!previewState.muted).catch(showError)
element('preview-fullscreen').onclick = () => void bridge.presentPreview('fullscreen').catch(showError)
element('preview-step').onclick = () => void controlPreview({ action: 'step' }).catch(showError)
element('preview-seek').onclick = () => void seekPreview().catch(showError)
element('run').onclick = () => void run().catch(showError)
element('stop').onclick = () => void bridge.stopPreview().catch(showError)
element('target').onchange = () => {
  const target = element<HTMLSelectElement>('target').value as PreviewTarget
  element<HTMLButtonElement>('run').disabled = !project?.targets[target].enabled
  if (previewState.phase !== 'idle')
    void run().catch(showError)
}
element('preview-build-log').onclick = () => element('tab-console').click()
element('clear-log').onclick = () => debugConsole.clear()

bridge.onPreviewState(setPreviewState)
bridge.onLog(entry => debugConsole.append(entry.identity, entry.message))

const observer = new ResizeObserver(updatePreviewBounds)
observer.observe(element('preview'))
window.addEventListener('beforeunload', (event) => {
  if (tabs.some(tab => tab.dirty)) {
    event.preventDefault()
    event.returnValue = ''
  }
})
void bridge.currentProject().then((next) => {
  if (next)
    setProject(next)
}).catch(showError)
void bridge.previewState().then(setPreviewState).catch(showError)

function applicationContext() {
  return {
    get activeGitTab(): typeof activeGitTab {
      return activeGitTab
    },
    set activeGitTab(value: typeof activeGitTab) {
      activeGitTab = value
    },
    get activeTab(): typeof activeTab {
      return activeTab
    },
    set activeTab(value: typeof activeTab) {
      activeTab = value
    },
    get analysisGeneration(): typeof analysisGeneration {
      return analysisGeneration
    },
    set analysisGeneration(value: typeof analysisGeneration) {
      analysisGeneration = value
    },
    get analysisTimer(): typeof analysisTimer {
      return analysisTimer
    },
    set analysisTimer(value: typeof analysisTimer) {
      analysisTimer = value
    },
    get analyzedPath(): typeof analyzedPath {
      return analyzedPath
    },
    set analyzedPath(value: typeof analyzedPath) {
      analyzedPath = value
    },
    get app(): typeof app {
      return app
    },
    get bridge(): typeof bridge {
      return bridge
    },
    get changingDocument(): typeof changingDocument {
      return changingDocument
    },
    set changingDocument(value: typeof changingDocument) {
      changingDocument = value
    },
    get checkDiskDocument(): () => Promise<void> {
      return checkDiskDocument
    },
    get checkTimer(): typeof checkTimer {
      return checkTimer
    },
    set checkTimer(value: typeof checkTimer) {
      checkTimer = value
    },
    get checkedDiagnostics(): typeof checkedDiagnostics {
      return checkedDiagnostics
    },
    set checkedDiagnostics(value: typeof checkedDiagnostics) {
      checkedDiagnostics = value
    },
    get clearDiskChange(): () => void {
      return clearDiskChange
    },
    get closeDiskDiff(): () => void {
      return closeDiskDiff
    },
    get dialogueColors(): typeof dialogueColors {
      return dialogueColors
    },
    get dirty(): typeof dirty {
      return dirty
    },
    set dirty(value: typeof dirty) {
      dirty = value
    },
    get diskDiff(): typeof diskDiff {
      return diskDiff
    },
    get diskReadGeneration(): typeof diskReadGeneration {
      return diskReadGeneration
    },
    set diskReadGeneration(value: typeof diskReadGeneration) {
      diskReadGeneration = value
    },
    get diskUnavailable(): typeof diskUnavailable {
      return diskUnavailable
    },
    set diskUnavailable(value: typeof diskUnavailable) {
      diskUnavailable = value
    },
    get diskVersion(): typeof diskVersion {
      return diskVersion
    },
    set diskVersion(value: typeof diskVersion) {
      diskVersion = value
    },
    get documentDiagnostics(): typeof documentDiagnostics {
      return documentDiagnostics
    },
    set documentDiagnostics(value: typeof documentDiagnostics) {
      documentDiagnostics = value
    },
    get documentModel(): typeof documentModel {
      return documentModel
    },
    set documentModel(value: typeof documentModel) {
      documentModel = value
    },
    get editor(): typeof editor {
      return editor
    },
    get element(): typeof element {
      return element
    },
    get explorerEmpty(): typeof explorerEmpty {
      return explorerEmpty
    },
    get flushProjectChange(): () => void {
      return flushProjectChange
    },
    get gitDiff(): typeof gitDiff {
      return gitDiff
    },
    get gitGeneration(): typeof gitGeneration {
      return gitGeneration
    },
    set gitGeneration(value: typeof gitGeneration) {
      gitGeneration = value
    },
    get gitTabs(): typeof gitTabs {
      return gitTabs
    },
    get hideGitDiff(): () => void {
      return hideGitDiff
    },
    get languageService(): typeof languageService {
      return languageService
    },
    get mayDiscard(): () => Promise<boolean> {
      return mayDiscard
    },
    get nativePreview(): typeof nativePreview {
      return nativePreview
    },
    get openDocument(): (path: string, line?: number, column?: number, forceReload?: boolean, focus?: boolean, followSource?: boolean) => Promise<void> {
      return openDocument
    },
    get openGeneration(): typeof openGeneration {
      return openGeneration
    },
    set openGeneration(value: typeof openGeneration) {
      openGeneration = value
    },
    get peekModels(): typeof peekModels {
      return peekModels
    },
    get pendingProjectChange(): typeof pendingProjectChange {
      return pendingProjectChange
    },
    set pendingProjectChange(value: typeof pendingProjectChange) {
      pendingProjectChange = value
    },
    get previewCommandBusy(): typeof previewCommandBusy {
      return previewCommandBusy
    },
    set previewCommandBusy(value: typeof previewCommandBusy) {
      previewCommandBusy = value
    },
    get previewEmpty(): typeof previewEmpty {
      return previewEmpty
    },
    get previewNeedsRestart(): typeof previewNeedsRestart {
      return previewNeedsRestart
    },
    set previewNeedsRestart(value: typeof previewNeedsRestart) {
      previewNeedsRestart = value
    },
    get previewRun(): typeof previewRun {
      return previewRun
    },
    get previewState(): typeof previewState {
      return previewState
    },
    set previewState(value: typeof previewState) {
      previewState = value
    },
    get problems(): typeof problems {
      return problems
    },
    get project(): typeof project {
      return project
    },
    set project(value: typeof project) {
      project = value
    },
    get projectRelativePath(): (path: string) => string {
      return projectRelativePath
    },
    get renderDiagnostics(): (items: EditorDiagnostic[]) => void {
      return renderDiagnostics
    },
    get renderPreviewEmpty(): (borrowed?: boolean) => void {
      return renderPreviewEmpty
    },
    get renderTabs(): () => void {
      return renderTabs
    },
    get reportDirty(): () => void {
      return reportDirty
    },
    get reportedDirty(): typeof reportedDirty {
      return reportedDirty
    },
    set reportedDirty(value: typeof reportedDirty) {
      reportedDirty = value
    },
    get reviewedDisk(): typeof reviewedDisk {
      return reviewedDisk
    },
    set reviewedDisk(value: typeof reviewedDisk) {
      reviewedDisk = value
    },
    get saveAll(): () => Promise<void> {
      return saveAll
    },
    get saveDocument(): (comparedDisk?: EditorDocument) => Promise<void> {
      return saveDocument
    },
    get saving(): typeof saving {
      return saving
    },
    set saving(value: typeof saving) {
      saving = value
    },
    get scheduleAnalysis(): () => void {
      return scheduleAnalysis
    },
    get seekPreview(): () => Promise<void> {
      return seekPreview
    },
    get setCheckIndicator(): (phase: 'checking' | 'complete' | 'error', title: string, tone?: string) => void {
      return setCheckIndicator
    },
    get setDirty(): (next: boolean) => void {
      return setDirty
    },
    get settings(): typeof settings {
      return settings
    },
    get setup(): typeof setup {
      return setup
    },
    get showError(): (error: unknown) => void {
      return showError
    },
    get status(): (text: string) => void {
      return status
    },
    get tabSignature(): typeof tabSignature {
      return tabSignature
    },
    set tabSignature(value: typeof tabSignature) {
      tabSignature = value
    },
    get tabs(): typeof tabs {
      return tabs
    },
    get updatePreviewBounds(): () => void {
      return updatePreviewBounds
    },
    get updateProject(): (next: EditorProject) => void {
      return updateProject
    },
    get visualEditor(): typeof visualEditor {
      return visualEditor
    },
    get welcome(): typeof welcome {
      return welcome
    },
    get welcomeFind(): typeof welcomeFind {
      return welcomeFind
    },
    get workbench(): typeof workbench {
      return workbench
    },
    get workspaceBusy(): typeof workspaceBusy {
      return workspaceBusy
    },
    set workspaceBusy(value: typeof workspaceBusy) {
      workspaceBusy = value
    },
  }
}
export type AppContext = ReturnType<typeof applicationContext>
