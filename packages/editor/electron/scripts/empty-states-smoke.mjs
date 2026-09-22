import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-empty-states-'))
const project = join(temporary, 'project')
const artifacts = join(root, '.codex-tmp/editor-empty-states')
await mkdir(project)
await mkdir(artifacts, { recursive: true })
await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Empty states', bundleId: 'dev.qua.empty', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(project, 'package.json'), '{"name":"empty-states","scripts":{"dev:web":"vite"}}')
await writeFile(join(project, 'notes.md'), '# A new story\n')
const env = { ...process.env, SHELL: '/bin/sh' }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(temporary, 'profile')}`], env })
const page = await app.firstWindow()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function capture(name) {
  await page.screenshot({ path: join(artifacts, `${name}.png`) })
}
async function command(text) {
  await page.locator('.terminal-instance:not([hidden]) .xterm-helper-textarea').focus()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
}
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800))
  await page.locator('#editor-empty .editor-empty-copy h3').waitFor()
  assert.equal(await page.locator('#editor-empty h3').textContent(), '开始创作')
  assert.equal(await page.locator('.explorer-empty h3').textContent(), '尚未打开项目')
  assert.equal(await page.locator('.console-empty h3').textContent(), '暂无调试输出')
  await capture('no-project')
  await page.locator('.dock-separator[data-split-id="main"]').focus()
  while (await page.locator('#panel-console').evaluate(panel => panel.getBoundingClientRect().height) > 160)
    await page.keyboard.press('ArrowDown')
  for (const panel of ['problems', 'assets', 'performance', 'scene-debugger']) {
    await page.locator(`#tab-${panel}`).click()
    await page.locator(`#panel-${panel} .editor-empty-state`).waitFor()
    const geometry = await page.locator(`#panel-${panel} .editor-empty-state`).evaluate((empty) => {
      const box = empty.getBoundingClientRect()
      const content = empty.querySelector('.editor-empty-copy').getBoundingClientRect()
      return { box: box.toJSON(), content: content.toJSON(), direction: getComputedStyle(empty).flexDirection }
    })
    assert.equal(geometry.direction, 'row', 'short panels use a compact horizontal empty state')
    assert.ok(geometry.content.top >= geometry.box.top && geometry.content.bottom <= geometry.box.bottom, 'copy fits the short panel')
    await capture(`empty-${panel}`)
  }
  await page.locator('.dock-separator[data-split-id="main"]').dblclick()
  assert.equal((await app.evaluate(({ app }) => app.getAppMetrics().filter(item => item.name === 'QuaEngine Terminal'))).length, 0)
  await page.locator('#tab-terminal').click()
  await page.locator('.terminal-instance .xterm-helper-textarea').waitFor()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions')?.options.length === 1)
  assert.equal(await page.locator('.terminal-cwd').textContent(), homedir())
  await command('stty -echo; printf "HOME_SHELL_READY\\n"')
  await page.waitForFunction(() => document.querySelector('.terminal-instance .xterm-rows')?.textContent.includes('HOME_SHELL_READY'))
  const homeSession = await page.locator('#terminal-sessions').inputValue()
  await page.locator('#tab-console').click()
  await page.locator('#tab-terminal').click()
  assert.equal(await page.locator('#terminal-sessions').inputValue(), homeSession)
  assert.equal(await page.locator('.terminal-tab').count(), 1)
  await capture('home-terminal')

  await app.evaluate(({ dialog, Menu }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    Menu.getApplicationMenu().getMenuItemById('open-project').click()
  }, project)
  await page.locator('#files[data-project-name="Empty states"]').waitFor()
  await page.waitForFunction(root => document.querySelector('.terminal-cwd')?.textContent === root, await realpath(project))
  assert.equal(await page.locator('.terminal-tab').count(), 1)
  assert.notEqual(await page.locator('#terminal-sessions').inputValue(), homeSession)
  assert.equal(await page.locator('#editor-empty h3').textContent(), '尚未打开文件')
  await page.locator('#welcome-find').click()
  await page.locator('#quick-open-input').fill('notes.md')
  await page.locator('#quick-open-results [data-path="notes.md"]').waitFor()
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: 'notes.md' }).waitFor()
  assert.equal(await page.locator('#editor-empty').isVisible(), false)
  await page.locator('#tab-console').click()
  await page.locator('#clear-log').click()
  assert.equal(await page.locator('#logs').textContent(), '')
  assert.equal(await page.locator('.console-empty').isVisible(), true)
  await capture('project-console')
  await page.locator('#tab-assets').click()
  await page.locator('#asset-search').fill('missing-resource')
  await page.waitForFunction(() => document.querySelector('#asset-empty h3')?.textContent === '没有匹配的资源')
  await capture('assets-no-results')
  await page.locator('#tab-terminal').click()
  await page.locator('#terminal-kill').click()
  await page.locator('.terminal-empty').waitFor()
  assert.equal(await page.locator('.terminal-empty h3').textContent(), '没有运行中的终端')
  await capture('terminal-closed')
  await page.locator('.terminal-empty').getByRole('button', { name: '新建终端' }).click()
  await page.waitForFunction(() => document.querySelector('#terminal-sessions').options.length === 1)
  assert.deepEqual(errors, [])
  process.stdout.write('Empty states: textual surfaces, home shell, session retention, project handoff, file action, console clear, asset no-results and terminal restart passed.\n')
}
catch (error) {
  await capture('failure').catch(() => {})
  throw error
}
finally {
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
