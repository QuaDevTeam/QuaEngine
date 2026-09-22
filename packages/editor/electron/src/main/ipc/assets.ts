import type {
  EditorImportResult,
} from '@quajs/editor-core'
import type { MainServices } from './services.js'
import { fileURLToPath } from 'node:url'
import {
  BrowserWindow,
  dialog,
  shell,
} from 'electron'
import { projectPath } from '../../project-service/asset-files.js'

export function registerAssetsIpc(context: Pick<MainServices, 'handle' | 'assets' | 'currentProject' | 'project' | 'window' | 'assetPreviewWindows'>): void {
  context.handle('editor:asset-url', (root: string, path: string, thumbnail: boolean) =>
    context.assets.url(root, path, thumbnail))
  context.handle('editor:image-metadata', (root: string, path: string) => {
    if (root !== context.currentProject?.root)
      throw new Error('项目已切换。')
    return context.project.request('imageMetadata', root, path)
  })
  context.handle('editor:reveal', async (root: string, path: string) => {
    if (!context.currentProject || root !== context.currentProject.root)
      throw new Error('项目已切换。')
    const canonical = await projectPath(
      root,
      path,
      context.currentProject.directories.includes(path),
    )
    if (root !== context.currentProject?.root)
      throw new Error('项目已切换。')
    shell.showItemInFolder(canonical)
  })
  context.handle('editor:import-assets', async (root: string, directory: string) => {
    if (!context.currentProject || root !== context.currentProject.root)
      throw new Error('项目已切换。')
    await projectPath(root, directory, true)
    const selected = await dialog.showOpenDialog(context.window, {
      title: '导入媒体资源（同名文件将跳过）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '媒体与资源包',
          extensions: [
            'png',
            'jpg',
            'jpeg',
            'webp',
            'gif',
            'avif',
            'svg',
            'bmp',
            'ico',
            'mp3',
            'wav',
            'ogg',
            'flac',
            'm4a',
            'aac',
            'opus',
            'mp4',
            'webm',
            'mov',
            'm4v',
            'ogv',
            'ttf',
            'otf',
            'woff',
            'woff2',
            'qpk',
            'zip',
          ],
        },
      ],
    })
    if (selected.canceled)
      return { imported: [], skipped: [] }
    if (root !== context.currentProject?.root)
      throw new Error('项目已切换。')
    const result = await context.project.request<EditorImportResult>(
      'importAssets',
      root,
      directory,
      selected.filePaths,
    )
    await context.project.request('refresh')
    return result
  })
  context.handle('editor:asset-preview-open', async (root: string, path: string) => {
    if (!context.currentProject || root !== context.currentProject.root)
      throw new Error('项目已切换。')
    const entry = context.currentProject.entries.find(item => item.path === path)
    if (!entry || !['image', 'audio', 'video'].includes(entry.kind))
      throw new Error('该素材不支持独立预览。')
    const source = context.assets.url(root, path, false)
    const preview = new BrowserWindow({
      parent: context.window,
      width: 1120,
      height: 780,
      minWidth: 560,
      minHeight: 400,
      show: false,
      frame: false,
      backgroundColor: '#121519',
      title: `${path} — 素材预览`,
      webPreferences: {
        preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    context.assetPreviewWindows.set(preview.webContents.id, preview)
    const previewContentsId = preview.webContents.id
    preview.once('closed', () => context.assetPreviewWindows.delete(previewContentsId))
    await preview.loadFile(
      fileURLToPath(new URL('../../ui/dist/asset.html', import.meta.url)),
      { query: { src: source, name: path, kind: entry.kind } },
    )
    if (!preview.isDestroyed())
      preview.show()
  })
}
