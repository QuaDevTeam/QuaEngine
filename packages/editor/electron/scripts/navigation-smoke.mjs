import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTestEditor, editorTestApp, firstTestWindow, launchEditor } from './smoke-profile.mjs'

const editor = fileURLToPath(new URL('../', import.meta.url))
const artifacts = fileURLToPath(new URL('../../../../.codex-tmp/editor-navigation-smoke/', import.meta.url))
const require = createRequire(join(editor, 'package.json'))
const project = await mkdtemp(join(tmpdir(), 'qua-navigation-'))
const names = Array.from({ length: 75 }, (_, index) => `chapter-${String(index).padStart(2, '0')}.md`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let page

// The highlighted row, the accessibility tree and the Enter action must agree,
// even when virtualization retains both rows across a key press.
async function selected(host, owner = host) {
  const row = host.locator('[aria-selected="true"]')
  assert.equal(await row.count(), 1)
  assert.equal(await row.getAttribute('id'), await owner.getAttribute('aria-activedescendant'))
  return row
}

try {
  await mkdir(artifacts, { recursive: true })
  await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'Navigation fixture', bundleId: 'dev.qua.nav', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(project, 'package.json'), '{"name":"navigation-fixture","private":true}')
  for (const name of names)
    await writeFile(join(project, name), `# ${name}\nFind this chapter\n`)
  execFileSync('git', ['init', '--quiet', project])
  app = await launchEditor({ executablePath: require('electron'), args: [editorTestApp, '--project', project], env })
  page = await firstTestWindow(app)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const tree = page.locator('#files[data-project-name="Navigation fixture"]')
  await tree.waitFor()
  await tree.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  const active = await selected(tree)
  assert.equal(await active.getAttribute('data-path'), names[1])
  assert.ok(await active.evaluate(row => row.classList.contains('selected')))
  await page.keyboard.press('End')
  await selected(tree)
  assert.ok(await tree.locator('[role=treeitem]').count() < names.length)
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  const tab = name => page.locator(`.document-tab[data-path="${name}"] [role=tab][aria-selected=true]`)
  await tab(names[0]).waitFor()
  await page.keyboard.insertText('local draft ')
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '●' }).waitFor()

  // Dispatch in the same turn to guarantee that the first uncached IPC read
  // has not completed when the creator selects another file.
  await tree.evaluate((host, paths) => {
    for (const path of paths)
      host.querySelector(`[data-path="${path}"]`).click()
  }, [names[1], names[2], names[3]])
  await tab(names[3]).waitFor()
  await page.locator('#editor .view-lines').filter({ hasText: names[3] }).waitFor()
  await page.keyboard.press('ControlOrMeta+p')
  const input = page.locator('#quick-open-input')
  const quick = page.locator('#quick-open-results')
  await input.fill('chapter-')
  await quick.locator('[data-path="chapter-00.md"]').waitFor()
  await page.waitForFunction(() => document.querySelector('#quick-result-0')?.getAttribute('data-path') === 'chapter-00.md')
  await input.press('ArrowDown')
  const option = await selected(quick, input)
  const path = await option.getAttribute('data-path')
  assert.ok(await option.evaluate(row => row.classList.contains('selected')))
  // A watcher refresh reorders matches while the combobox owns keyboard focus.
  await writeFile(join(project, 'chapter-0.md'), 'New chapter')
  await quick.locator('[data-path="chapter-0.md"]').waitFor()
  assert.equal(await (await selected(quick, input)).getAttribute('data-path'), path)
  await input.press('Enter')
  await tab(path).waitFor()

  await page.keyboard.press('ControlOrMeta+Shift+f')
  const query = page.locator('#content-search')
  const results = page.locator('#search-results')
  await query.fill('Find this chapter')
  await page.locator('#search-summary').filter({ hasText: '75 处匹配' }).waitFor()
  await query.press('ArrowDown')
  const match = await selected(results)
  assert.equal(await match.getAttribute('aria-level'), '2')
  await page.keyboard.press('End')
  await selected(results)
  await page.keyboard.press('Enter')
  await tab(names.at(-1)).waitFor()
  await page.locator('#cursor-position').filter({ hasText: '行 2，列 1' }).waitFor()

  await page.locator('#activity-git').click()
  const git = page.locator('#git-files')
  await git.locator('[role=treeitem]').first().waitFor()
  await git.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  const change = await selected(git)
  assert.ok(await change.evaluate(row => row.classList.contains('selected')))
  await page.locator(`.document-tab[data-path="${names[0]}"] [role=tab]`).click()
  await page.locator('#editor .view-lines').filter({ hasText: 'local draft' }).waitFor()
  await page.locator('#save').click()
  await page.locator('.document-tab.active .tab-close').filter({ hasText: '×' }).waitFor()
  assert.equal(await readFile(join(project, names[0]), 'utf8'), `local draft # ${names[0]}\nFind this chapter\n`)
  assert.deepEqual(errors, [])
  process.stdout.write('Keyboard selection, rapid source navigation, draft retention and save passed\n')
}
catch (error) {
  await page?.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app?.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  }).catch(() => {})
  await closeTestEditor(app)
  await rm(project, { recursive: true, force: true })
}
