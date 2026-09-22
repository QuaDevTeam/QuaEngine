import type {
  EditorCreateProject,
  EditorFileMenuAction,
  EditorFileOperation,
  EditorProject,
  EditorSearchRequest,
} from '@quajs/editor-core'
import type { MainServices } from './services.js'
import { fileURLToPath } from 'node:url'
import {
  dialog,
  Menu,
  shell,
} from 'electron'
import { createEditorProject } from '../../project-service/scaffold.js'

export function registerProjectIpc(context: Pick<MainServices, 'handle' | 'window' | 'projectLocation' | 'pluginOperation' | 'projectOpening' | 'closing' | 'closePending' | 'openRoot' | 'ensureRuntime' | 'runtime' | 'currentProject' | 'documentDirty' | 'previews' | 'fileOperationBusy' | 'project' | 'git' | 'syncPlugins' | 'search'>): void {
  context.handle(
    'editor:navigation-menu',
    (
      items: {
        id: string
        label: string
        checked: boolean
        enabled: boolean
      }[],
    ) => {
      if (
        !Array.isArray(items)
        || items.length > 100
        || items.some(
          item =>
            !item
            || typeof item.id !== 'string'
            || item.id.length > 200
            || typeof item.label !== 'string'
            || item.label.length > 100
            || typeof item.checked !== 'boolean'
            || typeof item.enabled !== 'boolean',
        )
      ) {
        throw new Error('无效的导航菜单。')
      }
      return new Promise<string | undefined>((resolve) => {
        let selected: string | undefined
        Menu.buildFromTemplate(
          items.map(item => ({
            id: item.id,
            label: item.label,
            type: 'checkbox' as const,
            checked: item.checked,
            enabled: item.enabled,
            click: () => {
              selected = item.id
            },
          })),
        ).popup({ window: context.window, callback: () => resolve(selected) })
      })
    },
  )
  context.handle('editor:project-location', async () => {
    const result = await dialog.showOpenDialog(context.window, { title: '选择新项目的父目录', properties: ['openDirectory', 'createDirectory'] })
    context.projectLocation = result.canceled ? undefined : result.filePaths[0]
    return context.projectLocation
  })
  context.handle('editor:create', async (request: EditorCreateProject) => {
    if (context.pluginOperation || context.projectOpening || context.closing || context.closePending || !context.projectLocation)
      throw new Error('请先选择项目位置，并等待当前操作结束。')
    context.projectOpening = true
    try {
      return await context.openRoot(await createEditorProject(context.projectLocation, request, fileURLToPath(new URL('./sdk', import.meta.url))))
    }
    finally {
      context.projectOpening = false
      void context.ensureRuntime(true).catch(() => {})
    }
  })
  context.handle('editor:runtime-state', () => context.runtime.snapshot())
  context.handle('editor:runtime-cancel', () => context.runtime.cancel())
  context.handle('editor:runtime-repair', async (root: string) => {
    if (root !== context.currentProject?.root || context.pluginOperation || context.projectOpening || context.documentDirty)
      throw new Error('请先保存文档，并等待当前操作结束。')
    await context.previews.stop()
    return context.ensureRuntime(true)
  })
  context.handle('editor:open', async () => {
    if (context.pluginOperation || context.projectOpening || context.closing || context.closePending)
      throw new Error('请先完成或取消插件安装。')
    context.projectOpening = true
    try {
      const result = await dialog.showOpenDialog(context.window, {
        title: '打开 QuaEngine 项目或插件包',
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0])
        return undefined
      return await context.openRoot(result.filePaths[0])
    }
    finally {
      context.projectOpening = false
      void context.ensureRuntime(true).catch(() => {})
    }
  })
  context.handle('editor:current', () => context.currentProject)
  context.handle(
    'editor:file-menu',
    (root: string, path: string, canPaste: boolean) => {
      if (
        root !== context.currentProject?.root
        || (path
          && !context.currentProject.entries.some(entry => entry.path === path)
          && !context.currentProject.directories.includes(path))
      ) {
        throw new Error('项目或文件已变化。')
      }
      return new Promise<EditorFileMenuAction | undefined>((resolve) => {
        let selected: EditorFileMenuAction | undefined
        const item = (
          action: EditorFileMenuAction,
          label: string,
          enabled = true,
        ) => ({
          id: `file-${action}`,
          label,
          enabled,
          click: () => {
            selected = action
          },
        })
        Menu.buildFromTemplate([
          item('new-file', '新建文件…'),
          item('new-folder', '新建文件夹…'),
          { type: 'separator' },
          item('cut', '剪切', Boolean(path)),
          item('copy', '复制', Boolean(path)),
          item('paste', '粘贴', canPaste === true),
          item('copy-path', '复制相对路径', Boolean(path)),
          { type: 'separator' },
          item('rename', '重命名…', Boolean(path)),
          item('delete', '移至废纸篓…', Boolean(path)),
          { type: 'separator' },
          item('reveal', '在系统文件管理器中显示', Boolean(path)),
        ]).popup({ window: context.window, callback: () => resolve(selected) })
      })
    },
  )
  context.handle(
    'editor:file-operation',
    async (root: string, operation: EditorFileOperation) => {
      if (root !== context.currentProject?.root || context.fileOperationBusy || context.pluginOperation)
        throw new Error('项目已切换或正在处理文件操作。')
      context.fileOperationBusy = true
      try {
        if (operation?.kind === 'delete') {
          const confirmation = await dialog.showMessageBox(context.window, {
            type: 'question',
            message: `将“${operation.path}”移至废纸篓？`,
            detail:
              '文件夹会连同其内容移动。未保存的编辑内容会保留在打开的 Tab 中。',
            buttons: ['取消', '移至废纸篓'],
            defaultId: 0,
            cancelId: 0,
          })
          if (confirmation.response !== 1 || root !== context.currentProject?.root)
            return { applied: false }
          const path = await context.project.request<string>(
            'mutationPath',
            root,
            operation.path,
          )
          await shell.trashItem(path)
        }
        else {
          await context.project.request('fileOperation', root, operation)
        }
        const snapshot = await context.project.request<EditorProject>('refresh')
        void context.git.status(root).catch(() => {})
        return { applied: true, project: snapshot }
      }
      catch (error) {
        // Copies can fail partway; still show any files already created.
        await context.project.request('refresh').catch(() => {})
        throw error
      }
      finally {
        context.fileOperationBusy = false
      }
    },
  )
  context.handle('editor:refresh', () => context.syncPlugins())
  context.handle('editor:check-project', (root: string) => {
    if (root !== context.currentProject?.root)
      throw new Error('项目已切换。')
    return context.project.request('check', root)
  })
  context.handle('editor:search', (request: EditorSearchRequest) =>
    context.search.search(context.currentProject, request))
  context.handle('editor:search-cancel', () => context.search.cancel())
  context.handle(
    'editor:sync-documents',
    (root: string, documents: { path: string, text: string }[]) => {
      if (root !== context.currentProject?.root)
        throw new Error('项目已切换。')
      return context.project.request('syncDocuments', root, documents)
    },
  )
}
