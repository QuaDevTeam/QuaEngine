import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { copyDemoFixture } from './demo-fixture.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editor = join(root, 'packages/editor/electron')
const require = createRequire(join(editor, 'package.json'))
const temporary = await mkdtemp(join(tmpdir(), 'qua-storage-smoke-'))
const artifacts = join(root, '.codex-tmp/editor-storage-smoke')
const target = process.argv.includes('--native') ? 'native' : 'web'
await mkdir(artifacts, { recursive: true })
const projectRoot = await copyDemoFixture(root, join(temporary, 'project'), { native: target === 'native' })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: require('electron'), args: [editor, '--project', projectRoot, `--user-data-dir=${temporary}`], env, timeout: 60000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
let session
async function until(check, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check())
      return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Storage smoke condition timed out')
}
const query = request => page.evaluate(({ session, request }) => window.quaEditor.previewStorage(session, request), { session, request })
try {
  await page.locator('#files[data-project-name^="Call Me Again Tomorrow"]').waitFor({ timeout: 30000 })
  await page.locator('#target').selectOption(target)
  await page.locator('#preview-mute').click()
  await page.locator('#run').click()
  await until(async () => {
    const state = await page.evaluate(() => window.quaEditor.previewState())
    if (state.phase === 'error')
      throw new Error(state.error)
    session = state.identity?.sessionId
    return state.phase === 'running' && !state.reloading
  }, target === 'native' ? 600000 : 90000)
  if (target === 'web') {
    await app.evaluate(async ({ webContents }) => {
      const preview = webContents.getAllWebContents().find(view => /^http:\/\/127\.0\.0\.1:/.test(view.getURL()))
      await preview.executeJavaScript(`(async () => {
        localStorage.setItem('storage-smoke', JSON.stringify({message:'<img src=x onerror=alert(1)>',value:42}));
        sessionStorage.setItem('session-fixture','only this preview');
        const op = indexedDB.open('StorageSmoke',1);
        op.onupgradeneeded=()=>{op.result.createObjectStore('assets',{keyPath:'id'});op.result.createObjectStore('keys')};
        const db=await new Promise((resolve,reject)=>{op.onsuccess=()=>resolve(op.result);op.onerror=()=>reject(op.error)});
        const tx=db.transaction(['assets','keys'],'readwrite');
        tx.objectStore('keys').put({kind:'date'},new Date(1700000000000));
        tx.objectStore('keys').put({kind:'compound'},['route',new Date(1700000000000)]);
        tx.objectStore('keys').put({kind:'binary'},new Uint8Array([1,2,3]));
        for(let i=0;i<65;i++) tx.objectStore('assets').put({id:'item-'+String(i).padStart(3,'0'),metadata:{package:'fixture',hash:'test'},data:new Blob([new Uint8Array(100000)],{type:'image/png'})});
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject}); db.close();
        const cache=await caches.open('StorageSmokeCache');
        await cache.put('/fixture.json',new Response(JSON.stringify({resource:'cached',value:7}),{headers:{'Content-Type':'application/json'}}));
        for(const version of ['one','two']) await cache.put(new Request(location.origin+'/vary',{headers:{'X-Version':version}}),new Response(version,{headers:{'Content-Type':'text/plain','Vary':'X-Version'}}));
      })()`)
    })
    // The Web view can finish loading before the game's asynchronous engine init.
    await until(async () => (await query({ action: 'catalog' })).sources.some(source => source.id === 'renderer:resources'))
  }
  const catalog = await query({ action: 'catalog' })
  assert.ok(catalog.sources.length >= 3)
  let source
  if (target === 'web') {
    assert.ok(catalog.sources.some(source => source.label === 'Local Storage'))
    assert.ok(catalog.sources.some(source => source.label === 'Session Storage'))
    source = catalog.sources.find(source => source.group === 'IndexedDB，StorageSmoke' && source.label === 'assets')
    assert.ok(source)
    const records = await query({ action: 'page', source: source.id })
    assert.equal(records.rows.length, 50)
    assert.equal(records.hasMore, true)
    assert.equal((await query({ action: 'page', source: source.id, offset: 50 })).rows.length, 15)
    const detail = await query({ action: 'detail', source: source.id, key: records.rows[0].key })
    assert.deepEqual(JSON.parse(detail.detail.text).data, { type: 'Blob', mime: 'image/png', bytes: 100000 })
    const keyStore = catalog.sources.find(source => source.group === 'IndexedDB，StorageSmoke' && source.label === 'keys')
    const keyRows = await query({ action: 'page', source: keyStore.id })
    assert.equal(keyRows.rows.length, 3)
    for (const row of keyRows.rows) assert.ok(['date', 'compound', 'binary'].includes(JSON.parse((await query({ action: 'detail', source: keyStore.id, key: row.key })).detail.text).kind))
    const local = catalog.sources.find(source => source.label === 'Local Storage')
    assert.equal(JSON.parse((await query({ action: 'detail', source: local.id, key: 'storage-smoke' })).detail.text).value, 42)
    const cache = catalog.sources.find(source => source.group === 'Cache Storage' && source.label === 'StorageSmokeCache')
    const cached = await query({ action: 'page', source: cache.id })
    const values = []
    for (const row of cached.rows) values.push(JSON.parse((await query({ action: 'detail', source: cache.id, key: row.key })).detail.text).body)
    assert.ok(values.some(value => value.includes('cached')))
    // Chromium replaces an existing URL on put; matching the retained Vary response
    // still requires its original request headers (a URL-only lookup would fail).
    assert.ok(values.includes('two'), 'Cache Vary entries retain their request headers')
    assert.equal(JSON.parse(cached.rows.find(row => JSON.parse(row.key).url.endsWith('/vary')).key).headers['x-version'], 'two')
  }
  else {
    source = catalog.sources.find(source => source.id === 'engine:snapshots')
    assert.ok(source, catalog.note)
    assert.ok(source.description.includes('内存'), source.description)
    const records = await query({ action: 'page', source: source.id })
    assert.ok(records.rows.length > 0, 'Actual JavaScriptCore engine checkpoints must be visible')
    const checkpoint = records.rows.find(row => row.key.includes('editor:baseline'))
    assert.ok(checkpoint)
    assert.ok((await query({ action: 'detail', source: source.id, key: checkpoint.key })).detail.text.includes('editor:baseline'))
    const assets = await query({ action: 'page', source: 'native:assets' })
    assert.ok(assets.rows.length > 0)
    assert.ok(assets.rows.every(row => row.resident === true))
    assert.ok((await query({ action: 'detail', source: 'native:assets', key: assets.rows[0].key })).detail.bytes > 0)
    assert.ok((await query({ action: 'page', source: 'native:bundles' })).rows.length > 0)
  }
  await assert.rejects(query({ action: 'delete', source: source.id }))
  await assert.rejects(query({ action: 'page', source: source.id, offset: -1 }))
  await page.locator('#tab-storage').click()
  await page.locator('#storage-sources button').first().waitFor()
  await page.locator('#storage-sources button').filter({ hasText: source.label }).first().click()
  await until(() => page.locator('#storage-table tbody tr').count().then(count => count > 0))
  await page.locator('#storage-table tbody button').first().click()
  await until(() => page.locator('#storage-detail .console-json-node').count().then(count => count > 0))
  assert.equal(await page.locator('#storage-detail img').count(), 0)
  await page.locator('#storage-raw').click()
  await page.locator('#storage-detail pre').waitFor()
  for (const id of ['storage-tree', 'storage-raw', 'storage-copy', 'storage-refresh']) {
    assert.ok((await page.locator(`#${id}`).boundingBox()).height <= 24)
    assert.ok(await page.locator(`#${id}`).getAttribute('aria-label'))
    assert.equal(await page.locator(`#${id} svg`).count(), 1)
  }
  assert.ok((await page.locator('#storage-filter').boundingBox()).height <= 22)
  assert.equal(await page.locator('#storage-description').count(), 0)
  assert.equal(await page.locator('#storage-status').isVisible(), false)
  if (target === 'web') {
    await page.locator('#storage-next').click()
    await until(() => page.locator('#storage-table tbody tr').count().then(count => count === 15))
    await page.locator('#storage-filter').fill('item-064')
    await until(() => page.locator('#storage-table tbody tr').count().then(count => count === 1))
    await page.locator('#storage-table tbody button').first().click()
    await until(() => page.locator('#storage-detail').textContent().then(text => text.includes('item-064')))
  }
  await page.locator('#panel-storage').screenshot({ path: join(artifacts, `${target}-storage.png`) })
  if (target === 'web') {
    assert.ok(catalog.sources.some(source => source.id === 'renderer:resources'))
    await page.evaluate(({ session }) => window.quaEditor.previewCommand(session, { action: 'seek', path: 'src/game/scenes/prologue-arrival.qs', stepIndex: 5 }), { session })
    await until(async () => (await query({ action: 'page', source: 'renderer:resources' })).rows.length > 0)
    const resources = await query({ action: 'page', source: 'renderer:resources' })
    assert.ok(resources.rows.length > 0, 'Real Web renderer handles must be visible')
    assert.ok(resources.rows.every(row => row.resident === true))
    assert.ok(JSON.parse((await query({ action: 'detail', source: 'renderer:resources', key: resources.rows[0].key })).detail.text).refs > 0)
    await page.locator('#storage-sources button').filter({ hasText: '内存资源' }).click()
    await until(() => page.locator('#storage-table tbody tr[data-resident="true"]').count().then(count => count > 0))
    await page.locator('#storage-table tbody button').first().click()
    await until(() => page.locator('#storage-detail .console-json-node').count().then(count => count > 0))
    await page.locator('#panel-storage').screenshot({ path: join(artifacts, 'web-resources.png') })
  }
  if (target === 'native') {
    const ordinaryBackground = await page.locator('#storage-table tbody tr').first().evaluate(element => getComputedStyle(element).backgroundColor)
    await page.locator('#storage-sources button').filter({ hasText: '驻留资源' }).click()
    await until(() => page.locator('#storage-table th').first().textContent().then(text => text === '资源路径'))
    assert.ok(await page.locator('#storage-table tbody tr[data-resident="true"]').count() > 0)
    assert.notEqual(await page.locator('#storage-table tbody tr').first().evaluate(element => getComputedStyle(element).backgroundColor), ordinaryBackground)
    assert.equal(await page.locator('#storage-resident-legend').isVisible(), true)
    await page.locator('#storage-table tbody button').first().click()
    await until(() => page.locator('#storage-detail-label').textContent().then(text => text.includes('字节')))
    await page.locator('#panel-storage').screenshot({ path: join(artifacts, 'native-resources.png') })
  }
  await page.screenshot({ path: join(artifacts, `${target}-workbench.png`) })
  await page.evaluate(() => window.quaEditor.stopPreview())
  await until(() => page.locator('#storage-sources button').count().then(count => count === 0))
  await assert.rejects(query({ action: 'catalog' }))
  assert.deepEqual(errors, [])
  await writeFile(join(artifacts, `${target}-result.json`), JSON.stringify({ target, sources: catalog.sources, errors }, null, 2))
  process.stdout.write(`${target}: real storage catalog, paged records, bounded details, UI and stale-session rejection passed\n`)
}
catch (error) {
  process.stderr.write(`${JSON.stringify(await page.evaluate(() => window.quaEditor.previewState()).catch(() => undefined))}\n`)
  await page.screenshot({ path: join(artifacts, `${target}-failure.png`) }).catch(() => {})
  throw error
}
finally {
  await app.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}
