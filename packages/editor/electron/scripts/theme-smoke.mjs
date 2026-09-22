import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-theme-'))
const project = join(temporary, 'project')
const artifacts = join(root, '.codex-tmp/editor-theme-smoke')
await mkdir(project)
await mkdir(artifacts, { recursive: true })
await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Theme fixture', bundleId: 'dev.qua.theme', icons: { favicon: 'sample.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'theme-fixture' }))
const source = '// 主题切换保留文档\n凛: 今天的风很轻。\n旁白: 远处传来了钟声。\n'
await writeFile(join(project, 'scene.qs'), source)
await writeFile(join(project, 'characters.ts'), 'import { registerCharacters } from "@quajs/character"\nregisterCharacters([{ id: "rin", displayName: "凛" }])\n')
await writeFile(join(project, 'enter.animation.json'), JSON.stringify({ id: 'enter', duration: 1000, tracks: [{ target: 'self', property: 'position.x', keyframes: [{ at: 0, value: 640 }, { at: 1000, value: 1280 }] }] }))
await require('sharp')({ create: { width: 64, height: 64, channels: 4, background: '#ad4c6c' } }).png().toFile(join(project, 'sample.png'))

const env = { ...process.env, SHELL: '/bin/sh' }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', project, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 30000 })
const page = await app.firstWindow()
page.setDefaultTimeout(15000)
const errors = []
process.stdout.write('Theme fixture launched.\n')
page.on('pageerror', error => errors.push(error.message))
const capture = name => page.screenshot({ path: join(artifacts, `${name}.png`) })
const mode = value => page.waitForFunction(value => document.documentElement.dataset.theme === value, value)
async function appearance() {
  await page.locator('#settings-button').click()
  await page.locator('.settings-nav').getByRole('button', { name: '外观', exact: true }).click()
}
async function contrast() {
  const result = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const color = token => style.getPropertyValue(`--editor-${token}`).trim()
    const rgb = (hex) => {
      const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c.repeat(2)).join('')}` : hex
      return [1, 3, 5].map(start => Number.parseInt(full.slice(start, start + 2), 16))
    }
    const luminance = channels => channels.reduce((sum, v, i) => {
      const c = v / 255
      return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]
    }, 0)
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
    const values = []
    for (const bg of ['bg', 'surface', 'raised', 'input-bg', 'selection']) {
      for (const fg of ['text', 'muted'])
        values.push({ pair: `${fg}/${bg}`, ratio: ratio(rgb(color(fg)), rgb(color(bg))) })
    }
    for (const fg of ['accent', 'danger', 'warning', 'success', 'info', 'purple', 'cyan', 'orange', 'comment', 'keyword', 'string', 'number', 'function', 'type', 'line-number'])
      values.push({ pair: `${fg}/code-bg`, ratio: ratio(rgb(color(fg)), rgb(color('code-bg'))) })
    values.push({ pair: 'placeholder/input-bg', ratio: ratio(rgb(color('placeholder')), rgb(color('input-bg'))) })
    values.push({ pair: 'primary label', ratio: ratio(rgb(color('on-primary')), rgb(color('primary'))) })
    const background = rgb(color('code-bg'))
    for (const el of document.querySelectorAll('.view-lines [class*="qua-speaker-"]')) {
      const text = getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number)
      values.push({ pair: el.className, ratio: ratio(text, background) })
    }
    return values
  })
  for (const entry of result) assert.ok(entry.ratio >= 4.5, JSON.stringify(entry))
  return result
}
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900))
  await page.locator('#files[data-project-name="Theme fixture"]').waitFor()
  await page.emulateMedia({ colorScheme: 'light' })
  await mode('light')
  assert.equal(await page.locator('html').getAttribute('data-color-theme'), 'qua')
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('.view-lines [class*="qua-speaker-"]').first().waitFor()
  await page.locator('#tab-terminal').click()
  await page.locator('.terminal-instance .xterm-helper-textarea').waitFor()
  const session = await page.locator('#terminal-sessions').inputValue()
  await page.evaluate(() => {
    globalThis.themeSmokeNodes = [document.querySelector('#editor .monaco-editor'), document.querySelector('.terminal-instance')]
  })
  const metrics = {}
  for (const colorMode of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: colorMode })
    await mode(colorMode)
    metrics[colorMode] = await contrast()
    assert.equal(await page.locator('#terminal-sessions').inputValue(), session)
    assert.equal(await page.evaluate(() => globalThis.themeSmokeNodes.every(node => node.isConnected)), true)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.xterm-viewport')).backgroundColor === getComputedStyle(document.querySelector('#panel-terminal')).backgroundColor)
    await capture(`workbench-${colorMode}`)
    await appearance()
    assert.equal(await page.getByLabel('明暗模式', { exact: true }).inputValue(), 'system')
    await capture(`settings-${colorMode}`)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '角色浏览器', exact: true }).click()
    await page.getByLabel('角色名称', { exact: true }).waitFor()
    await capture(`character-${colorMode}`)
    await page.getByRole('tab', { name: '动画', exact: true }).click()
    await page.getByLabel('动画 ID', { exact: true }).waitFor()
    await page.getByLabel('时长 ms', { exact: true }).fill('1500')
    await page.getByLabel('时长 ms', { exact: true }).press('Tab')
    await capture(`animation-${colorMode}`)
    await page.locator('#tab-terminal').click()
  }
  await appearance()
  await page.getByLabel('明暗模式', { exact: true }).selectOption('light')
  await mode('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await mode('light')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '动画', exact: true }).click()
  assert.equal(await page.getByLabel('时长 ms', { exact: true }).inputValue(), '1500')
  await page.getByRole('tab', { name: '角色浏览器', exact: true }).click()
  await page.getByLabel('角色名称', { exact: true }).fill('未保存的角色草稿')
  await appearance()
  await page.getByLabel('颜色主题', { exact: true }).selectOption('graphite')
  metrics.graphiteLight = await contrast()
  await capture('graphite-light')
  await page.getByLabel('明暗模式', { exact: true }).selectOption('dark')
  await mode('dark')
  metrics.graphiteDark = await contrast()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByLabel('角色名称', { exact: true }).inputValue(), '未保存的角色草稿')
  // Both kinds of popout share profile colors while game pixels stay separate.
  const previewEvent = app.waitForEvent('window')
  await page.evaluate(() => window.quaEditor.presentPreview('window'))
  const preview = await previewEvent
  preview.on('pageerror', error => errors.push(error.message))
  await preview.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.colorTheme === 'graphite')
  const windowEvent = app.waitForEvent('window')
  await page.evaluate(async () => {
    const project = await window.quaEditor.currentProject()
    await window.quaEditor.openAssetPreview(project.root, 'sample.png')
  })
  const popout = await windowEvent
  popout.on('pageerror', error => errors.push(error.message))
  await popout.locator('.asset-preview-media').waitFor()
  await popout.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.colorTheme === 'graphite')
  await appearance()
  await page.getByLabel('颜色主题', { exact: true }).selectOption('qua')
  await page.getByLabel('明暗模式', { exact: true }).selectOption('light')
  await popout.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.colorTheme === 'qua')
  await preview.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.colorTheme === 'qua')
  await popout.screenshot({ path: join(artifacts, 'asset-light.png') })
  await preview.screenshot({ path: join(artifacts, 'preview-light.png') })
  await popout.close()
  await preview.getByRole('button', { name: '返回编辑器', exact: true }).click()
  await page.waitForFunction(async () => !(await window.quaEditor.previewState()).detached)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 650))
  await capture('settings-compact')
  assert.equal(await page.locator('#settings-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false)
  await page.keyboard.press('Escape')
  await page.reload()
  await page.locator('#files[data-project-name="Theme fixture"]').waitFor()
  await mode('light')
  await appearance()
  assert.equal(await page.getByLabel('明暗模式', { exact: true }).inputValue(), 'light')
  await page.getByRole('button', { name: '恢复明暗模式的默认值', exact: true }).click()
  await mode('dark')
  assert.equal(await page.getByLabel('明暗模式', { exact: true }).inputValue(), 'system')
  assert.equal(await readFile(join(project, 'scene.qs'), 'utf8'), source)
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'contrast.json'), JSON.stringify(metrics, null, 2))
  process.stdout.write('Themes passed: system changes, fixed mode, both palettes, contrast, Monaco/dialogue, retained terminal and plugin drafts, popout synchronization, persistence/reset and compact settings.\n')
}
catch (error) {
  await capture('failure').catch(() => {})
  console.error(errors)
  throw error
}
finally {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {})
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
