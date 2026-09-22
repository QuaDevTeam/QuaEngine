import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(resolve(editorRoot, 'package.json'))
const home = await mkdtemp(join(tmpdir(), 'qua-writer-smoke-'))
const artifacts = resolve(root, '.codex-tmp/editor-novel-writer')
await mkdir(artifacts, { recursive: true })
const env = { ...process.env, NOVEL_WRITER_HOME: home }
delete env.ELECTRON_RUN_AS_NODE
// Do not reuse a fetch socket while verifying that the service has just shut down.
function httpStatus(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, { agent: false }, (response) => {
      response.resume()
      resolve(response.statusCode)
    })
    request.on('error', reject)
    request.setTimeout(3000, () => request.destroy(new Error('HTTP probe timed out')))
  })
}
let application, workbench, writer
const errors = []
async function poll(predicate, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate())
      return
    await delay(100)
  }
  throw new Error('Novel Writer smoke timed out')
}
try {
  application = await _electron.launch({ executablePath: require('electron'), args: [editorRoot, `--user-data-dir=${join(home, 'profile')}`], env, timeout: 60000 })
  workbench = await application.firstWindow()
  await workbench.locator('#activity-writer').waitFor()
  await application.evaluate(({ BrowserWindow, app, dialog }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setBackgroundThrottling(false)
    window.hide()
    globalThis.writerSmokeDialogs = []
    dialog.showMessageBox = async (...args) => { globalThis.writerSmokeDialogs.push(args.at(-1)); return { response: 0 } }
    dialog.showErrorBox = (title, message) => { globalThis.writerSmokeDialogs.push({ title, message }) }
    globalThis.writerSmokeInitial = app.getAppMetrics().filter(item => item.name === 'QuaEngine Novel Writer').length
  })
  assert.equal(await application.evaluate(() => globalThis.writerSmokeInitial), 0)
  await workbench.locator('#activity-writer').click()
  await poll(async () => {
    writer = application.context().pages().find(page => page.url().startsWith('http://127.0.0.1:'))
    const message = await workbench.locator('#writer-message').textContent()
    if (await workbench.locator('#writer-retry').isVisible())
      throw new Error(message)
    return Boolean(writer)
  })
  await application.evaluate(({ webContents }) => { for (const contents of webContents.getAllWebContents()) contents.setBackgroundThrottling(false) })
  await writer.evaluate(() => { globalThis.writerClicks = []; document.addEventListener('click', e => globalThis.writerClicks.push(e.target.closest('button')?.textContent), true); document.addEventListener('submit', e => globalThis.writerClicks.push('SUBMIT'), true) })
  writer.on('request', (request) => {
    if (request.url().includes('/api/'))
      console.log(request.method(), new URL(request.url()).pathname)
  })
  writer.on('response', async (response) => {
    if (response.status() >= 500)
      errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`)
    if (response.status() >= 400)
      console.log('writer HTTP', response.status(), await response.text().catch(() => ''))
  })
  writer.on('pageerror', error => errors.push(error.message))
  await writer.getByRole('button', { name: '新建项目', exact: true }).waitFor()
  assert.equal(await workbench.locator('.source-pane').isVisible(), false)
  assert.equal(await workbench.locator('#panel-console').isVisible(), true)
  assert.equal(await workbench.locator('#novel-writer').isVisible(), true)
  assert.equal(await writer.evaluate(() => typeof window.quaEditor), 'undefined')
  assert.equal(await writer.evaluate(() => typeof window.quaNovelWriter?.dirty), 'function')
  // Close other groups through their real controls to give the writing workspace room.
  // The writer page itself stays mounted throughout layout changes.
  const otherViews = await workbench.locator('.dock-tabs [data-dock-view]').evaluateAll(tabs => tabs.map(tab => tab.dataset.dockView).filter(id => !['writer', 'source'].includes(id)))
  for (const id of otherViews)
    await workbench.locator(`[data-dock-view="${id}"] .dock-tab-close`).click()
  const url = writer.url()
  assert.equal(await httpStatus(url), 401)
  const pageIdentity = await writer.evaluate(() => globalThis.writerSmokeIdentity = Math.random())
  await writer.getByRole('button', { name: '新建项目', exact: true }).evaluate(button => button.click())
  await writer.getByPlaceholder('例：异世界恋爱物语').fill('集成验收')
  await writer.getByPlaceholder('题材、篇幅、风格、禁区或参考作品…').fill('在暴雨中的邮局，两个角色一起查明一封旧信的去向。')
  await workbench.locator('#tab-source').click()
  assert.equal(await workbench.locator('.source-pane').isVisible(), true)
  await workbench.locator('#activity-writer').click()
  assert.equal(await writer.evaluate(() => globalThis.writerSmokeIdentity), pageIdentity)
  assert.equal(await writer.getByPlaceholder('例：异世界恋爱物语').inputValue(), '集成验收')
  console.log('draft', await writer.locator('dialog[open] input, dialog[open] textarea').evaluateAll(inputs => inputs.map(i => i.value)))
  await writer.locator('dialog[open] button[type=submit]').evaluate(button => button.click())
  console.log('clicks', await writer.evaluate(() => globalThis.writerClicks))
  await writer.locator('.workbench-heading h2').filter({ hasText: '集成验收' }).waitFor()
  await writer.getByRole('button', { name: '源文', exact: true }).waitFor()
  await writer.getByRole('button', { name: '源文', exact: true }).evaluate(button => button.click())
  const original = await writer.locator('.editor-textarea').inputValue()
  assert.ok(original.length > 20)
  await writer.locator('.editor-textarea').fill(`${original}\n旁白：尚未保存的写作草稿。`)
  await workbench.locator('#tab-source').click()
  await workbench.locator('#activity-writer').click()
  assert.match(await writer.locator('.editor-textarea').inputValue(), /尚未保存/)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await poll(async () => (await application.evaluate(() => globalThis.writerSmokeDialogs)).length > 0)
  assert.match((await application.evaluate(() => globalThis.writerSmokeDialogs)).at(-1).message, /Novel Writer/)
  assert.equal(workbench.isClosed(), false)
  await writer.getByRole('button', { name: '保存修改', exact: true }).evaluate(button => button.click())
  const api = async (path, options) => writer.evaluate(async ({ path, options }) => {
    const response = await fetch(path, options)
    return { status: response.status, body: await response.json() }
  }, { path, options })
  const projects = (await api('/api/projects')).body.projects
  assert.equal(projects.length, 1)
  const projectId = projects[0].id
  await poll(async () => (await api(`/api/projects/${projectId}`)).body.artifacts.some(artifact => artifact.markdown.includes('尚未保存的写作草稿')))
  // Accept the requirements checkpoint and verify the next stage advances through the original workflow.
  await writer.locator('.review-actions').getByRole('button', { name: '通过', exact: true }).evaluate(button => button.click())
  await poll(async () => (await api(`/api/projects/${projectId}`)).body.artifacts.length >= 2)
  const detail = (await api(`/api/projects/${projectId}`)).body
  assert.ok(detail.events.some(event => event.type === 'approval.recorded'))
  assert.ok(detail.artifacts.some(artifact => artifact.stage === 'worldbuilding'))
  // Editing another artifact must not discard unsaved manuscript or review notes.
  const world = detail.artifacts.find(artifact => artifact.stage === 'worldbuilding')
  const requirements = detail.artifacts.find(artifact => artifact.stage === 'requirements')
  await writer.locator('.artifact-chip').filter({ hasText: world.title }).click()
  await writer.getByRole('button', { name: '源文', exact: true }).click()
  await writer.locator('.editor-textarea').fill(`${world.markdown}\n旁白：保留世界观编辑草稿。`)
  await writer.getByPlaceholder('评审备注（可选）').fill('世界观待核对')
  await writer.locator('.artifact-chip').filter({ hasText: requirements.title }).click()
  await writer.locator('.editor-textarea').fill(`${requirements.markdown}\n旁白：独立需求草稿。`)
  await writer.locator('.artifact-chip').filter({ hasText: world.title }).click()
  assert.match(await writer.locator('.editor-textarea').inputValue(), /保留世界观编辑草稿/)
  assert.equal(await writer.getByPlaceholder('评审备注（可选）').inputValue(), '世界观待核对')
  const exported = await writer.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/export`)
    return { status: response.status, size: (await response.arrayBuffer()).byteLength, type: response.headers.get('content-type') }
  }, projectId)
  assert.equal(exported.status, 200)
  assert.ok(exported.size > 100)
  assert.match(exported.type, /zip/)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 650))
  await delay(250)
  assert.equal(await writer.locator('.inspector').isVisible(), true)
  await writer.getByRole('button', { name: '写入项目', exact: true }).click()
  await writer.getByRole('dialog', { name: '写入项目', exact: true }).waitFor()
  assert.ok((await writer.getByRole('textbox', { name: '回写稿件' }).inputValue()).length > 20)
  await writer.getByRole('textbox', { name: '回写稿件' }).press('Escape')
  assert.ok((await writer.locator('.workspace').boundingBox()).y <= 40)
  const overflow = await writer.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  const picture = await Promise.race([
    application.evaluate(async ({ webContents }) => {
      const contents = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('http://127.0.0.1:'))
      return (await contents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64')
    }),
    delay(5000).then(() => { throw new Error('Writing screenshot timed out') }),
  ])
  await writeFile(resolve(artifacts, 'writer-compact.png'), Buffer.from(picture, 'base64'))
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  // Project deletion remains reversible, and the complete source/API migrated together.
  assert.equal((await api(`/api/projects/${projectId}`, { method: 'DELETE' })).status, 200)
  assert.equal((await api('/api/trash')).body.projects.length, 1)
  assert.equal((await api(`/api/trash/${projectId}/restore`, { method: 'POST' })).status, 200)
  assert.equal((await api('/api/projects')).body.projects.length, 1)
  const metrics = await application.evaluate(({ app, webContents }) => ({
    services: app.getAppMetrics().filter(item => item.name === 'QuaEngine Novel Writer').map(item => ({ pid: item.pid, memory: item.memory, cpu: item.cpu })),
    pages: webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('http://127.0.0.1:')).length,
  }))
  assert.equal(metrics.services.length, 1)
  assert.equal(metrics.pages, 1)
  assert.deepEqual(errors, [])
  await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({ metrics, exported, projectId, errors }, null, 2))
  // Actual guarded application close must terminate the service, not leave an HTTP listener behind.
  await application.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({ response: 1 })
    BrowserWindow.getAllWindows()[0].close()
  })
  await poll(async () => {
    try { await httpStatus(url); return false }
    catch { return true }
  })
  application = undefined
  assert.ok((await readFile(join(home, 'projects', projectId.replace(/[^\w-]/g, '_'), 'project.json'), 'utf8')).includes('集成验收'))
  console.log('Novel Writer: lazy isolated service, docked workspace switch and close controls, drafts, project creation, fallback generation, review progression, ZIP export, trash/restore, compact layout and guarded shutdown passed.')
}
catch (error) {
  console.error(await workbench?.locator('#writer-message').textContent().catch(() => ''))
  console.error(errors)
  console.error((await writer?.locator('body').innerText().catch(() => '')).slice(-2500))
  await writer?.screenshot({ path: resolve(artifacts, 'failure.png'), timeout: 5000 }).catch(() => {})
  throw error
}
finally {
  if (application) {
    await application.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }) }).catch(() => {})
    await application.close().catch(() => {})
  }
  await rm(home, { recursive: true, force: true })
}
