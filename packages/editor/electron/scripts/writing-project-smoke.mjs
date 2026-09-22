import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'qua-writing-project-')))
const first = join(temporary, 'first')
const second = join(temporary, 'second')
const artifacts = resolve(root, '.codex-tmp/editor-writing-project')
const source = '<script lang="ts">\nexport const author = "human"\n</script>\n\n@Scene("station")\n@Node("arrival", { title: "Arrival" })\n凛: 雨停了吗？\n\n// keep direction\n车站空着。\n\n- 等待 -> arrival\n'
for (const [path, name] of [[first, 'Writing first'], [second, 'Writing second']]) {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name, bundleId: 'dev.qua.writing.fixture', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  await writeFile(join(path, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { 'dev:web': 'vite' } }))
  await writeFile(join(path, 'scene.qs'), source)
  await writeFile(join(path, 'worldbuilding.md'), '设定：这是海边小镇。')
}
await mkdir(artifacts, { recursive: true })
// Deterministic OpenAI-compatible provider fixture. No paid/live provider calls.
let adapterCalls = 0
let writingCalls = 0
const provider = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/chat/completions') {
    response.writeHead(404).end()
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) {
    response.writeHead(400).end()
    return
  }
  const body = JSON.parse(Buffer.concat(chunks).toString())
  assert.equal(body.thinking.type, 'enabled')
  if (!body.messages[0].content.startsWith('你是 QuaScript 源码回写适配器')) {
    assert.equal(body.model, 'deepseek-v4-flash', 'writing uses its selected model')
    assert.equal(body.reasoning_effort, 'high')
    writingCalls++
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ reply: '已保留海边小镇设定。' }) } }] }))
    return
  }
  assert.equal(body.model, 'deepseek-v4-pro', 'QS adaptation uses its independent code model')
  assert.equal(body.reasoning_effort, 'max')
  const input = JSON.parse(body.messages[1].content)
  adapterCalls++
  let assignments
  if (input.manuscript.some(line => line.text.includes('小明'))) {
    const after = input.anchors.find(anchor => anchor.decorators.some(item => item.name === 'Node' && item.args[0] === 'after')).id
    const boundary = input.manuscript.findIndex(line => line.text.includes('门后'))
    assignments = input.manuscript.map((line, index) => ({
      line: index,
      anchor: index < boundary ? 0 : after,
      expressions: index === 0 ? [{ expression: 0, start: line.text.indexOf('小明'), end: line.text.indexOf('小明') + 2 }] : [],
    }))
  }
  else {
    assignments = input.manuscript.map((line, index) => ({ line: index, anchor: Math.min(index, input.anchors.length - 1), expressions: [] }))
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ summary: '保留原故事节点与分支，新增段落放入对应逻辑区间，并恢复运行时名字。', assignments }) } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerUrl = `http://127.0.0.1:${provider.address().port}`
const env = { ...process.env, NOVEL_WRITER_HOME: join(temporary, 'writer') }
delete env.ELECTRON_RUN_AS_NODE
const app = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', first], env, timeout: 60000 })
let writer
const errors = []
async function poll(test) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await test())
      return
    await delay(100)
  }
  throw new Error('Writing project smoke timed out')
}
async function assertSquareIconButtons() {
  const buttons = await writer.locator('.nw-button-icon:visible').evaluateAll(elements => elements.map((element) => {
    const { width, height } = element.getBoundingClientRect()
    const icon = element.querySelector('svg').getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    return { label: element.getAttribute('aria-label'), width, height, offsetX: icon.x + icon.width / 2 - bounds.x - width / 2, offsetY: icon.y + icon.height / 2 - bounds.y - height / 2 }
  }))
  assert.ok(buttons.length > 0)
  for (const button of buttons) {
    assert.ok(button.width >= 26 && Math.abs(button.width - button.height) < 1, `${button.label}: square hit area (${button.width} × ${button.height})`)
    assert.ok(Math.abs(button.offsetX) < 1 && Math.abs(button.offsetY) < 1, `${button.label}: centered icon`)
  }
}
async function assertEmptyLayout() {
  const layout = await writer.evaluate(() => {
    const bounds = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()
    const scroll = document.querySelector('.main-scroll')
    const styles = getComputedStyle(scroll)
    return {
      alignedColumns: matchMedia('(min-width: 761px) and (min-height: 500px)').matches,
      main: bounds('.main-scroll'),
      empty: bounds('.empty-state'),
      inner: bounds('.main-inner'),
      inspector: bounds('.inspector'),
      tabs: bounds('.inspector-tabs'),
      panel: bounds('.inspector-panel'),
      inspectorEmpty: bounds('.inspector-empty'),
      composer: bounds('.chat-composer'),
      workspace: bounds('.workspace'),
      projectEmpty: bounds('.project-list > .project-empty'),
      mainEmptyContent: bounds('.empty-state-inner'),
      inspectorEmptyContent: bounds('.inspector-empty-content'),
      paddingTop: Number.parseFloat(styles.paddingTop),
      paddingBottom: Number.parseFloat(styles.paddingBottom),
    }
  })
  await writeFile(join(artifacts, 'empty-layout.json'), JSON.stringify(layout, null, 2))
  assert.ok(layout.inner.height >= layout.main.height - layout.paddingTop - layout.paddingBottom - 1, 'center content fills the available height')
  assert.ok(Math.abs(layout.empty.bottom - layout.inner.bottom) < 1, 'empty state fills the remaining center height')
  assert.ok(Math.abs(layout.panel.top - layout.tabs.bottom) < 1 && Math.abs(layout.panel.bottom - layout.inspector.bottom) < 1, 'inspector panel fills the height below its tabs')
  if (layout.inspectorEmpty) {
    assert.ok(Math.abs(layout.inspectorEmpty.top - layout.panel.top) < 1, 'inspector empty state starts below tabs')
    assert.ok(Math.abs(layout.inspectorEmpty.bottom - (layout.composer?.top ?? layout.panel.bottom)) < 1, 'inspector empty state fills available height')
  }
  if (layout.composer)
    assert.ok(Math.abs(layout.composer.bottom - layout.inspector.bottom) < 1, 'chat composer stays at the bottom')
  if (layout.projectEmpty && layout.alignedColumns) {
    const midpoint = layout.workspace.y + layout.workspace.height / 2
    for (const content of [layout.projectEmpty, layout.mainEmptyContent, layout.inspectorEmptyContent])
      assert.ok(Math.abs(content.y + content.height / 2 - midpoint) < 1, 'all three empty-content groups share the workspace midpoint')
    if (layout.composer)
      assert.ok(layout.inspectorEmptyContent.bottom < layout.composer.y, 'aligned empty content clears the chat composer')
  }
  await assertSquareIconButtons()
}
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#files[data-project-name="Writing first"]').waitFor()
  // Writer keeps its Svelte document. Test its full authoring layout in a
  // single dock group while the separate integration smoke covers reparenting.
  await page.evaluate(() => {
    const key = 'qua.editor.dock-layout.v1'
    const state = JSON.parse(localStorage.getItem(key))
    const views = node => node.kind === 'group' ? node.views : [...views(node.first), ...views(node.second)]
    state.closed = [...new Set([...state.closed, ...views(state.root)])].filter(id => id !== 'source')
    state.root = { kind: 'group', id: 'source', views: ['source'], active: 'source' }
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.locator('#files[data-project-name="Writing first"]').waitFor()
  await page.locator('#files button[data-path="scene.qs"]').click()
  await page.locator('#activity-writer').click()
  await poll(() => {
    writer = app.context().pages().find(item => item.url().startsWith('http://127.0.0.1:'))
    return Boolean(writer)
  })
  writer.setDefaultTimeout(15000)
  writer.on('pageerror', error => errors.push(error.message))
  await writer.getByRole('button', { name: '项目资料', exact: true }).filter({ hasText: 'Writing first' }).waitFor()
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).isVisible(), false)
  assert.ok((await writer.locator('.workspace').boundingBox()).y <= 40, 'writing has the full workspace height')
  await assertEmptyLayout()
  await writer.screenshot({ path: join(artifacts, 'writing-workspace.png') })
  const regularSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 650))
  await poll(async () => (await writer.evaluate(() => innerWidth)) < 1100)
  for (const tab of ['评审', '引用', '日志', '对话']) {
    await writer.getByRole('tab', { name: tab, exact: true }).click()
    await assertEmptyLayout()
  }
  await writer.getByRole('button', { name: '回收站', exact: true }).click()
  await assertEmptyLayout()
  await writer.getByRole('button', { name: '回收站', exact: true }).click()
  await writer.screenshot({ path: join(artifacts, 'writing-empty-compact.png') })
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), regularSize)
  await poll(async () => (await writer.evaluate(() => innerWidth)) > 1100)
  await writer.getByRole('button', { name: '项目资料', exact: true }).click()
  await writer.getByRole('dialog', { name: '项目资料', exact: true }).waitFor()
  await assertSquareIconButtons()
  await writer.getByRole('tab', { name: '故事背景', exact: true }).click()
  assert.match(await writer.locator('#writing-context-content').textContent(), /海边小镇/)
  await writer.getByRole('tab', { name: '故事背景', exact: true }).press('ArrowRight')
  assert.equal(await writer.getByRole('tab', { name: '角色设定', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await writer.getByRole('tab', { name: '角色设定', exact: true }).evaluate(element => getComputedStyle(element).outlineStyle), 'none')
  assert.equal(await writer.locator('.writing-context-dialog .writing-dialog-title p').count(), 0)
  assert.equal(await writer.locator('.writing-context-content .dialogue-line').count(), 0)
  assert.equal(await writer.locator('.context-document').getByRole('heading', { name: '出场角色' }).isVisible(), true)
  assert.equal(await writer.locator('.context-document li').filter({ hasText: /^凛$/ }).count(), 1)
  await writer.screenshot({ path: join(artifacts, 'project-context.png') })
  await writer.getByRole('button', { name: '关闭项目资料' }).click()
  process.stdout.write('Writing UI: project context tabs checked.\n')
  const context = await writer.evaluate(() => window.quaNovelWriter.context())
  assert.equal(context.root, first)
  assert.match(context.outline, /arrival/)
  assert.match(context.worldbuilding, /海边小镇/)
  assert.match(context.characters, /凛/)
  await writer.evaluate(async (deepSeekBaseUrl) => {
    const response = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deepSeekBaseUrl, deepSeekApiKey: 'local-fixture-only' }) })
    if (!response.ok)
      throw new Error(await response.text())
  }, providerUrl)
  await writer.reload()
  await writer.getByRole('button', { name: '设置', exact: true }).click()
  await writer.getByLabel('写作模型', { exact: true }).selectOption('deepseek-v4-flash')
  await writer.getByLabel('代码模型（QS 适配）', { exact: true }).selectOption('deepseek-v4-pro')
  await writer.getByLabel('代码推理强度', { exact: true }).selectOption('max')
  await writer.getByRole('button', { name: '保存设置', exact: true }).click()
  await writer.getByRole('dialog', { name: '设置', exact: true }).waitFor({ state: 'hidden' })
  const savedConfig = await writer.evaluate(async () => {
    const response = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeReasoningEffort: 'max' }) })
    if (!response.ok)
      throw new Error('Config update failed')
    return response.json()
  })
  assert.equal(savedConfig.hasDeepSeekApiKey, true, 'model-only updates retain the stored credential')
  assert.equal(savedConfig.deepSeekModel, 'deepseek-v4-flash')
  assert.equal(savedConfig.codeModel, 'deepseek-v4-pro')
  assert.equal(Object.hasOwn(savedConfig, 'deepSeekApiKey'), false)
  await writer.reload()
  await writer.getByRole('button', { name: '设置', exact: true }).click()
  assert.equal(await writer.getByLabel('写作模型', { exact: true }).inputValue(), 'deepseek-v4-flash')
  assert.equal(await writer.getByLabel('代码模型（QS 适配）', { exact: true }).inputValue(), 'deepseek-v4-pro')
  assert.equal(await writer.getByLabel('代码推理强度', { exact: true }).inputValue(), 'max')
  await writer.screenshot({ path: join(artifacts, 'writing-model-settings.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 650))
  await poll(async () => (await writer.evaluate(() => innerWidth)) < 1100)
  const saveSettingsBounds = await writer.getByRole('button', { name: '保存设置', exact: true }).boundingBox()
  assert.ok(saveSettingsBounds.y + saveSettingsBounds.height < await writer.evaluate(() => innerHeight), 'settings footer stays visible in compact windows')
  assert.equal(await writer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await writer.screenshot({ path: join(artifacts, 'writing-model-settings-compact.png') })
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), regularSize)
  await poll(async () => (await writer.evaluate(() => innerWidth)) > 1100)
  await writer.getByRole('button', { name: '取消', exact: true }).click()
  const bindings = await writer.evaluate(async () => {
    const bridge = window.quaNovelWriter
    const context = await bridge.context()
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '关联', brief: '写作', mode: 'step', seed: { characters: '用户角色设定' } }) })
    const { project } = await response.json()
    const linked = await fetch(`/api/projects/${project.id}/editor-context`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root: context.root, seed: context }) })
    return linked.json()
  })
  assert.equal(bindings.project.editorRoot, first)
  assert.equal(bindings.project.seed.characters, '用户角色设定')
  assert.match(bindings.project.seed.outline, /arrival/)
  await writer.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '保留海边小镇设定。' }) })
    if (!response.ok)
      throw new Error('Writing model request failed')
  }, bindings.project.id)
  assert.equal(writingCalls, 1)
  await writer.getByRole('button', { name: '从 QS 改写', exact: true }).click()
  await poll(async () => (await writer.getByRole('textbox', { name: '回写稿件' }).inputValue()).includes('雨停了吗'))
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('凛：雨停了。\n旁白：车站有人等着。')
  process.stdout.write('Writing UI: checking Escape and draft resume.\n')
  await writer.getByRole('textbox', { name: '回写稿件' }).press('Escape')
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).inputValue(), '凛：雨停了。\n旁白：车站有人等着。')
  await writer.getByRole('button', { name: '预览修改', exact: true }).click()
  await writer.getByRole('button', { name: '应用到项目', exact: true }).click()
  await poll(() => page.locator('.source-pane').isVisible())
  assert.equal(await readFile(join(first, 'scene.qs'), 'utf8'), source, 'writing applies a draft only')
  await page.locator('#save').click()
  const rewritten = source.replace('雨停了吗？', '雨停了。').replace('车站空着。', '车站有人等着。')
  await poll(async () => (await readFile(join(first, 'scene.qs'), 'utf8')) === rewritten)
  // Capture includes existing unsaved text; append keeps it, and undo returns to that exact draft.
  await page.bringToFront()
  await page.locator('#editor .view-lines').click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type('\nUNSAVED DRAFT', { delay: 10 })
  await page.locator('#activity-writer').click()
  await writer.getByRole('button', { name: '从 QS 改写', exact: true }).click()
  await poll(async () => (await writer.getByRole('textbox', { name: '回写稿件' }).inputValue()).includes('UNSAVED DRAFT'))
  const unsaved = await writer.evaluate(() => window.quaNovelWriter.capture())
  await writer.getByRole('button', { name: '建立 AI 改写任务', exact: true }).click()
  await writer.getByPlaceholder('题材、篇幅、风格、禁区或参考作品…').waitFor()
  await assertSquareIconButtons()
  assert.match(await writer.getByPlaceholder('题材、篇幅、风格、禁区或参考作品…').inputValue(), /UNSAVED DRAFT/)
  await writer.locator('dialog[open]').evaluate(dialog => dialog.close())
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('旁白：追加的段落。')
  await writer.getByLabel('写入方式', { exact: true }).selectOption('append')
  await writer.getByRole('button', { name: '预览修改', exact: true }).click()
  await writer.getByRole('button', { name: '应用到项目', exact: true }).click()
  await poll(() => page.locator('.source-pane').isVisible())
  assert.equal(await readFile(join(first, 'scene.qs'), 'utf8'), rewritten)
  await page.bringToFront()
  await page.locator('#editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+z')
  await page.locator('#activity-writer').click()
  assert.equal((await writer.evaluate(() => window.quaNovelWriter.capture())).document.text, unsaved.document.text)
  await page.locator('#tab-source').click()
  await page.locator('#save').click()
  await poll(async () => (await readFile(join(first, 'scene.qs'), 'utf8')).includes('UNSAVED DRAFT'))
  // A persisted writing task restores the source location after page reload, then
  // expands/reduces paragraphs around a choice and restores a runtime variable.
  // eslint-disable-next-line no-template-curly-in-string -- QuaScript interpolation fixture
  const logicSource = '<script lang="ts">\nexport interface Scope { name: string }\n</script>\n@Node("before")\n凛: ${scope.name}，你来了。\n普通原稿\n- 继续 -> after\n@Node("after")\n凛: 出发吧。\n'
  await writeFile(join(first, 'logic.qs'), logicSource)
  await page.locator('#files button[data-path="logic.qs"]').click()
  await page.locator('#activity-writer').click()
  const linkedSource = await writer.evaluate(async () => {
    const { document } = await window.quaNovelWriter.capture()
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '源码绑定任务', brief: '改写当前场景', mode: 'step', editorRoot: document.root, editorSource: document }) })
    if (!response.ok)
      throw new Error(await response.text())
    return response.json()
  })
  await writer.reload()
  await writer.locator('.workbench-heading h2').filter({ hasText: '源码绑定任务' }).waitFor()
  await assertEmptyLayout()
  await writer.screenshot({ path: join(artifacts, 'writing-task-empty.png') })
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  await poll(async () => (await writer.locator('.writing-target-path').textContent()).endsWith('logic.qs'))
  // Draft/source pairs stay scoped to tasks, including out-of-order task reads.
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('凛：任务 A 的未提交改稿。')
  await writer.getByRole('button', { name: '关闭写入面板', exact: true }).click()
  await writer.evaluate(async ({ id, document }) => {
    const result = await fetch(`/api/projects/${id}/editor-source`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document) })
    if (!result.ok)
      throw new Error(await result.text())
  }, { id: bindings.project.id, document: unsaved.document })
  const chooseTask = title => writer.locator('.project-item').filter({ has: writer.locator('strong', { hasText: new RegExp(`^${title}$`) }) }).click()
  await chooseTask('关联')
  await writer.locator('.workbench-heading h2').filter({ hasText: /^关联$/ }).waitFor()
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  await poll(async () => (await writer.locator('.writing-target-path').textContent()).endsWith('scene.qs'))
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).inputValue(), '', 'new task never inherits another task manuscript')
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('旁白：任务 B 的未提交改稿。')
  await writer.getByRole('button', { name: '关闭写入面板', exact: true }).click()
  let releaseRead
  let interceptedRead
  let completedRead
  const readIntercepted = new Promise((resolve) => {
    interceptedRead = resolve
  })
  const readReleased = new Promise((resolve) => {
    releaseRead = resolve
  })
  const readCompleted = new Promise((resolve) => {
    completedRead = resolve
  })
  const delayedUrl = new URL(`/api/projects/${linkedSource.project.id}`, writer.url()).href
  await writer.route(delayedUrl, async (route) => {
    const response = await route.fetch()
    interceptedRead()
    await readReleased
    await route.fulfill({ response })
    completedRead()
  })
  await chooseTask('源码绑定任务')
  await readIntercepted
  await chooseTask('关联')
  await writer.locator('.workbench-heading h2').filter({ hasText: /^关联$/ }).waitFor()
  releaseRead()
  await readCompleted
  await writer.unroute(delayedUrl)
  await writer.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(await writer.locator('.workbench-heading h2').textContent(), '关联', 'late task response cannot replace the active task')
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).inputValue(), '旁白：任务 B 的未提交改稿。')
  assert.match(await writer.locator('.writing-target-path').textContent(), /scene\.qs$/)
  await writer.getByRole('button', { name: '关闭写入面板', exact: true }).click()
  await chooseTask('源码绑定任务')
  await writer.locator('.workbench-heading h2').filter({ hasText: '源码绑定任务' }).waitFor()
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).inputValue(), '凛：任务 A 的未提交改稿。')
  assert.match(await writer.locator('.writing-target-path').textContent(), /logic\.qs$/)
  process.stdout.write('Writing tasks: isolated drafts and source links, delayed-response switching passed.\n')
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('凛：小明，欢迎回来。\n玛拉：我也在等你。\n凛：门后就是站台。\n旁白：他们走了进去。')
  await writer.getByRole('button', { name: '预览修改', exact: true }).click()
  // eslint-disable-next-line no-template-curly-in-string -- QuaScript interpolation assertion
  await writer.locator('.writing-preview').filter({ hasText: '凛: ${scope.name}，欢迎回来。' }).waitFor()
  assert.equal(await readFile(join(first, 'logic.qs'), 'utf8'), logicSource)
  await writer.screenshot({ path: join(artifacts, 'smart-writeback.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 650))
  await poll(async () => (await writer.evaluate(() => window.innerWidth)) < 1100)
  const modalBounds = await writer.getByRole('dialog', { name: '写入项目', exact: true }).boundingBox()
  const viewport = await writer.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  await assertSquareIconButtons()
  assert.ok(modalBounds.x >= 0 && modalBounds.y >= 0 && modalBounds.x + modalBounds.width <= viewport.width && modalBounds.y + modalBounds.height <= viewport.height)
  assert.equal(await writer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await writer.getByRole('tab', { name: '修改预览', exact: true }).press('ArrowLeft')
  assert.equal(await writer.getByRole('textbox', { name: '回写稿件' }).isVisible(), true)
  await writer.screenshot({ path: join(artifacts, 'writing-manuscript-compact.png') })
  await writer.getByRole('tab', { name: '稿件', exact: true }).press('ArrowRight')
  await writer.screenshot({ path: join(artifacts, 'smart-writeback-compact.png') })
  const callsBeforeApply = adapterCalls
  await writer.getByRole('button', { name: '应用到项目', exact: true }).click()
  await poll(() => page.locator('.source-pane').isVisible())
  assert.equal(adapterCalls, callsBeforeApply, 'apply reuses the validated preview')
  await page.locator('#save').click()
  await poll(async () => (await readFile(join(first, 'logic.qs'), 'utf8')).includes('他们走了进去'))
  const adapted = await readFile(join(first, 'logic.qs'), 'utf8')
  assert.match(adapted, /凛: \$\{scope.name\}，欢迎回来。\n玛拉: 我也在等你。/)
  assert.match(adapted, /- 继续 -> after\n@Node\("after"\)\n凛: 门后就是站台。/)
  assert.ok(!adapted.includes('普通原稿'))
  // Save changes the disk revision; unchanged source content may safely rebase.
  await page.locator('#activity-writer').click()
  await writer.reload()
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  await poll(async () => (await writer.locator('.writing-target-path').textContent()).endsWith('logic.qs'))
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('凛：小明，再次欢迎。\n凛：门后的灯亮了。\n旁白：我们进去。')
  await writer.getByRole('button', { name: '预览修改', exact: true }).click()
  await writer.getByRole('button', { name: '应用到项目', exact: true }).click()
  await poll(() => page.locator('.source-pane').isVisible())
  await page.locator('#save').click()
  await poll(async () => (await readFile(join(first, 'logic.qs'), 'utf8')).includes('再次欢迎'))
  await page.locator('#activity-writer').click()
  const storedSource = await writer.evaluate(async id => (await fetch(`/api/projects/${id}/editor-source`)).json(), linkedSource.project.id)
  assert.match(storedSource.document.text, /再次欢迎/)
  assert.equal(storedSource.document.path, join(first, 'logic.qs'))

  // New generated files are created without replacing an existing path and opened as an undoable draft.
  await page.locator('#activity-writer').click()
  await writer.getByRole('button', { name: '继续稿件', exact: true }).click()
  await writer.getByLabel('写入方式', { exact: true }).selectOption('create')
  await writer.getByRole('textbox', { name: '回写稿件' }).fill('旁白：风吹过车站。\n凛：我们走吧。')
  await writer.getByRole('textbox', { name: '新 QS 文件路径' }).fill('chapter.qs')
  await writer.getByRole('button', { name: '预览修改', exact: true }).click()
  await writer.locator('.writing-preview').filter({ hasText: '凛: 我们走吧。' }).waitFor()
  await writer.screenshot({ path: join(artifacts, 'writing-qs.png') })
  await writer.getByRole('button', { name: '应用到项目', exact: true }).click()
  await poll(() => page.locator('.source-pane').isVisible())
  assert.equal(await readFile(join(first, 'chapter.qs'), 'utf8'), '')
  await page.locator('#save').click()
  await poll(async () => (await readFile(join(first, 'chapter.qs'), 'utf8')).includes('凛: 我们走吧。'))
  await page.screenshot({ path: join(artifacts, 'editor-qs.png') })
  await page.locator('#activity-writer').click()
  const snapshot = await writer.evaluate(() => window.quaNovelWriter.capture())
  const collision = await writer.evaluate(async (root) => {
    try {
      await window.quaNovelWriter.apply({ root, path: 'chapter.qs', mode: 'create', prose: '旁白：覆盖' })
      return ''
    }
    catch (error) {
      return String(error)
    }
  }, first)
  assert.match(collision, /已存在/)
  const escape = await writer.evaluate(async (root) => {
    try {
      await window.quaNovelWriter.apply({ root, path: '../escape.qs', mode: 'create', prose: '旁白：越界' })
      return ''
    }
    catch (error) {
      return String(error)
    }
  }, first)
  assert.match(escape, /项目内/)
  await writeFile(join(first, 'chapter.qs'), '旁白: external change\n')
  const conflict = await writer.evaluate(async (captured) => {
    try {
      await window.quaNovelWriter.apply({ root: captured.root, path: captured.path, mode: 'append', prose: '旁白：追加', base: captured })
      return ''
    }
    catch (error) {
      return String(error)
    }
  }, snapshot.document)
  assert.match(conflict, /变化|修改/)
  await app.evaluate(({ dialog, Menu }, second) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [second] })
    Menu.getApplicationMenu().getMenuItemById('open-project').click()
  }, second)
  await page.locator('#files[data-project-name="Writing second"]').waitFor({ state: 'attached' })
  await page.locator('#activity-writer').click()
  await writer.getByRole('button', { name: '项目资料', exact: true }).filter({ hasText: 'Writing second' }).waitFor()
  const stale = await writer.evaluate(async (captured) => {
    try {
      await window.quaNovelWriter.apply({ root: captured.root, path: captured.path, mode: 'rewrite', prose: '旁白：旧稿', base: captured })
      return ''
    }
    catch (error) {
      return String(error)
    }
  }, snapshot.document)
  assert.match(stale, /项目已切换/)
  assert.equal(await readFile(join(second, 'scene.qs'), 'utf8'), source)
  assert.deepEqual(errors, [])
  process.stdout.write('Writing project: context/canon, mock-provider AI adaptation, paragraph insertion/deletion, runtime variables, branch preservation, persisted source restore, repeated rewrite after save, undo, create, conflicts and project switch passed.\n')
}
catch (error) {
  console.error(await writer?.locator('.writing-dialog[open]').textContent().catch(() => ''))
  await writer?.screenshot({ path: join(artifacts, 'failed.png') }).catch(() => {})
  throw error
}
finally {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 })
  }).catch(() => {})
  await app.close()
  await new Promise(resolve => provider.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
