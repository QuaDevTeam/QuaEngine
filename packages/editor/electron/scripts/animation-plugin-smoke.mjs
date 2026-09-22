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
const temporary = await mkdtemp(join(tmpdir(), 'qua-animation-editor-'))
const fixture = join(temporary, 'project')
const empty = join(temporary, 'empty')
const artifacts = resolve(root, '.codex-tmp/editor-animation-plugin-smoke')
await mkdir(artifacts, { recursive: true })
for (const directory of [fixture, empty]) {
  await mkdir(directory)
  await writeFile(
    join(directory, 'qua.project.json'),
    JSON.stringify({
      schemaVersion: 1,
      name: directory === fixture ? 'Animation fixture' : 'Empty fixture',
      bundleId: 'dev.qua.animations',
      icons: { favicon: 'icon.png' },
      targets: { web: { enabled: true } },
    }),
  )
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'animation-fixture' }),
  )
}
const source
  = `${JSON.stringify(
    {
      id: 'enter',
      duration: 1000,
      commit: 'none',
      fill: 'both',
      tracks: [
        {
          target: 'self',
          property: 'position.x',
          interpolation: 'number',
          keyframes: [
            { at: 0, value: 640 },
            { at: 1000, value: 1280, easing: 'ease-in-out' },
          ],
        },
      ],
    },
    null,
    2,
  )}\n`
await writeFile(join(fixture, 'enter.animation.json'), source)
await writeFile(
  join(fixture, 'unsupported.animation.json'),
  '{"duration":100}',
)
const sharp = require('sharp')

await sharp({
  create: { width: 120, height: 180, channels: 4, background: '#88b8df' },
})
  .png()
  .toFile(join(fixture, 'subject.png'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: require('electron'),
  args: [
    editorRoot,
    '--project',
    fixture,
    `--user-data-dir=${join(temporary, 'profile')}`,
  ],
  env,
  timeout: 60000,
})
const page = await app.firstWindow()
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const panel = page.locator('.animation-editor')
const tab = page.getByRole('tab', { name: '动画', exact: true })
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const message = page.locator('footer .animation-message')
async function change(label, value) {
  const control = panel.getByLabel(label, { exact: true })
  await control.fill(String(value))
  await control.press('Tab')
}
async function seek(time) {
  await panel
    .getByLabel('播放位置', { exact: true })
    .evaluate((input, time) => {
      input.value = String(time)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, time)
}
async function waitX(x) {
  await page.waitForFunction(
    x =>
      Math.abs(
        Number(
          document
            .querySelector('.animation-preview .qua-character')
            ?.getAttribute('data-character-x'),
        ) - x,
      ) < 1,
    x,
  )
}
async function save() {
  await page.keyboard.press(`${mod}+s`)
  await message.filter({ hasText: '动画源文件已保存' }).waitFor()
}
try {
  await tab.click()
  await panel.getByLabel('动画 ID', { exact: true }).waitFor()
  assert.equal(
    await panel.getByLabel('动画 ID', { exact: true }).inputValue(),
    'enter',
  )
  await waitX(640)
  await panel.getByText('1 个文件需检查').waitFor()
  // Give the visual panel working room through the actual workbench splitter.
  const splitter = page.locator('.dock-separator[data-split-id="main"]')
  if (await splitter.count()) {
    const bounds = await splitter.boundingBox()
    if (bounds) {
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 2)
      await page.mouse.down()
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        Math.max(180, bounds.y - 260),
        { steps: 10 },
      )
      await page.mouse.up()
    }
  }
  await seek(500)
  await waitX(960)
  await panel
    .getByLabel('预览图片', { exact: true })
    .selectOption('subject.png')
  await page.waitForFunction(() => {
    const image = document.querySelector('.animation-preview img')
    return image?.complete && image.naturalWidth === 120
  })
  await panel.getByRole('button', { name: '+ 关键帧', exact: true }).click()
  assert.equal(await panel.locator('.animation-key').count(), 3)
  await change('数值', 1100)
  await waitX(1100)
  await panel.getByRole('button', { name: '撤销', exact: true }).click()
  await waitX(960)
  await panel.getByRole('button', { name: '重做', exact: true }).click()
  await waitX(1100)
  // Real pointer drag, then exact numeric time editing.
  const diamond = panel.locator('.animation-key.is-selected')
  const bounds = await diamond.boundingBox()
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(bounds.x + 55, bounds.y + bounds.height / 2, {
    steps: 5,
  })
  await page.mouse.up()
  assert.notEqual(
    await panel.getByLabel('时间 ms', { exact: true }).inputValue(),
    '500',
  )
  await change('时间 ms', 600)
  await panel.getByRole('button', { name: '+ 轨道', exact: true }).click()
  assert.equal(await panel.locator('.animation-track').count(), 2)
  await panel.getByLabel('属性', { exact: true }).selectOption('opacity')
  await change('数值', 0.7)
  await panel
    .getByRole('button', { name: '应用到源文件', exact: true })
    .click()
  await message.filter({ hasText: '已应用到源码草稿' }).waitFor()
  assert.equal(
    await readFile(join(fixture, 'enter.animation.json'), 'utf8'),
    source,
  )
  await save()
  const saved = JSON.parse(
    await readFile(join(fixture, 'enter.animation.json'), 'utf8'),
  )
  assert.equal(
    saved.tracks[0].keyframes.find(key => key.at === 600).value,
    1100,
  )
  assert.equal(saved.tracks[1].property, 'opacity')
  await seek(0)
  await panel.getByRole('button', { name: '播放', exact: true }).click()
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('.animation-preview .qua-character')
          ?.getAttribute('data-character-x'),
      ) > 640,
  )
  await page.getByRole('tab', { name: '调试控制台', exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector('.animation-preview .qua-renderer'),
  )
  await tab.click()
  await panel.getByRole('button', { name: '播放', exact: true }).waitFor()
  await page.screenshot({ path: join(artifacts, 'keyframe-editor.png') })
  // Create a reusable source from scratch through exclusive file creation + Monaco draft.
  await panel.getByRole('button', { name: '新建动画', exact: true }).click()
  await change('动画 ID', 'fade-in')
  await change('新文件路径', 'enter.animation.json')
  await panel.getByRole('button', { name: '应用到源文件', exact: true }).click()
  await message.filter({ hasText: '目标名称已存在' }).waitFor()
  assert.deepEqual(JSON.parse(await readFile(join(fixture, 'enter.animation.json'), 'utf8')), saved)
  await change('新文件路径', 'fade.animation.json')
  await panel
    .getByRole('button', { name: '应用到源文件', exact: true })
    .click()
  await message.filter({ hasText: '已应用到源码草稿' }).waitFor()
  assert.equal(
    await readFile(join(fixture, 'fade.animation.json'), 'utf8'),
    '',
  )
  await save()
  assert.equal(
    JSON.parse(await readFile(join(fixture, 'fade.animation.json'), 'utf8')).id,
    'fade-in',
  )
  // Native close guard sees a normal source draft. Undo restores the original source.
  await change('数值', 700)
  await panel
    .getByRole('button', { name: '应用到源文件', exact: true })
    .click()
  await message.filter({ hasText: '已应用到源码草稿' }).waitFor()
  await page.keyboard.press(`${mod}+z`)
  await page.keyboard.press(`${mod}+s`)
  assert.equal(
    JSON.parse(await readFile(join(fixture, 'fade.animation.json'), 'utf8'))
      .tracks[0].keyframes[0].value,
    640,
  )
  // New project removes the old renderer, images and selection.
  await app.evaluate(({ dialog, Menu }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    })
    Menu.getApplicationMenu().getMenuItemById('open-project').click()
  }, empty)
  await page
    .locator('#files[data-project-name="Empty fixture"]')
    .waitFor({ state: 'attached' })
  await tab.click()
  assert.equal(
    await panel.getByLabel('动画 ID', { exact: true }).inputValue(),
    'animation',
  )
  assert.equal(await panel.locator('img').count(), 0)
  assert.deepEqual(errors, [])
  process.stdout.write(
    'Animation editor: real Web stage, image decode, midpoint interpolation, keyframe drag/CRUD, tracks, undo/redo, guarded draft/save, new file, playback, hidden cleanup and project isolation passed\n',
  )
}
catch (error) {
  await page
    .screenshot({ path: join(artifacts, 'failure.png') })
    .catch(() => {})
  throw error
}
finally {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      })
    })
    .catch(() => {})
  await app.close()
  await rm(temporary, { recursive: true, force: true })
}
