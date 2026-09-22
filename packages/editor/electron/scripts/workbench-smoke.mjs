import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const sharp = require('sharp')

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-workbench-smoke-')))
const projectRoot = join(temporary, 'project')
const secondRoot = join(temporary, 'second')
const artifacts = resolve(root, '.codex-tmp/editor-workbench-smoke')
for (const directory of [projectRoot, secondRoot, artifacts, join(projectRoot, 'src', 'chapters'), join(projectRoot, 'assets', 'images'), join(projectRoot, 'assets', 'audio')]) await mkdir(directory, { recursive: true })
for (const path of [projectRoot, secondRoot]) {
  await writeFile(join(path, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: path === projectRoot ? 'Workbench · 1200 files' : 'Second project', bundleId: 'dev.qua.workbench', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'workbench', scripts: { 'dev:web': 'vite' } }))
}
const source = 'Narrator: 凛😀 Hello HELLO\nNarrator: UNIQUE_SEARCH_RESULT\nNarrator: cat catalog bobcat cat_2 cat2 (cat), cat.\n'
await writeFile(join(projectRoot, 'scene.qs'), source)
await Promise.all(Array.from({ length: 900 }, (_, index) => writeFile(join(projectRoot, 'src', 'chapters', `document-${String(index).padStart(3, '0')}.txt`), `Chapter ${index}\n`)))
await sharp({ create: { width: 640, height: 360, channels: 4, background: '#607e91' } }).png().toFile(join(temporary, 'import.png'))
await Promise.all(Array.from({ length: 300 }, (_, index) => copyFile(join(temporary, 'import.png'), join(projectRoot, 'assets', 'images', `background-${String(index).padStart(3, '0')}.png`))))
await sharp({ create: { width: 2560, height: 1440, channels: 4, background: '#607e91' } }).png().toFile(join(projectRoot, 'assets', 'images', 'background-299.png'))
const wav = Buffer.alloc(44 + 16000)
wav.write('RIFF', 0)
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(8000, 24)
wav.writeUInt32LE(16000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(16000, 40)
await writeFile(join(projectRoot, 'assets', 'audio', 'tone.wav'), wav)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const started = performance.now()
const application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, '--project', projectRoot, `--user-data-dir=${join(temporary, 'profile')}`], env, timeout: 60000 })
const page = await application.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const metrics = {}
try {
  await page.locator('#files[data-project-name="Workbench · 1200 files"]').waitFor()
  metrics.openMilliseconds = Math.round(performance.now() - started)
  await page.locator('#activity-explorer').click()
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('#file-search').fill('document-')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  assert.equal(await page.locator('#files [aria-selected=true]').getAttribute('data-path'), 'src/chapters/document-899.txt')
  metrics.treeDomRows = await page.locator('#files [role=treeitem]').count()
  assert.ok(metrics.treeDomRows < 80)
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: 'document-899.txt' }).waitFor()
  await page.locator('#collapse-files').click()
  await page.locator('#files [data-path="src"]').click()
  await page.locator('#files [data-path="src/chapters"]').waitFor()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.locator('#files [data-path="src"]').getAttribute('aria-expanded'), 'false')
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#files [data-path="src"]').getAttribute('aria-expanded'), 'true')
  await page.locator('#files [data-path="src/chapters"]').click()
  const geometry = await page.locator('#files').evaluate((tree) => {
    const rows = ['src', 'src/chapters', 'src/chapters/document-000.txt'].map(path => tree.querySelector(`[data-path="${path}"]`))
    return rows.map(row => ({ height: row.getBoundingClientRect().height, labelX: row.querySelector('.tree-label').getBoundingClientRect().x, iconX: row.querySelector('.file-icon').getBoundingClientRect().x }))
  })
  assert.ok(geometry.every(row => row.height <= 22), 'Tree stays compact')
  for (let index = 1; index < geometry.length; index++) {
    assert.equal(geometry[index].labelX - geometry[index - 1].labelX, 12, 'Folder and file depths align')
    assert.equal(geometry[index].iconX - geometry[index - 1].iconX, 12, 'Icons follow the same indentation')
  }
  await page.screenshot({ path: join(artifacts, 'tree.png') })
  process.stdout.write('Tree: 1200+ indexed files, virtual rows, filtered ancestors and keyboard navigation passed\n')

  await page.keyboard.press('ControlOrMeta+Shift+f')
  const searchFocus = await page.locator('#content-search').evaluate((input) => {
    const color = document.createElement('span')
    color.style.color = getComputedStyle(input).getPropertyValue('--editor-accent')
    return { outline: getComputedStyle(input).outlineStyle, border: getComputedStyle(input).borderTopWidth, parentBorder: getComputedStyle(input.parentElement).borderTopColor, accent: color.style.color }
  })
  assert.equal(searchFocus.outline, 'none', 'Search input has no second focus outline')
  assert.equal(searchFocus.border, '0px')
  assert.equal(searchFocus.parentBorder, searchFocus.accent, 'The field group owns one shared focus border from the current theme')
  await page.locator('#content-search').fill('UNIQUE_SEARCH_RESULT')
  await page.locator('#search-summary').filter({ hasText: '1 处匹配' }).waitFor()
  await page.locator('#content-search').press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.locator('#document-name').filter({ hasText: 'scene.qs' }).waitFor()
  await page.locator('#cursor-position').filter({ hasText: '行 2，列 11' }).waitFor()
  await page.locator('#content-search').fill('hello')
  await page.locator('#search-summary').filter({ hasText: '2 处匹配' }).waitFor()
  await page.locator('#search-case').click()
  await page.locator('#search-summary').filter({ hasText: '0 处匹配' }).waitFor()
  await page.locator('#search-case').click()
  await page.locator('#content-search').fill('cat')
  await page.locator('#search-summary').filter({ hasText: '7 处匹配' }).waitFor()
  await page.getByRole('button', { name: '全词匹配（词边界）', exact: true }).click()
  await page.locator('#search-summary').filter({ hasText: '3 处匹配' }).waitFor()
  assert.equal(await page.locator('#search-word').getAttribute('aria-pressed'), 'true')
  await page.screenshot({ path: join(artifacts, 'search-whole-word.png') })
  await page.locator('#search-regex').click()
  await page.locator('#content-search').fill('ca[t]')
  await page.locator('#search-summary').filter({ hasText: '3 处匹配' }).waitFor()
  await page.locator('#search-word').click()
  await page.locator('#search-summary').filter({ hasText: '7 处匹配' }).waitFor()
  await page.locator('#content-search').fill('[')
  await page.locator('#search-summary.error').waitFor()
  await page.locator('#content-search').fill('h.llo')
  await page.locator('#search-summary').filter({ hasText: '2 处匹配' }).waitFor()
  await page.locator('.search-match').first().click()
  await page.locator('#cursor-position').filter({ hasText: '行 1，列 15' }).waitFor()
  await page.screenshot({ path: join(artifacts, 'search.png') })
  process.stdout.write('Search: native regex, invalid-pattern recovery, flags and Unicode location navigation passed\n')

  await page.locator('#tab-assets').click()
  await page.locator('#asset-count').filter({ hasText: '301 个资源' }).waitFor()
  metrics.assetDomCards = await page.locator('.asset-card').count()
  assert.ok(metrics.assetDomCards < 100)
  await page.locator('#asset-items').focus()
  await page.keyboard.press('End')
  await page.locator('.asset-card[aria-selected=true]').filter({ hasText: 'background-299.png' }).waitFor()
  await page.locator('#asset-details img').waitFor()
  await page.waitForFunction(() => document.querySelector('#asset-details img')?.naturalWidth === 1280)
  await page.locator('.asset-card[aria-selected=true] .asset-thumb img').evaluate((image) => {
    globalThis.__quaAssetThumb = image
    globalThis.__quaThumbDetachments = 0
    globalThis.__quaThumbObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (removed === image || removed.contains(image))
            globalThis.__quaThumbDetachments++
        }
      }
    })
    globalThis.__quaThumbObserver.observe(document.querySelector('#asset-items'), { childList: true, subtree: true })
  })
  await page.locator('.dock-separator[data-split-id="main"]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.evaluate(() => globalThis.__quaAssetThumb === document.querySelector('.asset-card[aria-selected=true] .asset-thumb img')), true, 'Asset thumbnail DOM survives panel-height resize')
  assert.equal(await page.evaluate(() => globalThis.__quaThumbDetachments), 0, 'Resizing never detaches visible image rows')
  await page.evaluate(() => globalThis.__quaThumbObserver.disconnect())
  const assetWindowEvent = application.waitForEvent('window')
  await page.locator('.asset-card[aria-selected=true]').dblclick()
  const assetWindow = await assetWindowEvent
  await assetWindow.locator('.asset-preview-media').waitFor()
  assert.match(await assetWindow.locator('#asset-title').textContent(), /background-299\.png/)
  const assetWindowClosed = assetWindow.waitForEvent('close')
  await assetWindow.keyboard.press('Escape').catch((error) => {
    if (!assetWindow.isClosed())
      throw error
  })
  await assetWindowClosed
  await page.locator('#asset-status').filter({ hasText: 'PNG，2560 × 1440 px' }).waitFor()
  assert.match(await page.locator('#asset-status').textContent(), /KB，含透明通道$/)
  assert.match(await page.locator('#asset-status').getAttribute('title'), /assets\/images\/background-299.png/)
  assert.equal(await page.locator('#workspace-mode').isVisible(), false)
  await page.screenshot({ path: join(artifacts, 'image-status.png') })
  await sharp({ create: { width: 2048, height: 1024, channels: 3, background: '#759168' } }).png().toFile(join(projectRoot, 'assets', 'images', 'background-299.png'))
  await page.locator('#asset-status').filter({ hasText: 'PNG，2048 × 1024 px' }).waitFor()
  assert.ok(!(await page.locator('#asset-status').textContent()).includes('透明通道'))
  await page.locator('#asset-search').fill('background-299')
  await page.waitForFunction(() => document.querySelector('.asset-thumb img')?.naturalWidth === 160)
  await page.locator('#asset-list').click()
  assert.equal(await page.locator('.asset-row.list').count(), 1)
  await page.locator('#asset-grid').click()
  await page.locator('#asset-search').fill('tone')
  await page.locator('.asset-card').click()
  await page.waitForFunction(() => document.querySelector('#asset-details audio')?.readyState >= 1)
  assert.match(await page.locator('#asset-status').textContent(), /^WAV，/)
  await page.locator('#asset-details audio').evaluate(async (audio) => {
    audio.muted = true
    await audio.play()
  })
  const url = await page.evaluate(async root => window.quaEditor.assetUrl(root, 'assets/audio/tone.wav', false), projectRoot)
  const range = await application.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url, { headers: { Range: 'bytes=44-143' } })
    return { status: response.status, range: response.headers.get('content-range'), bytes: (await response.arrayBuffer()).byteLength }
  }, url)
  assert.deepEqual(range, { status: 206, range: `bytes 44-143/${wav.length}`, bytes: 100 })
  await page.locator('#tab-console').click()
  assert.equal(await page.locator('#asset-status').isVisible(), false)
  assert.equal(await page.locator('#workspace-mode').count(), 0)
  assert.equal(await page.locator('#check-indicator').isVisible(), true)
  assert.equal(await page.locator('#asset-details audio').count(), 0)
  assert.equal(await page.locator('.asset-card').count(), 0)
  await page.locator('#tab-assets').click()
  await page.locator('#asset-details audio').waitFor()
  assert.equal(await page.locator('#asset-details audio').evaluate(audio => audio.paused), true)
  process.stdout.write('Assets: virtual grid/list, decoded thumbnails, bounded image preview, media ranges and playback cleanup passed\n')

  await page.locator('#asset-root').click()
  await page.locator('#asset-search').fill('')
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, join(temporary, 'import.png'))
  await page.locator('#asset-import').click()
  await page.locator('#status').filter({ hasText: '已导入 1 个资源' }).waitFor()
  assert.ok((await readFile(join(projectRoot, 'import.png'))).length > 0)
  await page.locator('#asset-import').click()
  await page.locator('#status').filter({ hasText: '已导入 0 个资源；1 个' }).waitFor()
  await page.locator('#asset-search').fill('import')
  await page.locator('.asset-card').click()
  await page.getByRole('button', { name: '在项目树中定位', exact: true }).click()
  await page.locator('#files [data-path="import.png"][aria-selected=true]').waitFor()
  const splitter = await page.locator('.dock-separator[data-split-id="main"]').boundingBox()
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 2)
  await page.mouse.down()
  await page.mouse.move(splitter.x + splitter.width / 2, splitter.y - 140, { steps: 6 })
  await page.mouse.up()
  await page.screenshot({ path: join(artifacts, 'assets.png') })
  await page.keyboard.press('ControlOrMeta+j')
  await page.locator('#panel-assets').waitFor({ state: 'hidden' })
  await page.keyboard.press('ControlOrMeta+j')
  await page.locator('#panel-assets').waitFor()

  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, secondRoot)
  await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('open-project').click())
  await page.locator('#files[data-project-name="Second project"]').waitFor()
  assert.equal(await page.locator('#file-search').isVisible(), false, 'Changing project resets the filter widget')
  assert.equal(await page.locator('#asset-status').textContent(), '')
  const expiredStatus = await application.evaluate(async ({ net }, url) => (await net.fetch(url)).status, url)
  assert.equal(expiredStatus, 403)
  assert.equal(await page.locator('.asset-card').count(), 0)
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, 'metrics.json'), JSON.stringify(metrics, null, 2))
  process.stdout.write(`Import: no-overwrite, tree reveal, panel resizing, session URL invalidation and project cleanup passed\n${JSON.stringify(metrics)}\n`)
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await application.close()
  await rm(temporary, { recursive: true, force: true })
}
