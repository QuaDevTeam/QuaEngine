import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { closeTestEditor, editorTestApp, firstTestWindow } from './smoke-profile.mjs'

const editor = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(join(editor, 'package.json'))
const artifacts = fileURLToPath(new URL('../../../../.codex-tmp/editor-keyboard/', import.meta.url))
await mkdir(artifacts, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'qua-keyboard-'))
const env = { ...process.env, SHELL: '/bin/sh' }
delete env.ELECTRON_RUN_AS_NODE

let app
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [editorTestApp, `--user-data-dir=${profile}`], env })
  const page = await firstTestWindow(app)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#editor-empty h3').waitFor()
  const settings = page.locator('#settings-dialog')
  const font = settings.getByLabel('字体大小', { exact: true })
  const reset = settings.getByRole('button', { name: '恢复字体大小的默认值' })
  await page.locator('#settings-button').click()
  for (const button of await settings.locator('.settings-nav button:not(.settings-modified)').all()) {
    await button.click()
    assert.equal(await settings.locator('.settings-content qua-empty-state').count(), 0, `empty settings category: ${await button.textContent()}`)
  }
  await settings.getByRole('button', { name: '代码编辑器', exact: true }).click()
  for (const invalid of ['200', '']) {
    await font.fill(invalid)
    await font.press('Tab')
    assert.equal(await font.getAttribute('aria-invalid'), 'true')
    await settings.getByRole('switch', { name: '字体连字' }).click()
    assert.equal(await font.inputValue(), invalid, 'changing another preference erased a rejected draft')
    assert.equal(await reset.isEnabled(), true, 'invalid draft must be recoverable even from a saved default')
    const savedSize = await page.evaluate(() => JSON.parse(localStorage.getItem('qua-editor-preferences-v1')).fontSize)
    assert.equal(savedSize, 13)
    await reset.click()
    assert.equal(await font.inputValue(), '13')
    assert.equal(await font.evaluate(input => input.checkValidity()), true)
  }
  await font.fill('200')
  await font.press('Tab')
  await settings.getByRole('button', { name: '恢复默认设置', exact: true }).click()
  assert.equal(await font.inputValue(), '13')
  const assertWindowFit = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.clientWidth === innerWidth && document.body.scrollHeight <= innerHeight), true, 'workbench chrome causes page scrolling')
  }
  await settings.getByRole('button', { name: '工作区', exact: true }).click()
  const density = settings.getByLabel('控件密度', { exact: true })
  for (const value of ['comfortable', 'compact']) {
    await density.selectOption(value)
    await page.waitForFunction(value => document.body.dataset.density === value, value)
    await assertWindowFit()
  }
  await settings.getByRole('button', { name: '外观', exact: true }).click()
  for (const [width, height] of [[1280, 850], [800, 650]]) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [width, height])
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height])
    await assertWindowFit()
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme })
      await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, colorScheme)
      for (const region of [settings, settings.locator('.settings-content')]) {
        assert.equal(await region.evaluate(node => node.scrollWidth <= node.clientWidth), true)
      }
      await page.screenshot({ animations: 'disabled', path: join(artifacts, `settings-${width}-${colorScheme}.png`) })
    }
  }
  await page.keyboard.press('Escape')
  // Selecting an off-screen tab through the keyboard picker must reveal it,
  // and closing it must keep navigation in the same dock group.
  await page.locator('#workbench-views').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: '搜索视图' }).fill('performance')
  await page.keyboard.press('Enter')
  const tab = page.locator('#tab-performance')
  assert.equal(await tab.getAttribute('aria-selected'), 'true')
  assert.equal(await tab.evaluate(el => el === document.activeElement), true, 'picker must focus the selected tab')
  const visible = await tab.evaluate((el) => {
    const strip = el.closest('[role="tablist"]').getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return rect.left >= strip.left - 1 && rect.right <= strip.right + 1
  })
  assert.equal(visible, true, 'selected tab is clipped by the scrollable tabstrip')
  const group = page.locator('qua-dock-group[data-dock-group="tools"]')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.matches('.dock-tab-close')), true)
  await page.keyboard.press('Enter')
  const replacement = group.getByRole('tab', { selected: true })
  assert.equal(await replacement.count(), 1)
  assert.equal(await replacement.evaluate(el => el === document.activeElement), true, 'close should focus the replacement in this group')
  assert.deepEqual(errors, [])
  process.stdout.write('Workbench keyboard and settings recovery passed.\n')
}
finally {
  await closeTestEditor(app)
  await rm(profile, { recursive: true, force: true })
}
