import type {
  EditorBounds,
  EditorProject,
} from '@quajs/editor-core'
import type { NovelWriterHost } from '@quajs/editor-novel-writer/host'
import type { IpcMainInvokeEvent } from 'electron'
import type { MainServices } from './ipc/services.js'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EditorHostPlugins } from '@quajs/editor-core'
import { novelWriterHostPlugin, WritingAuthoring } from '@quajs/editor-novel-writer/host'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  protocol,
  safeStorage,
} from 'electron'
import { PluginManager } from '../plugins/manager.js'
import { PluginPublisher } from '../plugins/publisher.js'
import { PluginRegistry } from '../plugins/registry.js'
import { serviceOrigin } from '../plugins/service.js'
import { PreviewPresentation } from '../preview-host/presentation.js'
import { PreviewWorkbench } from '../preview-host/workbench.js'
import { ProjectClient } from '../project-service/client.js'
import { ProjectGit } from '../project-service/git.js'
import { ProjectSearch } from '../project-service/search.js'
import { ProjectBuild } from '../runtime/project-build.js'
import { ProjectRuntime } from '../runtime/project-runtime.js'
import { TerminalClient } from '../terminal/client.js'
import { AssetProtocol } from './assets.js'
import { registerAssetsIpc } from './ipc/assets.js'
import { registerBuildIpc } from './ipc/build.js'
import { registerDocumentsIpc } from './ipc/documents.js'
import { registerGitIpc } from './ipc/git.js'
import { registerPluginsIpc } from './ipc/plugins.js'
import { registerPreviewIpc } from './ipc/preview.js'
import { registerProjectIpc } from './ipc/project.js'
import { registerTerminalIpc } from './ipc/terminal.js'
import { registerWindowIpc } from './ipc/window.js'
import { registerWriterIpc } from './ipc/writer.js'
import { connectApplicationMenu } from './menu.js'
import { WindowChrome } from './window-chrome.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'qua-plugin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'qua-asset',
    privileges: { standard: true, secure: true, stream: true },
  },
])

async function main(): Promise<void> {
  app.setName('QuaEngine Editor')
  await app.whenReady()
  const icon = nativeImage.createFromPath(fileURLToPath(new URL('./icons/quaeditor.png', import.meta.url)))
  if (icon.isEmpty())
    throw new Error('Editor application icon is missing. Rebuild @quajs/editor-electron.')
  app.dock?.setIcon(icon)
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#17191d',
    title: 'QuaEngine Editor',
    icon,
    show: false,
    frame: false,
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  let bounds: EditorBounds = { x: 700, y: 80, width: 700, height: 600 }
  let currentProject: EditorProject | undefined
  let projectOpening = false
  let projectLocation: string | undefined
  const runtime = new ProjectRuntime(resolve(app.getPath('userData'), 'runtimes'), state => send('editor:runtime-changed', state))
  const build = new ProjectBuild(state => send('editor:build-changed', state))
  let pluginOperation = false
  const plugins = new PluginManager(
    app.getPath('userData'),
    new PluginRegistry(undefined, process.env.QUA_EDITOR_NPM_REGISTRY),
    event => send('editor:plugin-install-event', event),
    {
      available: () =>
        safeStorage.isEncryptionAvailable()
        && (process.platform !== 'linux'
          || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
      encrypt: text => safeStorage.encryptString(text),
      decrypt: bytes => safeStorage.decryptString(bytes),
    },
    serviceOrigin(
      process.env.QUA_EDITOR_PLUGIN_REGISTRY
      ?? 'https://registry.quaengine.com',
      true,
    ),
  )
  const publisher = new PluginPublisher(
    app.getPath('userData'),
    () => currentProject?.root,
    plugins.service,
    event => send('editor:plugin-install-event', event),
  )
  protocol.handle('qua-plugin', request => plugins.resource(request.url))
  const assetPreviewWindows = new Map<number, BrowserWindow>()
  let closing = false
  let closePending = false
  let documentDirty = false
  async function ensureRuntime(retry = false): Promise<void> {
    const current = currentProject
    if (!current || closing || closePending || pluginOperation || projectOpening)
      return
    await runtime.ensure(current, retry)
    if (runtime.snapshot()?.dependenciesChanged && currentProject?.root === current.root && !closing && !closePending && !projectOpening)
      await syncPlugins()
  }
  let previews: PreviewWorkbench
  let writer: NovelWriterHost
  const project = new ProjectClient(
    (change) => {
      if (change.project.root !== currentProject?.root)
        return
      previews.changed(currentProject, change.project)
      currentProject = change.project
      window.setTitle(`${currentProject.name} — QuaEngine Editor`)
      send('editor:project-changed', change)
      writer?.projectChanged()
      if (!pluginOperation && !runtime.busy && change.paths.includes('package.json')) {
        void syncPlugins().catch(error =>
          send('editor:plugin-install-event', {
            root: change.project.root,
            name: '',
            phase: 'error',
            message: String(error),
          }),
        )
      }
    },
    (check) => {
      if (check.root === currentProject?.root)
        send('editor:project-check', check)
    },
  )
  let pluginSync: Promise<EditorProject | undefined>
    = Promise.resolve(undefined)
  function syncPlugins(): Promise<EditorProject | undefined> {
    pluginSync = pluginSync
      .catch(() => undefined)
      .then(async () => {
        const root = currentProject?.root
        if (!root)
          return undefined
        plugins.setProject(root)
        const active = await plugins.active(root).catch((error) => {
          plugins.setProject('')
          plugins.setProject(root)
          send('editor:plugin-install-event', {
            root,
            name: '',
            phase: 'error',
            message: String(error),
          })
          return { devtools: [], indexers: [] }
        })
        if (root !== currentProject?.root)
          return undefined
        await project.request(
          'setPlugins',
          root,
          active.devtools,
          active.indexers,
        )
        return project.request<EditorProject>('refresh')
      })
    return pluginSync
  }
  const terminals = new TerminalClient(event =>
    send('editor:terminal-event', event),
  )
  let terminalFocused = false
  let terminalReset: Promise<void> | undefined
  const resetTerminals = (): Promise<void> => {
    terminalFocused = false
    if (!window.webContents.isDestroyed())
      window.webContents.setIgnoreMenuShortcuts(false)
    terminalReset ??= terminals.dispose().finally(() => {
      terminalReset = undefined
    })
    return terminalReset
  }
  window.webContents.on('render-process-gone', () => {
    void build.cancel()
    void runtime.cancel()
    void plugins.cancel().catch(() => {})
    void publisher.cancel().catch(() => {})
    void resetTerminals().catch(() => {})
  })
  window.webContents.on('did-start-loading', () => {
    void resetTerminals().catch(() => {})
  })
  const search = new ProjectSearch()
  const git = new ProjectGit(
    () => currentProject?.root,
    state => send('editor:git-changed', state),
  )
  const gitTimer = setInterval(() => {
    if (currentProject && !git.busy)
      void git.status(currentProject.root).catch(() => {})
  }, 3000)
  window.on('focus', () => {
    if (currentProject && !git.busy)
      void git.status(currentProject.root).catch(() => {})
  })
  const assets = new AssetProtocol(() => currentProject, project)
  function send(channel: string, value: unknown): void {
    if (channel === 'editor:command' && writer?.command(String(value)))
      return
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send(channel, value)
  }
  const hostPlugins = new EditorHostPlugins()
  const authoring = new WritingAuthoring(window, () => currentProject, root => project.request('writingContext', root))
  writer = hostPlugins.activate(novelWriterHostPlugin, { window, changed: state => send('editor:novel-writer-state', state), authoring: authoring.bridge })
  const presentation = new PreviewPresentation(window, () => publishPreview(), () => currentProject?.name ?? 'QuaEngine')
  function publishPreview(): void {
    const state = {
      ...previews.getSnapshot(),
      detached: presentation.detached,
    }
    send('editor:preview-changed', state)
    presentation.update(state)
  }
  previews = new PreviewWorkbench(project, {
    createId: randomUUID,
    changed: (state) => {
      send('editor:preview-changed', {
        ...state,
        detached: presentation.detached,
      })
      presentation.update(state)
    },
    log: (identity, message) => send('editor:log', { identity, message }),
    loadDriver: async (target) => {
      if (target === 'web') {
        const { createWebPreview }
          = await import('../preview-host/web/index.js')
        return createWebPreview(window, (next) => {
          presentation.setView(next)
          presentation.setBounds(bounds)
        }, () => runtime.environment())
      }
      const { createNativePreview }
        = await import('../preview-host/native/index.js')
      return createNativePreview(() => runtime.environment(), surface => presentation.setNativeSurface(surface))
    },
  })
  function handle<Args extends unknown[]>(
    channel: string,
    action: (...args: Args) => unknown,
  ): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const previewAllowed
        = [
          'editor:preview-state',
          'editor:preview-pointer',
          'editor:preview-present',
          'editor:preview-reload',
          'editor:preview-mute',
        ].includes(channel) && presentation.accepts(event.sender)
      if (
        (!previewAllowed && event.sender !== window.webContents)
        || event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error('Editor IPC only accepts the editor main frame.')
      }
      return action(...(args as Args))
    })
  }
  ipcMain.handle('editor:asset-preview-close', (event) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error('Asset preview IPC only accepts the main frame.')
    const preview = assetPreviewWindows.get(event.sender.id)
    if (!preview)
      throw new Error('素材预览窗口已关闭。')
    preview.close()
  })
  const writerBounds = (value: EditorBounds): EditorBounds => {
    if (
      !value
      || ![value.x, value.y, value.width, value.height].every(Number.isFinite)
    ) {
      throw new Error('Invalid writing workspace bounds.')
    }
    const [width, height] = window.getContentSize()
    const x = Math.max(0, Math.min(width, Math.round(value.x)))
    const y = Math.max(0, Math.min(height, Math.round(value.y)))
    return {
      x,
      y,
      width: Math.max(0, Math.min(width - x, Math.round(value.width))),
      height: Math.max(0, Math.min(height - y, Math.round(value.height))),
    }
  }

  const chrome = new WindowChrome(window, state =>
    send('editor:window-changed', state))

  async function openRoot(root: string): Promise<EditorProject> {
    await build.cancel()
    await runtime.cancel()
    search.cancel()
    await previews.stop()
    const nextProject = await project.request<EditorProject>('open', root)
    await resetTerminals()
    await publisher.release()
    currentProject = nextProject
    currentProject = (await syncPlugins()) ?? nextProject
    assets.reset()
    window.setTitle(`${currentProject.name} — QuaEngine Editor`)
    return currentProject
  }

  async function publicationOperation<T>(action: () => Promise<T>): Promise<T> {
    if (runtime.busy || projectOpening || pluginOperation || documentDirty || closing || closePending)
      throw new Error('请先保存文档，并等待当前操作结束。')
    pluginOperation = true
    try {
      return await action()
    }
    finally {
      pluginOperation = false
    }
  }

  let fileOperationBusy = false

  let storageSession: string | undefined

  const ipcContext: MainServices = {
    build,
    get assetPreviewWindows() { return assetPreviewWindows },
    get assets() { return assets },
    get bounds() { return bounds },
    set bounds(value) { bounds = value },
    get chrome() { return chrome },
    get closePending() { return closePending },
    set closePending(value) { closePending = value },
    get closing() { return closing },
    set closing(value) { closing = value },
    get currentProject() { return currentProject },
    set currentProject(value) { currentProject = value },
    get documentDirty() { return documentDirty },
    set documentDirty(value) { documentDirty = value },
    get ensureRuntime() { return ensureRuntime },
    get fileOperationBusy() { return fileOperationBusy },
    set fileOperationBusy(value) { fileOperationBusy = value },
    get git() { return git },
    get handle() { return handle },
    get openRoot() { return openRoot },
    get pluginOperation() { return pluginOperation },
    set pluginOperation(value) { pluginOperation = value },
    get plugins() { return plugins },
    get presentation() { return presentation },
    get previews() { return previews },
    set previews(value) { previews = value },
    get project() { return project },
    get projectLocation() { return projectLocation },
    set projectLocation(value) { projectLocation = value },
    get projectOpening() { return projectOpening },
    set projectOpening(value) { projectOpening = value },
    get publicationOperation() { return publicationOperation },
    get publisher() { return publisher },
    get runtime() { return runtime },
    get search() { return search },
    get storageSession() { return storageSession },
    set storageSession(value) { storageSession = value },
    get syncPlugins() { return syncPlugins },
    get terminalFocused() { return terminalFocused },
    set terminalFocused(value) { terminalFocused = value },
    get terminalReset() { return terminalReset },
    set terminalReset(value) { terminalReset = value },
    get terminals() { return terminals },
    get window() { return window },
    get writer() { return writer },
    set writer(value) { writer = value },
    get writerBounds() { return writerBounds },
  }
  registerWriterIpc(ipcContext)
  registerTerminalIpc(ipcContext)
  registerWindowIpc(ipcContext)
  registerBuildIpc(ipcContext)
  registerProjectIpc(ipcContext)
  registerPluginsIpc(ipcContext)
  registerGitIpc(ipcContext)
  registerAssetsIpc(ipcContext)
  registerDocumentsIpc(ipcContext)
  registerPreviewIpc(ipcContext)

  connectApplicationMenu(send)
  // macOS keeps its global application menu; other platforms use our menu button.
  if (process.platform !== 'darwin') {
    window.setAutoHideMenuBar(false)
    window.setMenuBarVisibility(false)
  }
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown')
      return
    const terminalInput
      = terminalFocused && !(process.platform === 'darwin' && input.meta)
    window.webContents.setIgnoreMenuShortcuts(terminalInput)
    if (terminalInput)
      return
    const modifier = (process.platform === 'darwin' ? input.meta : input.control) && !input.alt
    const key = input.key.toLowerCase()
    if (
      (modifier && input.shift && key === 'w')
      || (process.platform !== 'darwin' && input.alt && key === 'f4')
    ) {
      event.preventDefault()
      window.close()
      return
    }
    if (
      (process.platform === 'darwin'
        && input.meta
        && input.control
        && key === 'f')
      || (process.platform !== 'darwin' && key === 'f11')
    ) {
      event.preventDefault()
      chrome.perform('fullscreen')
      return
    }
    if (process.platform !== 'darwin' && input.alt && key === 'm') {
      event.preventDefault()
      chrome.perform('menu')
      return
    }
    if (
      process.platform !== 'darwin'
      && modifier
      && !input.alt
      && ((key === 'r' && !input.shift) || (key === 'i' && input.shift))
    ) {
      event.preventDefault()
      if (key === 'r')
        window.webContents.reload()
      else window.webContents.toggleDevTools()
      return
    }
    const command
      = modifier && key === 'z'
        ? input.shift
          ? 'redo'
          : 'undo'
        : modifier && key === 's'
          ? input.shift
            ? 'save-all'
            : 'save'
          : modifier && key === 'w' && !input.shift
            ? 'close-tab'
            : modifier && key === ','
              ? 'settings'
              : modifier && key === 'o'
                ? 'open-project'
                : modifier && input.shift && key === 'r'
                  ? 'refresh-project'
                  : input.alt && input.shift && key === 'f'
                    ? 'format'
                    : undefined
    if (command) {
      event.preventDefault()
      send('editor:command', command)
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.on('close', (event) => {
    if (closing)
      return
    event.preventDefault()
    if (closePending)
      return
    closePending = true
    void (async () => {
      if (documentDirty) {
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          message: '存在尚未保存的文档',
          detail: '关闭编辑器将丢弃当前修改。',
          buttons: ['继续编辑', '放弃修改并关闭'],
          defaultId: 0,
          cancelId: 0,
        })
        if (result.response !== 1)
          return
      }
      if (!(await writer.mayClose()))
        return
      await plugins.cancel()
      await publisher.cancel()
      await publisher.release()
      await build.cancel()
      await runtime.cancel()
      await previews.stop()
      await hostPlugins.dispose()
      authoring.dispose()
      await resetTerminals()
      search.cancel()
      for (const preview of assetPreviewWindows.values()) preview.close()
      assetPreviewWindows.clear()
      presentation.close()
      clearInterval(gitTimer)
      git.close()
      assets.reset()
      await project.close()
      closing = true
      window.destroy()
      app.quit()
    })()
      .catch(error => dialog.showErrorBox('无法关闭编辑器', String(error)))
      .finally(() => {
        closePending = false
      })
  })
  app.on('window-all-closed', () => app.quit())
  const projectArgument = process.argv.indexOf('--project')
  if (projectArgument >= 0 && process.argv[projectArgument + 1]) {
    try {
      currentProject = await project.request<EditorProject>(
        'open',
        resolve(process.argv[projectArgument + 1]),
      )
      currentProject = (await syncPlugins()) ?? currentProject
    }
    catch (error) {
      dialog.showErrorBox('项目无法打开', String(error))
    }
  }
  await window.loadFile(
    fileURLToPath(new URL('../../ui/dist/index.html', import.meta.url)),
  )
  window.setTitle(currentProject ? `${currentProject.name} — QuaEngine Editor` : 'QuaEngine Editor')
  window.show()
  void ensureRuntime(true).catch(() => {})
}
void main().catch((error) => {
  dialog.showErrorBox('Editor failed to start', String(error))
  app.exit(1)
})
