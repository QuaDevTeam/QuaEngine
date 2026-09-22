/** Full text-story and Web UI regression; media/native E2E remains separate. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { openDemoPage } from './web-test-helpers.mjs'

const url = process.env.QUA_STORY_URL || 'http://localhost:4178/'
const output = process.env.QUA_STORY_OUTPUT
  ? resolve(process.env.QUA_STORY_OUTPUT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../.generated/qa/story')
const browser = await chromium.launch({
  ...(process.env.QUA_STORY_CHROMIUM
    ? { executablePath: process.env.QUA_STORY_CHROMIUM }
    : { channel: process.env.QUA_PROLOGUE_BROWSER || 'chrome' }),
  args: ['--no-proxy-server'],
})
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
page.setDefaultTimeout(20_000)
const memoryAudit = process.env.QUA_MEMORY_AUDIT === '1'
const memorySamples = []
if (memoryAudit) {
  await page.addInitScript(() => {
    const urls = new Map()
    let created = 0
    let revoked = 0
    let peakUrls = 0
    let peakBytes = 0
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      // Store numeric metadata only, never retain Blob/Image objects in the audit.
      urls.set(url, blob.size || 0)
      created += 1
      peakUrls = Math.max(peakUrls, urls.size)
      peakBytes = Math.max(peakBytes, [...urls.values()].reduce((a, b) => a + b, 0))
      return url
    }
    URL.revokeObjectURL = (url) => {
      urls.delete(url)
      revoked += 1
      revoke(url)
    }
    window.__quaMemorySample = () => ({
      activeUrls: urls.size,
      activeBlobBytes: [...urls.values()].reduce((a, b) => a + b, 0),
      created,
      revoked,
      peakUrls,
      peakBytes,
      estimatedDomImageBytes: [...document.images].reduce((sum, image) => sum + image.naturalWidth * image.naturalHeight * 4, 0),
    })
  })
}
const errors = []
const requests = []
const results = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error')
    errors.push(message.text())
})
page.on('request', request => requests.push(request.url()))
const button = name => page.getByRole('button', { name, exact: true })
// Cold QPK ingestion includes IndexedDB writes; keep interaction checks at 20s,
// but wait for application readiness separately on slow disks.
const readyTitle = () => button('从头开始').waitFor({ timeout: 60_000 })
const line = page.locator('.qua-dialogue-text')
const waitLine = text => page.waitForFunction(text => document.querySelector('.qua-dialogue-text')?.textContent?.includes(text), text)
const menu = () => page.locator('[data-qui-id="native-game-hud-menu"]').click()
function stageCast() {
  return page.locator('.qua-character[data-character-visible="true"]:not([data-character-presence="exit"])').evaluateAll(elements => elements.map(el => ({
    id: el.dataset.characterId,
    expression: el.dataset.spriteExpression,
    x: el.dataset.characterX,
    y: el.dataset.characterY,
    scale: el.dataset.characterScale,
    opacity: Number(getComputedStyle(el).opacity),
  })).sort((a, b) => a.id.localeCompare(b.id)))
}
const actingChecks = new Map([
  ['照片里那张宽大的调音桌', { id: 'mara', expression: 'neutral', x: 480, companions: { haruka: 'neutral' } }],
  ['她今天来不了，想改成发文件。', { id: 'mara', expression: 'neutral', x: 960 }],
  ['台门口的感应灯亮了。', { id: 'mara', expression: 'hesitant', x: 960 }],
  ['Mara 和由美回到台里，把移动设备交给春香。', { id: 'mara', expression: 'tired', x: 700, companions: { yumi: 'neutral' } }],

  ['纸袋贴着手心，还暖着。', { asset: 'inserts/rain-paper-bag.webp', absent: ['rin', 'mara', 'haruka', 'mayu', 'reiko', 'yumi'], insertSave: true }],
  ['两盒旧磁带等在桌角。', { asset: 'inserts/archive-tape-splice.webp', absent: ['mara'] }],
  ['左边的正常节目仍然在播。', { asset: 'inserts/return-line-closeup.webp', absent: ['mara', 'haruka'] }],
  ['箱底最后露出一只小铜铃', { asset: 'inserts/photo-studio-bell.webp', absent: ['mara'] }],
  ['两把并排，中间隔着一张登记单。', { asset: 'inserts/two-blue-umbrellas.webp', absent: ['mara', 'haruka'] }],
  ['Mara 又覆上另一只手', { asset: 'inserts/nineteen-twelve-hands.webp', absent: ['rin', 'mara'] }],
  ['船舱外的观景平台已经开放。', { asset: 'inserts/aoba-from-the-boat.webp', absent: ['mara'] }],
  ['咖啡、苏打和一只布丁占了中间', { asset: 'inserts/cafe-shared-table.webp', absent: ['mara'] }],
  ['晚上回到凛的房间，她们把电影放了出来。', { asset: 'backgrounds/rin-room-night.webp', id: 'mara', expression: 'date-smile', y: 785, absent: ['rin', 'haruka', 'mayu', 'reiko', 'yumi'] }],
  ['洗发水在最里面。', { asset: 'backgrounds/drugstore-day.webp', id: 'mara', expression: 'neutral' }],
  ['Mara 笑着等凛走完。', { asset: 'backgrounds/tour-boat-cabin.webp', id: 'mara', expression: 'leisure-neutral', y: 785 }],
  ['Mara 靠近半步。湿袖口', { id: 'mara', x: 900, scale: 1.04 }],
  ['礼子看着她的背影，没有叫住她。', { id: 'mara', x: 260, scale: 0.9, companions: { reiko: 'work-alt-hesitant' }, absent: ['haruka'] }],
  ['拆下来的就这些？', { id: 'mara', expression: 'neutral', y: 750, asset: 'backgrounds/civic-exhibit-room.webp' }],

  ['十分钟后，门被推开。Mara 一手提着自己的布袋', { id: 'mara', expression: 'pose-drinks' }],
  ['Mara 放下布袋，把手里的饮料递给凛，又从袋里取出自己的那罐搁在长椅上，才去装衣服。', { id: 'mara', expression: 'smile' }],
  ['这里是海岸台的新址测试。', { id: 'haruka', expression: 'pose-script' }],
  ['Mara 关掉测试通道，才笑出声。凛也跟着笑了。春香瞪了两人一眼，想绷住脸，嘴角却先翘了起来，最后也笑出了声。', { id: 'haruka', expression: 'pose-script-laugh', companions: { mara: 'laugh-soft' } }],
  ['我也怕，所以今天不往那边去。', { id: 'mara', expression: 'pose-equipment-worried', companions: { yumi: 'serious' } }],
  ['有汤的啦。今天不吃冷饭。', { id: 'mara', expression: 'pose-equipment-soft', companions: { yumi: 'serious' } }],
  ['半年前，隔离件没有换。', { id: 'reiko', expression: 'work-alt-uneasy', absent: ['mayu'] }],
  ['礼子将审批单转向几人。房间里只听见纸擦过桌面的声音，她的签字就在末尾的横线上。她又将纸推近些，慢慢收回手。', { id: 'reiko', expression: 'work-alt-hesitant' }],
  ['那晚为什么听不清，也查明白了。', { id: 'mayu', expression: 'work-alt-documents' }],
  ['真由递来处理说明。凛找到当晚导出文件的编号，逐项核对后，在台方接收栏签了名。', { id: 'mayu', expression: 'work-alt-serious' }],
  ['Mara 听到这里笑出来。', { id: 'mara', expression: 'laugh-soft' }],
  ['Mara 的眼睛很红，却没哭。凛看着她低下头，扯了扯衬衫下摆，将露出来的线头绕在指尖。', { id: 'mara', expression: 'hurt-look-away' }],
  ['Mara 低下头，用拇指蹭了蹭衬衫下摆的扣子。再看凛时，耳朵也红了。', { id: 'mara', expression: 'date-shy-look-down' }],
  ['Mara 伸出手，又看了一眼还在屋里的由美。凛也跟着望过去。由美正核对下一张表，头都没抬。', { id: 'mara', expression: 'pose-offer-hand', companions: { yumi: 'neutral' } }],
  ['再放一次后面那段。', { id: 'mara', expression: 'pose-listening' }],
  ['你刚才看见了吧。', { id: 'mara', expression: 'annoyed' }],
  ['我也喜欢你，凛。', { id: 'mara', expression: 'date-blush' }],
  ['你明明知道我在问什么，还说没什么。', { id: 'mara', expression: 'annoyed' }],
  ['春香将原邮件、培训录音、修订稿分别打开', { id: 'haruka', absent: ['mara', 'mayu'] }],
  ['这句话会记。你做过的那些，也都会记', { id: 'yumi', expression: 'serious', absent: ['mayu'] }],
  ['现在在洗衣服，你的简图没画错。', { absent: ['mara'] }],
  ['神代小姐？', { id: 'mara', expression: 'rain-neutral' }],
  ['那算青叶的声音。', { absent: ['rin', 'mara'], backgroundOnly: true }],
  ['你脸上说了。', { id: 'mara', expression: 'leisure-neutral', wardrobeSave: true, companions: { haruka: 'leisure-smile', yumi: 'leisure-neutral' } }],
  ['她转过头来。凛躲开她的目光，看了一眼搁在中间的茶。', { id: 'mara', expression: 'leisure-pose-listening' }],
  ['放。另一张也找到了，我妈发的链接。', { id: 'mara', expression: 'leisure-neutral' }],
  ['你已经皱了一路眉了。', { id: 'mara', expression: 'autumn-smile' }],
  ['看完再做饭。不想边切东西边听。', { id: 'mara', expression: 'autumn-serious' }],
])
const checkedActing = new Set()
const lightingChecks = []
async function checkActing(text) {
  for (const [fragment, expected] of actingChecks) {
    if (!text.includes(fragment) || checkedActing.has(fragment))
      continue
    // Presence and committed timeline updates can settle after dialogue text.
    await page.waitForTimeout(450)
    const cast = await stageCast()
    for (const actor of cast) assert(actor.opacity >= 0.99, `${fragment}: ${actor.id} is painted, not merely flagged visible`)
    if (expected.id) {
      const actor = cast.find(c => c.id === expected.id)
      assert(actor, `${fragment}: ${expected.id} is on stage`)
      if (expected.expression)
        assert.equal(actor.expression, expected.expression, fragment)
      for (const key of ['x', 'y', 'scale']) {
        if (expected[key] !== undefined)
          assert(Math.abs(Number(actor[key]) - expected[key]) < 0.01, `${fragment}: committed ${key}`)
      }
      const sprite = page.locator(`.qua-character[data-character-id="${expected.id}"] .qua-sprite-layer--expression`)
      await page.waitForFunction((id) => {
        const image = document.querySelector(`.qua-character[data-character-id="${id}"] .qua-sprite-layer--expression`)
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      }, expected.id)
      await sprite.first().evaluate(el => el.decode())
      assert(await sprite.first().evaluate(el => el.naturalWidth > 0), `${fragment}: actual expression image loads`)
    }
    for (const id of expected.absent || []) assert(!cast.some(c => c.id === id), `${fragment}: ${id} stays offscreen`)
    // Every selected scene, including autumn scenes, must decode its QPK image.
    const backgroundDigest = async () => page.locator('.qua-background').evaluate(async (image) => {
      await image.decode()
      const bytes = await (await fetch(image.src)).arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
    })
    await page.waitForFunction(() => {
      const image = document.querySelector('.qua-background')
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
    })
    await page.locator('.qua-background').evaluate(el => el.decode())
    if (expected.asset) {
      const bytes = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../assets/images', expected.asset))
      const digest = createHash('sha256').update(bytes).digest('hex')
      assert.equal(await backgroundDigest(), digest, `${fragment}: correct authored image decoded from QPK`)
      if (expected.insertSave) {
        await menu()
        await button('保存进度').click()
        await page.locator('[data-qui-id="slot-3"]').click()
        await page.waitForFunction(id => /\d{2}:\d{2}/.test(document.querySelector(`[data-qui-id="${id}"]`)?.textContent || ''), 'slot-3-meta')
        await openDemoPage(page, page.url())
        await readyTitle()
        await button('读取存档').click()
        await page.locator('[data-qui-id="slot-3"]').click()
        await waitLine(fragment)
        await page.waitForTimeout(450)
        assert.equal(await backgroundDigest(), digest, 'fresh-page load retains the insert image')
        assert.deepEqual(await stageCast(), cast, 'fresh-page insert load does not reintroduce hidden characters')
      }
    }
    for (const [id, expression] of Object.entries(expected.companions || {})) {
      assert.equal(cast.find(c => c.id === id)?.expression, expression, `${fragment}: companion outfit`)
    }
    if (expected.expression === 'pose-drinks') {
      const heroine = page.locator('.qua-character[data-character-id="mara"]')
      const material = () => heroine.locator('feColorMatrix').getAttribute('values')
      assert.equal(await heroine.getAttribute('data-character-lighting'), 'graded')
      const before = await material()
      assert(before?.startsWith('1.02 0 0 0 0'))
      assert.equal(await heroine.locator('feComposite').getAttribute('in2'), 'SourceAlpha')
      const sourceUrls = await heroine.locator('img').evaluateAll(images => images.map(image => image.src))
      await snapshot('lighting-laundry-after')
      const filter = await heroine.evaluate(el => el.style.filter)
      try {
        await heroine.evaluate((el) => {
          el.style.filter = 'none'
        })
        await snapshot('lighting-laundry-before')
      }
      finally {
        await heroine.evaluate((el, value) => {
          el.style.filter = value
        }, filter)
      }
      assert.deepEqual(await heroine.locator('img').evaluateAll(images => images.map(image => image.src)), sourceUrls)
      lightingChecks.push('scene grading reuses the original sprite images')
      await menu()
      await button('保存进度').click()
      await page.locator('[data-qui-id="slot-7"]').click()
      await page.waitForFunction(id => /\d{2}:\d{2}/.test(document.querySelector(`[data-qui-id="${id}"]`)?.textContent || ''), 'slot-7-meta')
      await openDemoPage(page, page.url())
      await readyTitle()
      await button('读取存档').click()
      await page.locator('[data-qui-id="slot-7"]').click()
      await waitLine(fragment)
      await page.waitForTimeout(450)
      assert.equal(await material(), before, 'fresh-page load restores authored lighting')
      assert.deepEqual(await stageCast(), cast)
      await heroine.locator('.qua-sprite-layer--expression').first().evaluate(el => el.decode())
      lightingChecks.push('lighting, costume and pose survive fresh-page save/load')
    }
    if (expected.expression === 'pose-script') {
      assert.equal(await page.locator('.qua-character[data-character-lighting="graded"]').count(), 0)
      lightingChecks.push('the next unlit scene removes its character filters')
    }
    if (expected.wardrobeSave) {
      await menu()
      await button('保存进度').click()
      await page.locator('[data-qui-id="slot-2"]').click()
      await page.waitForFunction(id => /\d{2}:\d{2}/.test(document.querySelector(`[data-qui-id="${id}"]`)?.textContent || ''), 'slot-2-meta')
      await openDemoPage(page, page.url())
      await readyTitle()
      await button('读取存档').click()
      await page.locator('[data-qui-id="slot-2"]').click()
      await waitLine(fragment)
      await page.waitForTimeout(450)
      assert.deepEqual(await stageCast(), cast, 'fresh-page save/load retains every outfit, expression and stage position')
      for (const id of ['mara', 'haruka', 'yumi']) {
        await page.locator(`.qua-character[data-character-id="${id}"] .qua-sprite-layer--expression`).first().evaluate(el => el.decode())
      }
    }
    checkedActing.add(fragment)
    await snapshot(`acting-${expected.expression || expected.id || 'offscreen'}-${checkedActing.size}`)
  }
}
async function advance() {
  await page.waitForTimeout(2000)
  await line.click()
  await page.waitForTimeout(150)
}
let capturedChoice = false
async function skipTo(text) {
  if (await page.locator('[data-qui-id="native-game-hud-skip"]').getAttribute('aria-pressed') !== 'true')
    await page.locator('[data-qui-id="native-game-hud-skip"]').click()
  await button(text).waitFor({ timeout: 240_000 })
  if (!capturedChoice) {
    const stage = await page.locator('.qua-stage').first().boundingBox()
    for (const choice of await page.locator('.qua-choice-button').all()) {
      const bounds = await choice.boundingBox()
      assert(bounds && stage && bounds.x >= stage.x && bounds.x + bounds.width <= stage.x + stage.width + 1, 'choices stay fully inside the fitted stage')
    }
    await snapshot('choice')
    capturedChoice = true
  }
  await button(text).click()
}
// Fast-forward deliberately omits intermediate dialogue paint. Exercise selected
// prose in normal reading mode instead, using the same click intents as a reader.
async function readNormallyUntil(finished, expected) {
  const seen = []
  for (let clicks = 0; clicks < 2400; clicks++) {
    const text = await line.textContent() || ''
    await checkActing(text)
    for (const fragment of expected) {
      if (text.includes(fragment) && !seen.includes(fragment))
        seen.push(fragment)
    }
    if (await finished()) {
      assert.deepEqual(seen, expected, 'normal reading displays the expected prose in order')
      return
    }
    await page.locator('.qua-dialogue-box').click({ force: true })
    // Revealing a line schedules projection and DOM updates. Observe the painted
    // result before another click can advance past it on a slower frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  assert.fail(`normal reading did not reach its target; observed ${JSON.stringify(seen)}`)
}
function pass(message) {
  results.push(message)
  console.warn(`PASS: ${message}`)
}
async function snapshot(name) {
  await page.waitForTimeout(350)
  if (memoryAudit)
    memorySamples.push({ name, ...await page.evaluate(() => window.__quaMemorySample()) })
  await page.screenshot({ path: resolve(output, `${name}.png`) })
}
async function title() {
  await menu()
  await button('返回标题').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('button', { name: '返回标题', exact: true }).click()
  await button('从头开始').waitFor()
}
try {
  await mkdir(output, { recursive: true })
  await openDemoPage(page, url)
  await readyTitle()
  assert(await button('继续阅读').isDisabled())
  await page.evaluate(() => document.fonts.ready)
  await snapshot('title')
  await button('章节选择').click()
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [aria-disabled="true"]').count(), 9)
  assert(!(await page.locator('[data-qui-id="native-story-tree-panel"]').textContent()).includes('下一次约会'))
  await button('返回标题').click()
  await button('读取存档').click()
  await page.locator('[data-qui-id="slot-9"][aria-disabled="true"]').waitFor()
  assert.equal(await page.locator('[data-qui-id^="slot-"][aria-disabled="true"]').count(), 9)
  assert.equal(await button('保存').count(), 0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await button('设置').click()
  const skipMode = page.locator('select[aria-label="快进范围"]')
  assert.equal(await skipMode.inputValue(), '0')
  await skipMode.selectOption('1')
  await snapshot('settings')
  await page.locator('[data-qui-id="settings-close"]').click()
  pass('fresh title, locked spoiler-free chapters, empty load slots, readable settings with read-only skip default')

  await button('从头开始').click()
  await waitLine('2019 年')
  await page.keyboard.press('Escape')
  await snapshot('menu')
  await button('继续阅读').click()
  await advance()
  assert(!(await line.textContent()).includes('2019 年'))
  pass('closing the reading menu resumes live dialogue')
  await readNormallyUntil(() => button('先看看档案目录').isVisible(), [
    '由美是从图书馆找到公司的。',
    '他车里收的是 FM。手机也能听',
    '他搬鱼的时候，没手一条条翻',
    '日常节目还是我们做',
    '图书馆要做旧港街区的声音展',
    '费用从文化资料整理经费和台里的搬迁预算里出',
    '新节目找得到。',
    '接得顺，也不一定就是当时那句话',
    '下午的常规街访我和春香分着接',
    '普通日班九点到五点半',
  ])
  await button('先看看档案目录').click()
  await waitLine('先看目录吧')
  const savedCast = await stageCast()
  assert(savedCast.some(c => c.id === 'mara'), 'manual save includes the staged heroine')
  await menu()
  await button('保存进度').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await page.waitForFunction(id => /\d{2}:\d{2}/.test(document.querySelector(`[data-qui-id="${id}"]`)?.textContent || ''), 'slot-1-meta')
  await snapshot('save')
  await page.locator('[data-qui-id="slot-1"]').click()
  await snapshot('overwrite-confirm')
  await button('取消').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await button('覆盖保存').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').waitFor({ state: 'detached' })
  await page.locator('[data-qui-id="native-save-load-close"]').click()
  await page.locator('[data-qui-id="native-game-hud-menu"]').waitFor()
  await openDemoPage(page, page.url())
  await readyTitle()
  await button('读取存档').click()
  await page.locator('[data-qui-id="slot-1"]').click()
  await waitLine('先看目录吧')
  assert.deepEqual(await stageCast(), savedCast, 'fresh-page load restores character expressions and logical positions')
  await advance()
  await waitLine('这话听着很可靠')
  pass('manual save, overwrite confirmation and fresh-page load preserve branch and playback')
  await title()
  await openDemoPage(page, page.url())
  await readyTitle()
  await button('继续阅读').click()
  await waitLine('这话听着很可靠')
  await advance()
  assert(!(await line.textContent()).includes('这话听着很可靠'))
  pass('returning to title saves a continuation point that survives refresh')
  await page.mouse.move(640, 360)
  await page.mouse.wheel(0, -120)
  await page.locator('[data-qui-id="backlog-panel"]').waitFor()
  assert((await page.locator('[data-qui-id="backlog-panel"]').textContent()).includes('先看目录吧'))
  assert.equal(await page.locator('[data-qui-id^="backlog-entry-"][data-qui-id$="-body"]').filter({ hasText: '先看目录吧' }).count(), 1, 'fresh-page loading does not duplicate the restored line')
  assert.equal(await page.locator('[data-qui-id^="backlog-entry-"][data-qui-id$="-body"]').filter({ hasText: '这话听着很可靠' }).count(), 1, 'menu/title resume does not duplicate the restored line')
  const history = page.locator('[data-qui-id="backlog-scroll"]')
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-qui-id="backlog-scroll"]')
    return el && el.scrollHeight - el.scrollTop - el.clientHeight < 3
  })
  await button('最早记录').click()
  assert.equal(await history.evaluate(el => el.scrollTop), 0)
  await button('最近记录').click()
  assert(await history.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 3))
  await snapshot('backlog')
  await page.locator('[data-qui-id="backlog-close"]').click()
  await readNormallyUntil(() => button('先核对港口通知').isVisible(), [
    '场地按月，线路另算。',
    '这里租的是输出接口、设备位',
    '不用再开路铺线。',
    '记录机也得单独校时，节目里的报时只能拿来比对',
    '港口北边那排旧公寓，我住二楼。',
    '楼下是房东开的修改衣服的小店。',
    '原来是耳机。我昨天还在换话筒线。',
    '不能只把公文缩短念一遍',
    '这次传输断了一会儿，设备还在采样',
    '不是你们试验的条件。',
    '今天不是我的班。',
    '明天换下来拿给我吧。照常收钱',
    '昨天选好的采访等这一段修完就能接着剪。',
    '八号晚上开始？',
    '检修仍然要他们安排。',
    '这一遍可以吗？',
    '六月十三日，晚上好。这里是海岸台',
    '鲸鱼杯还在原处，蓝色尾巴朝着屋里。',
  ])
  pass('normal reading establishes the rented research workplace, ordinary jobs and known public programme before the first anomalous return')
  await button('先核对港口通知').click()
  await waitLine('我去查通知')
  await skipTo('把录音的内容告诉她')
  await waitLine('我现在把全文给你')
  await skipTo('先到海音办公室核对工单与备件')
  await waitLine('我先去办公室')
  await skipTo('留下来，继续协助核查')
  await waitLine('我留下来')
  await skipTo('现在办理原始资料的外部保全')
  await page.locator('[data-qui-id="native-game-hud-skip"]').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('heading', { name: '明天，请再一次呼唤我', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('等她说晚安')
  await snapshot('ending-tomorrow')
  pass('full main line reaches the romance and November aftermath ending')

  await button('返回标题').click()
  await button('章节选择').click()
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [aria-disabled="false"]').count(), 9)
  await snapshot('chapters')
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [data-qui-id^="chapter-number-"]').first().textContent(), '序章')
  assert.equal(await page.locator('[data-qui-id="native-story-tree-panel"] [data-qui-id^="chapter-number-"]').last().textContent(), '尾声')
  await page.locator('[data-qui-id="chapter-05"][role="button"]').click()
  await waitLine('六月二十三日，上午八点四十五分')
  await skipTo('先在台里核对原始录音与附件')
  await waitLine('我先跟春香')
  await skipTo('留下来，继续协助核查')
  await skipTo('保留已有副本，后续正式调取原件')
  await page.locator('[data-qui-id="native-game-hud-skip"]').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('heading', { name: '雨后的来信', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('等她说晚安')
  pass('chapter replay restores its starting decisions and reaches the formal-followup romance ending')

  await button('返回标题').click()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-01"][role="button"]').click()
  await waitLine('六月十三日')
  await readNormallyUntil(() => button('先核对节目的原始录音').isVisible(), [])
  await button('先核对节目的原始录音').click()
  await waitLine('先听原始录音吧')
  await readNormallyUntil(async () => (await line.textContent())?.includes('几人关掉监听。凛收好电话本，明早还要靠那两通电话确认采访安排。'), [
    '那家店关了。',
    '门框顶部只有两个空螺孔。',
    '凛先报了时间和地点，等她点头再抬手。Mara 轻轻推动那块板。',
    '旧店没有重新开门',
    '今天的旧鱼市专题，有一位受访者未能按原计划参加',
  ])
  pass('normal reading follows the closed photo shop mystery through its actual sound source and returns to the next ordinary assignment')
  await title()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-02"][role="button"]').click()
  await readNormallyUntil(async () => (await line.textContent())?.includes('汽水已经不凉了'), [
    '今天我不能留下。',
    '下周一上午还要去上课',
    '只排半天，午饭以后休息。',
    '这周录得够多了。我就是想出去走走。',
    '自己的资料还要六分钟备份完。',
    '先绕一下我家可以吗？',
    '我高中时给文化祭接过音箱。',
    '我在这里等就好。',
    '上面摊着一件拆开半边的布包。',
  ])
  pass('normal reading places Mara’s family, job history and separate home within the June16 harbor outing')
  await title()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-03"][role="button"]').click()
  await waitLine('六月十七日')
  await readNormallyUntil(async () => (await line.textContent())?.includes('早晨放进包的那本书还在'), [
    '是冷却水泵，给试验设备散热的。',
    '我丈夫在外地工作，周末才回来。',
    '我明天是要去市民中心。但我还没丢啊。',
    '以后搬进来可能要帮忙读招领',
    '蓝伞还在。',
    '区别很小，但确实不是同一把。',
    '用手机打开海岸台的普通网络广播。',
    '外观相同，实物不同。',
    '今天不用去台里。',
    '到图书馆门口，凛没有立刻进去。对面有一小块运动场，几个人慢慢打着球，旁边的楼里传来练琴的声音，同一句开头反复弹了三遍。',
    '六月十九日，上午十点半。南湾海滩。',
    '最后还是没超过九下。',
    '四个人坐在同一张垫子上',
    '蓝伞已经由本人核对补布、签名领走',
    '我们下午去灯塔，昨天约好了。',
  ])
  pass('normal reading follows the umbrella mystery, single beach outing into the prearranged lighthouse walk')
  await readNormallyUntil(async () => (await line.textContent())?.includes('凛望着桌上的两份回单。十七号的泵为什么不停，没人补做实测；居民夜里被吵醒，得到的却是白天检查的结果。两份回单都写着正常，问题却还在。'), [
    '录取邮件，其实已经来了。',
    '以后这样叫，可以吗？',
    '结论写着正常延时冷却，问题关闭。',
    '只谈过借后巷推车。',
    '我家住店楼上。',
    '让他们晚上带仪器来。',
    '夜里的复测、运行时间和隔声措施，分别问',
    '工具的低柜受了潮',
  ])
  pass('normal reading gives the resident an independent life, a dated complaint and an actual follow-up instead of inferring electrical danger from noise')
  await title()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-07"][role="button"]').click()
  await waitLine('六月二十四日')
  await readNormallyUntil(async () => (await line.textContent())?.includes('她们折回去，由美把门边那把递出来，问这次是不是凛的。凛说是，脸有点热。'), [
    '我要去买洗发水。一起吗？',
    '那我下次还叫你哦。',
    '五点半下班以后，凛先回房间，打开自己的申请。今天台里的归档工作已经交完，晚饭约在六点半。',
    '今天和明天都是排好的休息日。',
    '游客码头在鱼市外侧。',
    '四十分钟这么快。',
    '缝补用品店隔壁有间咖啡厅。',
    '两人坐到三点半。Mara 看完一话，抬头看了看时间，又翻过一页，才有些舍不得地合上书。',
    '不收。就是想和你一起。',
    '我喜欢你，Mara。想和你交往。',
    '我也喜欢你，凛。',
    '晚上回到凛的房间，她们把电影放了出来。',
    'Mara 伸出手，又看了一眼还在屋里的由美。凛也跟着望过去。由美正核对下一张表，头都没抬。',
    '最后，凛先牵住 Mara。Mara 收紧手指，低头笑了。两人走到楼梯口，凛才想起还没拿伞。',
  ])
  pass('normal reading follows recovery, the harbor cruise and cafe rest into a deliberate invitation and mutual confession')
  await title()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-05"][role="button"]').click()
  await readNormallyUntil(() => button('先在台里核对原始录音与附件').isVisible(), [])
  await button('先在台里核对原始录音与附件').click()
  await readNormallyUntil(() => button('留下来，继续协助核查').isVisible(), [
    '只是给设施方参考。',
    '录音没有提过锁门。这一层恐惧是她自己加上去的。',
    '哪句话写我不再投诉了',
    '他没有进围栏里的维护楼',
    '居民回函、完整视频和借道登记另列材料',
  ])
  await button('留下来，继续协助核查').click()
  await readNormallyUntil(() => button('现在办理原始资料的外部保全').isVisible(), [
    '辅助支路仍带电',
    '批准人是礼子',
    '后面的批准是我续的',
    '没有依据说有人准备点火',
    '这句话会记。你做过的那些，也都会记',
  ])
  pass('normal reading distinguishes the resident allegation from verified video, false approval and physical risk')
  await button('现在办理原始资料的外部保全').click()
  await readNormallyUntil(async () => (await line.textContent())?.includes('六月二十四日'), [
    '去门口的转播车，由美跟我。',
    '我也怕，所以今天不往那边去。',
    '有汤的啦。今天不吃冷饭。',
    '十七点五十分',
    '你别松手，我还没缓过来。',
  ])
  pass('normal reading preserves the equipment bag through worry, tentative reassurance and departure before confirmed shutdown')
  await title()
  await button('章节选择').click()
  await page.locator('[data-qui-id="epilogue"][role="button"]').click()
  // Chapter replay restores the formal-followup snapshot last saved on this chapter.
  await readNormallyUntil(() => page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('heading', { name: '雨后的来信', exact: true }).isVisible(), [
    '七月，第二个周六',
    '收到原回函的机构，现在都收到了更正',
    '没有查到外部改录音的记录',
    '九月，东京。星期六。',
    '十一月的一个星期六',
    '没有被要求以撤回投诉',
    '没有查到人为点火或居民破坏研究设备的证据',
    '没有进展览，也没有拿来宣传',
    '信封已经收进抽屉，明早没有哪一页非得再查一次。',
  ])
  pass('normal reading closes the July and November investigation, compensation, archive and relationship aftermath')
  await button('返回标题').click()
  await button('章节选择').click()
  await page.locator('[data-qui-id="chapter-04"][role="button"]').click()
  await waitLine('六月二十二日')
  await readNormallyUntil(() => button('先为昨晚的隐瞒道歉').isVisible(), [
    '可能是我自己听岔了。',
    '春香在凛的记录下面也写下“东堤”。',
    '外勤先取消。所有人的',
    '二十点三十五分',
    '凛没有告诉她，自己刚才已经把名字写了下来。',
    '二十一点零五分',
    '她在普通维护区被困，救出时已失去意识，严重吸入烟气。',
    '睡不着时，凛又打开最早那份录音，依然听不清。她关掉播放，后来辨清的那句完整通报却在脑子里反复响起。',
    '八点零五分。设施管理方',
    '涉及你本人的那段事故警报，你收到副本了吗',
  ])
  await button('先为昨晚的隐瞒道歉').click()
  await waitLine('因为我害怕')
  await readNormallyUntil(() => button('先在台里核对原始录音与附件').isVisible(), [
    '没说你为什么没能出来，也没说哪里先起的火。',
    '我现在还生气。你先把情况说完',
    '六月二十三日，上午八点四十五分',
  ])
  pass('normal reading renders the morning callback, disclosure conflict and ensuing investigation in order')
  await button('先在台里核对原始录音与附件').click()
  await skipTo('完成交接，提前结束这次委托')
  await page.locator('[data-qui-id="native-game-hud-skip"]').click()
  await page.locator('[data-qui-id="native-title-confirm-panel"], [data-qui-id="native-save-confirm-panel"], [data-qui-id="native-game-over-panel"]').getByRole('heading', { name: '下一次见面', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('她们的话还没有说完')
  await snapshot('ending-handoff')
  pass('early handoff preserves the safety response and ends with continued contact')
  await button('返回标题').click()
  await button('从头开始').click()
  await waitLine('2019 年')
  await skipTo('先听一段居民留言')
  await waitLine('先听听吧')
  await skipTo('先核对节目的原始录音')
  await waitLine('先听原始录音吧')
  pass('new game resets decisions while preserving manual saves and chapter access')
  await title()
  await page.setViewportSize({ width: 960, height: 720 })
  await snapshot('title-tablet')
  await page.setViewportSize({ width: 844, height: 390 })
  await snapshot('title-phone-landscape')
  const bounds = await button('设置').boundingBox()
  assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 844 && bounds.y + bounds.height <= 390)
  pass('title controls remain inside the fitted stage on tablet and phone landscape')
  if (memoryAudit) {
    const finalMemory = await page.evaluate(() => window.__quaMemorySample())
    assert(finalMemory.revoked > 0, 'unused image object URLs are actually revoked during reading')
    assert(finalMemory.activeUrls <= 16, 'returning to title does not retain the full story image set')
    memorySamples.push({ name: 'final-title', ...finalMemory })
  }
  assert.deepEqual(errors, [])
  assert(requests.some(request => /\.qpk$/.test(request)))
  assert(!requests.some(request => request.includes('/@qua-assets/')))
  assert.deepEqual([...checkedActing].sort(), [...actingChecks.keys()].sort(), 'all authored acting checks were reached in normal reading')
  pass('character expressions, offscreen voices and fresh-page staging restoration use actual QPK images')
  assert.equal(lightingChecks.length, 3)
  pass('authored lighting reuses sprites, survives save/load and resets in the next scene')
  pass('production QPK loads without browser errors or development VFS requests')
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ url, results, errors, actingChecks: [...checkedActing], lightingChecks, memorySamples }, null, 2))
  await rm(resolve(output, 'failure.json'), { force: true })
  await rm(resolve(output, 'failure.png'), { force: true })
}
catch (error) {
  // A browser disconnect must not replace the original failure with a failed
  // screenshot or body read. Keep diagnostics useful even after a page crash.
  await snapshot('failure').catch(() => {})
  const text = await page.locator('body').textContent().catch(() => '<page unavailable>')
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, results, errors, actingChecks: [...checkedActing], text }, null, 2))
  throw error
}
finally { await browser.close() }
