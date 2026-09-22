import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-window-smoke-')))
const artifacts = resolve(root, '.codex-tmp/editor-window-smoke')
await mkdir(artifacts, { recursive: true })
await writeFile(join(temporary, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Window fixture', bundleId: 'dev.qua.window', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'window-fixture', scripts: { 'dev:web': 'vite' } }))
await writeFile(join(temporary, 'scene.qs'), 'Mara: 窗口测试。\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let application
let page
try {
  application = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', temporary], env, timeout: 60000 })
  page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
  await page.locator(`.titlebar[data-platform="${platform}"]`).waitFor()
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    globalThis.windowSmokeActions = []
    const handler = ipcMain._invokeHandlers.get('editor:window-action')
    ipcMain.removeHandler('editor:window-action')
    ipcMain.handle('editor:window-action', async (...args) => {
      globalThis.windowSmokeActions.push(args[1])
      return handler(...args)
    })
    const window = BrowserWindow.getAllWindows()[0]
    globalThis.windowSmokeEvents = []
    for (const name of ['enter-full-screen', 'leave-full-screen', 'focus', 'blur', 'restore'])
      window.on(name, () => globalThis.windowSmokeEvents.push(name))
  })
  await application.evaluate(({ app, BrowserWindow }) => {
    app.focus({ steal: true })
    BrowserWindow.getAllWindows()[0].focus()
  })
  const dimensions = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { bounds: window.getBounds(), content: window.getContentBounds(), menu: window.isMenuBarVisible() }
  })
  // A native caption would add height outside the client area.
  assert.ok(Math.abs(dimensions.bounds.height - dimensions.content.height) <= (platform === 'windows' ? 16 : 0))
  if (platform !== 'macos')
    assert.equal(dimensions.menu, false)
  const controls = await page.locator('.window-controls button').evaluateAll(buttons => buttons.map(button => button.id))
  assert.deepEqual(controls, platform === 'macos' ? ['window-close', 'window-minimize', 'window-maximize'] : ['window-minimize', 'window-maximize', 'window-close'])
  assert.equal(await page.locator('.titlebar').evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'drag')
  assert.equal(await page.locator('#window-close').evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'no-drag')
  const before = await page.evaluate(() => window.quaEditor.windowState())
  await assert.rejects(page.evaluate(() => window.quaEditor.windowAction('invalid')), /无效的窗口操作/)
  assert.equal((await page.evaluate(() => window.quaEditor.windowState())).maximized, before.maximized)
  await page.screenshot({ path: join(artifacts, `${platform}-titlebar.png`) })

  await page.locator('.titlebar strong').dblclick()
  await page.waitForFunction(async () => (await window.quaEditor.windowState()).maximized)
  await page.locator('.titlebar strong').dblclick()
  await page.waitForFunction(async () => !(await window.quaEditor.windowState()).maximized)
  await page.locator('#window-minimize').click()
  assert.equal(await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    for (let attempt = 0; attempt < 50; attempt++) {
      if (window.isMinimized())
        return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }), true)
  await application.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.restore()
    app.focus({ steal: true })
    window.focus()
  })
  await page.waitForFunction(() => document.visibilityState === 'visible')
  await page.waitForFunction(async () => (await window.quaEditor.windowState()).focused)
  if (platform === 'macos') {
    await page.locator('#window-maximize').click()
    await page.locator('.titlebar.fullscreen').waitFor()
    assert.equal(await page.locator('#window-maximize').getAttribute('aria-label'), '退出全屏')
    await page.locator('#window-maximize').click()
    await page.waitForFunction(() => !document.querySelector('.titlebar').classList.contains('fullscreen'))
  }
  else {
    await page.locator('#window-maximize').click()
    await page.locator('#window-maximize[aria-label="还原窗口"]').waitFor()
    await page.locator('#window-maximize').click()
    await page.locator('#window-maximize[aria-label="最大化"]').waitFor()
  }
  // The workbench dropdown shares commands with the global application menu.
  await application.evaluate(({ Menu }) => {
    const popup = Menu.prototype.popup
    Menu.prototype.popup = function (options) {
      globalThis.windowSmokeMenu = this
      return popup.call(this, options)
    }
  })
  await page.locator('#window-menu').click()
  await application.evaluate(() => globalThis.windowSmokeMenu.closePopup())
  await page.locator('#files [data-path="scene.qs"]').click()
  await page.locator('#editor .view-lines').filter({ hasText: '窗口测试' }).waitFor()
  await page.keyboard.insertText('Mara: 未保存。\n')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => {
      globalThis.closePrompt = options
      return { response: 0, checkboxChecked: false }
    }
  })
  await page.locator('#window-close').click()
  await page.waitForFunction(async () => (await window.quaEditor.windowState()).platform)
  const prompt = await application.evaluate(() => globalThis.closePrompt)
  assert.equal(prompt.message, '存在尚未保存的文档')
  assert.equal(await page.locator('.document-tab.active .tab-close').textContent(), '●')
  assert.equal(application.windows().length, 1)
  // Keyboard commands and native menu entries remain available in the frameless window.
  await page.keyboard.press('ControlOrMeta+,')
  await page.locator('dialog[open]').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await application.evaluate(({ Menu }) => Boolean(Menu.getApplicationMenu().getMenuItemById('open-project'))), true)
  assert.deepEqual(errors, [])
  process.stdout.write(`${platform}: frameless content, drag/control hit regions, zoom/restore, minimize/restore, fullscreen or window controls, rejected unknown IPC, unsaved close protection and settings shortcut passed\n`)
}
catch (error) {
  process.stderr.write(`${JSON.stringify(await application?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ actions: globalThis.windowSmokeActions, events: globalThis.windowSmokeEvents, fullscreenable: window.isFullScreenable(), minimized: window.isMinimized(), maximized: window.isMaximized(), fullscreen: window.isFullScreen(), focused: window.isFocused(), bounds: window.getBounds() }))).catch(() => []))}\n`)
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application?.evaluate(({ dialog, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window?.isFullScreen())
      window.setFullScreen(false)
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await application?.close()
  await rm(temporary, { recursive: true, force: true })
}
