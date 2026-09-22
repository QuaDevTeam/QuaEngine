import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { Menu } from 'electron'

let applicationDropdown: Menu | undefined

function editorMenuTemplate(send: (channel: string, value: unknown) => void): MenuItemConstructorOptions[] {
  return [
    {
      label: '文件',
      submenu: [
        {
          id: 'new-project',
          label: '新建项目…',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('editor:command', 'new-project'),
        },
        {
          id: 'open-project',
          label: '打开项目…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('editor:command', 'open-project'),
        },
        {
          id: 'refresh-project',
          label: '刷新项目',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => send('editor:command', 'refresh-project'),
        },
        { id: 'build-project', label: '生产打包…', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('editor:command', 'build-project') },
        { type: 'separator' },
        ...(
          ['save', 'save-all', 'close-tab', 'settings', 'format'] as const
        ).map((command, index) => ({
          id: command,
          label: [
            '保存',
            '全部保存',
            '关闭编辑器 Tab',
            '设置…',
            '格式化文档',
          ][index],
          accelerator: [
            'CmdOrCtrl+S',
            'CmdOrCtrl+Shift+S',
            'CmdOrCtrl+W',
            'CmdOrCtrl+,',
            'Shift+Alt+F',
          ][index],
          click: () => send('editor:command', command),
        })),
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        {
          label: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          click: () => send('editor:command', 'undo'),
        },
        {
          label: '重做',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => send('editor:command', 'redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '终端',
      submenu: [
        {
          label: '显示 / 隐藏终端',
          click: () => send('editor:command', 'terminal'),
        },
        {
          label: '新建终端',
          click: () => send('editor:command', 'new-terminal'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
}

export function connectApplicationMenu(send: (channel: string, value: unknown) => void): void {
  const template = editorMenuTemplate(send)
  applicationDropdown = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    ...template,
  ]))
}

/** Reuse the application commands in an OS dropdown below the workbench button. */
export function showApplicationMenu(window: BrowserWindow, position?: unknown): Promise<void> {
  let point = { x: 8, y: 36 }
  if (position !== undefined) {
    if (!position || typeof position !== 'object' || !('x' in position) || !('y' in position)
      || typeof position.x !== 'number' || typeof position.y !== 'number'
      || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error('无效的菜单位置。')
    }
    const [width, height] = window.getContentSize()
    const zoom = window.webContents.getZoomFactor()
    point = { x: Math.round(Math.max(0, Math.min(width, position.x * zoom))), y: Math.round(Math.max(0, Math.min(height, position.y * zoom))) }
  }
  const menu = applicationDropdown
  if (!menu)
    return Promise.resolve()
  return new Promise(resolve => menu.popup({ window, ...point, callback: resolve }))
}
