import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { copyDemoFixture } from './demo-fixture.mjs'
import { closeTestEditor, editorTestApp, firstTestWindow } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const profile = await realpath(await mkdtemp(join(tmpdir(), 'qua-animation-scene-')))
const artifacts = resolve(root, '.codex-tmp/editor-animation-scene-smoke')
await mkdir(artifacts, { recursive: true })
const fixture = join(profile, 'project')
await copyDemoFixture(root, fixture)
const path = 'src/game/scenes/prologue-arrival.qs'
const sourceFile = resolve(fixture, path)
const original = await readFile(sourceFile, 'utf8')
const id = 'editor-scene-smoke'
const animationFile = resolve(fixture, 'editor-scene-smoke.animation.json')
const animation = `${JSON.stringify({ id, duration: 1000, fill: 'both', commit: 'none', tracks: [{ target: 'self', property: 'position.x', interpolation: 'number', keyframes: [{ at: 0, value: 640 }, { at: 1000, value: 1280 }] }] }, null, 2)}\n`
const firstGreeting = original.match(/^Mara: .+$/m)?.[0]
assert.ok(firstGreeting, 'fixture scene contains a Mara dialogue step')
const source = original.replace(firstGreeting, `@DefineAnimation('${id}', 1000)\n@Key('self', 'position.x', 0, 640)\n@Key('self', 'position.x', 1000, 1280)\n@PlayAnimation('${id}', 'self=character:mara', true)\n${firstGreeting}`)
assert.notEqual(source, original)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let page
try {
  await writeFile(animationFile, animation, { flag: 'wx' })
  await writeFile(sourceFile, source)
  app = await _electron.launch({ executablePath: require('electron'), args: [editorTestApp, '--project', fixture, `--user-data-dir=${join(profile, 'user-data')}`], env, timeout: 60000 })
  page = await firstTestWindow(app)
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name^="Call Me Again Tomorrow"]').waitFor({ timeout: 60000 })
  await page.getByRole('tab', { name: '动画', exact: true }).click()
  const panel = page.locator('.animation-editor')
  await panel.getByLabel('动画文件', { exact: true }).selectOption('editor-scene-smoke.animation.json')
  const splitter = await page.locator('.dock-separator[data-split-id="main"]').boundingBox()
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 2)
  await page.mouse.down()
  await page.mouse.move(splitter.x + splitter.width / 2, 170, { steps: 10 })
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelector('.animation-context-status')?.textContent === 'Web 场景预览', undefined, { timeout: 180000 })
  const current = await page.evaluate(() => window.quaEditor.previewState())
  assert.equal(current.identity.target, 'web')
  const initial = await command({ action: 'status' })
  assert.equal(initial.path, path)
  assert.ok(initial.stepIndex > 0)
  assert.equal(await panel.getByLabel('self 角色', { exact: true }).inputValue(), 'mara')
  await waitGame((expectedDialogue) => {
    const image = document.querySelector('[data-character-id="mara"] img')
    const background = document.querySelector('.qua-background img, img.qua-background, img.qua-background-image')
    return image?.complete && image.naturalWidth > 0 && background?.complete && background.naturalWidth > 0 && document.querySelector('.qua-dialogue-text')?.textContent.includes(expectedDialogue)
  }, firstGreeting.slice('Mara: '.length))
  await seek(500)
  await waitGame(() => Number(document.querySelector('[data-character-id="mara"]')?.getAttribute('data-character-x')) === 960)
  await assertBounds('.animation-preview')
  await capture('scene-with-dialogue')
  await panel.getByLabel('显示对话框', { exact: true }).uncheck()
  await waitGame(() => !document.querySelector('.qua-dialogue-box') || !document.querySelector('.qua-dialogue-box').getBoundingClientRect().height || getComputedStyle(document.querySelector('.qua-dialogue-box')).display === 'none')
  await capture('scene-without-dialogue')
  assert.equal((await command({ action: 'status' })).stepIndex, initial.stepIndex)
  await panel.getByLabel('显示对话框', { exact: true }).check()
  await waitGame(() => document.querySelector('.qua-dialogue-box')?.getBoundingClientRect().height > 0)
  await panel.getByRole('button', { name: '+ 关键帧', exact: true }).click()
  await panel.getByLabel('数值', { exact: true }).fill('1100')
  await panel.getByLabel('数值', { exact: true }).press('Tab')
  await waitGame(() => Number(document.querySelector('[data-character-id="mara"]')?.getAttribute('data-character-x')) === 1100)
  await panel.getByRole('button', { name: '撤销', exact: true }).click()
  await waitGame(() => Number(document.querySelector('[data-character-id="mara"]')?.getAttribute('data-character-x')) === 960)
  await panel.getByLabel('预览上下文', { exact: true }).selectOption('scene')
  await panel.getByLabel('预览剧本', { exact: true }).selectOption(path)
  await panel.getByLabel('场景步骤', { exact: true }).selectOption(String(initial.stepIndex + 1))
  await page.waitForFunction(() => document.querySelector('.animation-context-status')?.textContent === 'Web 场景预览')
  assert.equal((await command({ action: 'status' })).stepIndex, initial.stepIndex + 1)
  await panel.getByLabel('显示对话框', { exact: true }).uncheck()
  await waitGame(() => !document.querySelector('.qua-dialogue-box') || !document.querySelector('.qua-dialogue-box').getBoundingClientRect().height)
  await page.getByRole('tab', { name: '调试控制台', exact: true }).click()
  await waitGame(() => document.querySelector('.qua-dialogue-box')?.getBoundingClientRect().height > 0)
  assert.equal(await page.locator('#preview-empty').isVisible(), false)
  await page.locator('.dock-separator[data-split-id="main"]').dblclick()
  await assertBounds('#preview')
  assert.equal((await page.evaluate(() => window.quaEditor.previewState())).identity.sessionId, current.identity.sessionId)
  await page.getByRole('tab', { name: '动画', exact: true }).click()
  await panel.getByLabel('预览上下文', { exact: true }).selectOption('character')
  const character = await panel.getByLabel('预览角色', { exact: true }).locator('option').evaluateAll(options => options.find(option => option.textContent.includes('mara'))?.value)
  assert.ok(character, 'actual indexed project character')
  await panel.getByLabel('预览角色', { exact: true }).selectOption(character)
  await page.waitForFunction(() => {
    const image = document.querySelector('.animation-preview img')
    return image?.complete && image.naturalWidth > 0
  })
  await page.screenshot({ path: join(artifacts, 'manual-character.png') })
  assert.deepEqual(errors, [])
  process.stdout.write('Animation scene: automatic QS binding, real Demo background/sprite/dialogue, midpoint and keyframe editing, dialogue toggle without progression, manual scene steps, character fallback, redocking and cleanup passed\n')
}
catch (error) {
  if (page) {
    await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
    await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ error: String(error), state: await page.evaluate(() => window.quaEditor.previewState()), context: await page.locator('.animation-context').textContent(), logs: await page.locator('#logs').textContent() }, null, 2)).catch(() => {})
  }
  throw error
}
finally {
  await app?.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await closeTestEditor(app)
  await rm(profile, { recursive: true, force: true })
}

async function command(command) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      return await page.evaluate(async (command) => {
        const state = await window.quaEditor.previewState()
        return window.quaEditor.previewCommand(state.identity.sessionId, command)
      }, command)
    }
    catch (error) {
      if (!String(error).includes('正在更新预览') || attempt === 59)
        throw error
      await page.waitForTimeout(50)
    }
  }
}
async function seek(time) {
  await page.getByLabel('播放位置', { exact: true }).evaluate((input, time) => {
    input.value = String(time)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, time)
}
async function waitGame(predicate, argument) {
  const expression = `(${predicate.toString()})(${JSON.stringify(argument)})`
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await app.evaluate(({ webContents }, expression) => webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:\d+\/?$/u.test(contents.getURL()))?.executeJavaScript(expression), expression))
      return
    await page.waitForTimeout(100)
  }
  throw new Error(`Scene assertion timed out: ${expression}`)
}
async function capture(name) {
  const windowPng = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'))
  await writeFile(join(artifacts, `${name}-editor.png`), Buffer.from(windowPng, 'base64'))
  const png = await app.evaluate(async ({ webContents }) => {
    const contents = webContents.getAllWebContents().find(contents => /^http:\/\/127\.0\.0\.1:\d+\/?$/u.test(contents.getURL()))
    return (await contents.capturePage()).toPNG().toString('base64')
  })
  await writeFile(join(artifacts, `${name}.png`), Buffer.from(png, 'base64'))
}

async function assertBounds(selector) {
  const expected = await page.locator(selector).boundingBox()
  assert.ok(expected?.width > 100 && expected?.height > 100)
  const actual = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(view => view.webContents?.getURL().startsWith('http:'))?.getBounds())
  assert.ok(actual, 'project WebContentsView remains attached to the editor')
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(actual[key] - expected[key]) < 2, `embedded ${key}: ${actual[key]} / ${expected[key]}`)
}
