/** Full text-story and Web UI regression; media/native E2E remains separate. */
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const url = process.env.QUA_STORY_URL || 'http://localhost:4178/'
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../.generated/qa/story')
const browser = await chromium.launch({ channel: process.env.QUA_PROLOGUE_BROWSER || 'chrome', args: ['--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()
page.setDefaultTimeout(20_000)
const errors = [], requests = [], results = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => requests.push(request.url()))
const button = name => page.getByRole('button', { name, exact: true })
const line = page.locator('.qua-dialogue-text')
const waitLine = text => page.waitForFunction(text => document.querySelector('.qua-dialogue-text')?.textContent?.includes(text), text)
const advance = async () => { await page.waitForTimeout(2000); await line.click(); await page.waitForTimeout(150) }
let capturedChoice = false
const skipTo = async text => {
  if (!(await page.locator('[data-hud-action="skip"]').getAttribute('class'))?.includes('is-active')) await page.locator('[data-hud-action="skip"]').click()
  await button(text).waitFor({ timeout: 240_000 })
  if (!capturedChoice) {
    const stage = await page.locator('.qua-stage').first().boundingBox()
    for (const choice of await page.locator('.qua-choice-button').all()) {
      const bounds = await choice.boundingBox()
      assert(bounds && stage && bounds.x >= stage.x && bounds.x + bounds.width <= stage.x + stage.width + 1, 'choices stay fully inside the fitted stage')
    }
    await snapshot('choice'); capturedChoice = true
  }
  await button(text).click()
}
// Fast-forward deliberately omits intermediate dialogue paint. Exercise selected
// prose in normal reading mode instead, using the same click intents as a reader.
const readNormallyUntil = async (finished, expected) => {
  const seen = []
  for (let clicks = 0; clicks < 2400; clicks++) {
    const text = await line.textContent() || ''
    for (const fragment of expected) {
      if (text.includes(fragment) && !seen.includes(fragment)) seen.push(fragment)
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
const pass = message => { results.push(message); console.log(`PASS: ${message}`) }
const snapshot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: resolve(output, `${name}.png`) }) }
const menu = () => page.locator('[data-hud-action="menu"]').click()
const title = async () => {
  await menu(); await button('返回标题').click(); await page.locator('.qua-confirm-overlay').getByRole('button', { name: '返回标题', exact: true }).click(); await button('从头开始').waitFor()
}
try {
  await mkdir(output, { recursive: true })
  await page.goto(url)
  await button('从头开始').waitFor()
  assert(await button('继续阅读').isDisabled())
  await page.evaluate(() => document.fonts.ready)
  await snapshot('title')
  await button('章节选择').click()
  assert.equal(await page.locator('[data-story-tree-node-entry-locked="true"]').count(), 9)
  assert(!(await page.locator('.vn-story-tree').textContent()).includes('下一次约会'))
  await button('返回标题').click()
  await button('读取存档').click()
  assert.equal(await page.locator('.qua-save-slot-button:disabled').count(), 9)
  assert.equal(await button('保存').count(), 0)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await button('设置').click()
  const skipMode = page.locator('[data-setting="skipMode"]')
  assert.equal(await skipMode.inputValue(), '"read"')
  await skipMode.selectOption('"all"')
  await snapshot('settings')
  await page.locator('.vn-settings-close').click()
  pass('fresh title, locked spoiler-free chapters, empty load slots, readable settings with read-only skip default')

  await button('从头开始').click(); await waitLine('2019 年')
  await page.keyboard.press('Escape'); await snapshot('menu'); await button('继续阅读').click(); await advance()
  assert(!(await line.textContent()).includes('2019 年'))
  pass('closing the reading menu resumes live dialogue')
  await readNormallyUntil(() => button('先看看档案目录').isVisible(), [
    '五月底，由美从市立图书馆拿到我们公司的联系方式',
    '手机、车里都能听。', '他搬鱼的时候，没手一条条翻',
    '日常节目还是我们做', '图书馆要做旧港街区的声音展',
    '费用从文化资料整理经费和台里的搬迁预算里出',
    '新节目找得到。', '它接得顺，也可能只是猜得顺',
    '下午的常规街访我和春香分着接', '普通日班九点到五点半',
  ])
  await button('先看看档案目录').click(); await waitLine('先看目录吧')
  await menu(); await button('保存进度').click(); await page.locator('[data-save-slot-id="slot-1"]').click()
  await page.locator('[data-save-slot-id="slot-1"].is-filled').waitFor(); await snapshot('save')
  await page.locator('[data-save-slot-id="slot-1"]').click(); await snapshot('overwrite-confirm'); await button('取消').click()
  await page.locator('[data-save-slot-id="slot-1"]').click(); await button('覆盖保存').click()
  await page.locator('.qua-confirm-overlay').waitFor({ state: 'detached' })
  await page.reload(); await button('读取存档').click(); await page.locator('[data-save-slot-id="slot-1"]').click()
  await waitLine('先看目录吧'); await advance(); await waitLine('这话听着很可靠')
  pass('manual save, overwrite confirmation and fresh-page load preserve branch and playback')
  await title(); await page.reload(); await button('继续阅读').click(); await waitLine('这话听着很可靠')
  await advance(); assert(!(await line.textContent()).includes('这话听着很可靠'))
  pass('returning to title saves a continuation point that survives refresh')
  await page.mouse.move(640, 360); await page.mouse.wheel(0, -120); await page.locator('.qua-backlog-panel').waitFor()
  assert((await page.locator('.qua-backlog-panel').textContent()).includes('先看目录吧'))
  assert.equal(await page.locator('.qua-backlog-entry-text').filter({ hasText: '先看目录吧' }).count(), 1, 'fresh-page loading does not duplicate the restored line')
  assert.equal(await page.locator('.qua-backlog-entry-text').filter({ hasText: '这话听着很可靠' }).count(), 1, 'menu/title resume does not duplicate the restored line')
  const history = page.locator('.qua-backlog-list')
  await page.waitForFunction(() => { const el = document.querySelector('.qua-backlog-list'); return el && el.scrollHeight - el.scrollTop - el.clientHeight < 3 })
  await button('最早记录').click()
  assert.equal(await history.evaluate(el => el.scrollTop), 0)
  await button('最近记录').click()
  assert(await history.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 3))
  await snapshot('backlog'); await page.locator('.qua-backlog-close').click()
  await readNormallyUntil(() => button('先核对港口通知').isVisible(), [
    '场地按月，线路另算。', '这里租的是输出接口、设备位', '不用再开路铺线。',
    '记录机也得单独校时，节目里的报时只能拿来比对',
    '港口北边那排旧公寓，我住二楼。', '楼下是房东开的修改衣服的小店。',
    '换错对象了。昨天还以为是话筒线。', '不能只把公文缩短念一遍',
    '这次是传输中断后补回来的。', '不是你们试验的条件。',
    '今天不是我的班。', '明天脱下来给我。收钱的啊',
    '昨天选好的采访等这一段修完就能接着剪。', '八号晚上开始？', '检修仍然要他们安排。',
    '这一遍可以吗？', '六月十三日，晚上好。这里是海岸台', '她的杯子就在窗边。',
  ])
  pass('normal reading establishes the rented research workplace, ordinary jobs and known public programme before the first anomalous return')
  await button('先核对港口通知').click(); await waitLine('我去查通知')
  await skipTo('把录音的内容告诉她'); await waitLine('我现在把全文给你')
  await skipTo('先到海音办公室核对工单与备件'); await waitLine('我先去办公室')
  await skipTo('留下来，继续协助核查'); await waitLine('我留下来')
  await skipTo('现在办理原始资料的外部保全')
  await page.locator('[data-hud-action="skip"]').click()
  await page.locator('.qua-confirm-overlay').getByRole('heading', { name: '明天，请再一次呼唤我', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('等她说晚安')
  await snapshot('ending-tomorrow')
  pass('full main line reaches the romance and November aftermath ending')

  await button('返回标题').click(); await button('章节选择').click()
  assert.equal(await page.locator('[data-story-tree-node-entry-locked="false"]').count(), 9)
  await snapshot('chapters')
  assert.equal(await page.locator('.qua-story-tree__chapter').first().innerText(), '序章')
  assert.equal(await page.locator('.qua-story-tree__chapter').last().innerText(), '尾声')
  await page.locator('[data-story-tree-node-id="chapter-05"] button').click(); await waitLine('六月二十三日，上午八点四十五分')
  await skipTo('先在台里核对原始录音与附件'); await waitLine('我先跟春香')
  await skipTo('留下来，继续协助核查')
  await skipTo('保留已有副本，后续正式调取原件')
  await page.locator('[data-hud-action="skip"]').click()
  await page.locator('.qua-confirm-overlay').getByRole('heading', { name: '雨后的来信', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('等她说晚安')
  pass('chapter replay restores its starting decisions and reaches the formal-followup romance ending')

  await button('返回标题').click(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-01"] button').click(); await waitLine('六月十三日')
  await readNormallyUntil(() => button('先核对节目的原始录音').isVisible(), [])
  await button('先核对节目的原始录音').click(); await waitLine('先听原始录音吧')
  await readNormallyUntil(async () => (await line.textContent())?.includes('今晚已经没有能再问的地方'), [
    '那家店关了。', '门框顶部只有两个空螺孔。', '我先报了时间和地点',
    '旧店没有重新开门', '今天的旧鱼市专题，有一位受访者未能按原计划参加',
  ])
  pass('normal reading follows the closed photo shop mystery through its actual sound source and returns to the next ordinary assignment')
  await title(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-02"] button').click()
  await readNormallyUntil(async () => (await line.textContent())?.includes('汽水已经不凉了'), [
    '今天我不能留下。', '下周一上午还要去上课',
    '只排半天，午饭以后休息。', '这周录得够多了。我就是想出去走走。', '自己的资料还要六分钟备份完。',
    '先绕一下我家可以吗？', '我高中时给文化祭接过音箱。',
    '我在这里等就好。', '上面摊着一件拆开半边的布包。',
  ])
  pass('normal reading places Mara’s family, job history and separate home within the June16 harbor outing')
  await title(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-03"] button').click(); await waitLine('六月十七日')
  await readNormallyUntil(async () => (await line.textContent())?.includes('早晨放进包的那本书还在'), [
    '给试验设备散热的，跟居民家的自来水没关系。',
    '我丈夫在外地工作，周末才回来。',
    '我明天是要去市民中心。但我还没丢。', '以后搬进来可能要帮忙读招领',
    '蓝伞还在。', '区别很小，但确实不是同一把。',
    '用手机打开海岸台的普通网络广播。', '外观相同，实物不同。',
    '今天不用去台里。', '到图书馆门口，我没有立刻进去。',
    '六月十九日，上午十点半。南湾海滩。',
    '最后还是没超过九下。', '四个人坐在同一张垫子上',
    '蓝伞已经由本人核对补布、签名领走',
    '我们下午去灯塔，昨天约好了。',
  ])
  pass('normal reading follows the umbrella mystery, single beach outing into the prearranged lighthouse walk')
  await readNormallyUntil(async () => (await line.textContent())?.includes('一个“正常”，把两件尚未处理的事一起盖过去了'), [
    '录取邮件，其实已经来了。', '以后这样叫，可以吗？',
    '结论写着正常延时冷却，问题关闭。', '只谈过借后巷推车。',
    '我家住店楼上。', '让他们晚上带仪器来。',
    '夜里的复测、运行时间和隔声措施，分别问', '工具的低柜受了潮',
  ])
  pass('normal reading gives the resident an independent life, a dated complaint and an actual follow-up instead of inferring electrical danger from noise')
  await title(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-07"] button').click(); await waitLine('六月二十四日')
  await readNormallyUntil(async () => (await line.textContent())?.includes('我也喜欢你，凛。'), [
    '我要去买洗发水。一起吗？', '那我下次还叫你。', '五点半下班以后，我先回房间',
    '今天和明天都是排好的休息日。',
    '游客码头在鱼市外侧。', '四十分钟这么快。',
    '缝补用品店隔壁有间咖啡厅。', '我们坐到三点半。',
    '不收。就是想和你一起。',
    '我喜欢你，Mara。想和你交往。', '我也喜欢你，凛。',
  ])
  pass('normal reading follows recovery, the harbor cruise and cafe rest into a deliberate invitation and mutual confession')
  await title(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-05"] button').click()
  await readNormallyUntil(() => button('先在台里核对原始录音与附件').isVisible(), [])
  await button('先在台里核对原始录音与附件').click()
  await readNormallyUntil(() => button('留下来，继续协助核查').isVisible(), [
    '只是给设施方参考。', '我停住，把逐字稿关掉。',
    '哪句话写我不再投诉了', '他没有进围栏里的维护楼',
    '居民回函、完整视频和借道登记另列材料',
  ])
  await button('留下来，继续协助核查').click()
  await readNormallyUntil(() => button('现在办理原始资料的外部保全').isVisible(), [
    '辅助支路仍带电', '批准人是礼子', '后面的批准是我续的',
    '没有依据说有人准备点火', '这句话会记。你做过的那些，也都会记',
  ])
  pass('normal reading distinguishes the resident allegation from verified video, false approval and physical risk')
  await button('现在办理原始资料的外部保全').click()
  await title(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="epilogue"] button').click()
  // Chapter replay restores the formal-followup snapshot last saved on this chapter.
  await readNormallyUntil(() => page.locator('.qua-confirm-overlay').getByRole('heading', { name: '雨后的来信', exact: true }).isVisible(), [
    '七月，第二个周六', '收到原回函的机构，现在都收到了更正',
    '没有查到外部改录音的记录', '九月，东京。星期六。',
    '十一月的一个星期六', '没有被要求以撤回投诉',
    '没有查到人为点火或居民破坏研究设备的证据', '没有进展览，也没有拿来宣传',
    '日期写好了。我没带出来。',
  ])
  pass('normal reading closes the July and November investigation, compensation, archive and relationship aftermath')
  await button('返回标题').click(); await button('章节选择').click()
  await page.locator('[data-story-tree-node-id="chapter-04"] button').click(); await waitLine('六月二十二日')
  await readNormallyUntil(() => button('先为昨晚的隐瞒道歉').isVisible(), [
    '可能是我自己听岔了。', '不是只有我听见。',
    '外勤先取消。所有人的', '二十点三十五分', '我没有告诉她',
    '二十一点零五分', '她在普通线路维护区被困，救出时已失去意识，严重吸入烟气。',
    '睡不着时，我又打开过最早那份录音。它还是听不清。', '八点零五分。设施管理方', '涉及你本人的那段事故警报，你收到副本了吗',
  ])
  await button('先为昨晚的隐瞒道歉').click(); await waitLine('因为我害怕')
  await readNormallyUntil(() => button('先在台里核对原始录音与附件').isVisible(), [
    '没有说门为什么出不去，也没有说火从哪里起。',
    '我现在还生气。你先把情况说完', '六月二十三日，上午八点四十五分',
  ])
  pass('normal reading renders the morning callback, disclosure conflict and ensuing investigation in order')
  await button('先在台里核对原始录音与附件').click()
  await skipTo('完成交接，提前结束这次委托')
  await page.locator('[data-hud-action="skip"]').click()
  await page.locator('.qua-confirm-overlay').getByRole('heading', { name: '下一次见面', exact: true }).waitFor({ timeout: 240_000 })
  await waitLine('我们的话还没有说完')
  await snapshot('ending-handoff')
  pass('early handoff preserves the safety response and ends with continued contact')
  await button('返回标题').click(); await button('从头开始').click(); await waitLine('2019 年')
  await skipTo('先听一段居民留言'); await waitLine('先听听吧')
  await skipTo('先核对节目的原始录音'); await waitLine('先听原始录音吧')
  pass('new game resets decisions while preserving manual saves and chapter access')
  await title()
  await page.setViewportSize({ width: 960, height: 720 }); await snapshot('title-tablet')
  await page.setViewportSize({ width: 844, height: 390 }); await snapshot('title-phone-landscape')
  const bounds = await button('设置').boundingBox()
  assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 844 && bounds.y + bounds.height <= 390)
  pass('title controls remain inside the fitted stage on tablet and phone landscape')
  assert.deepEqual(errors, [])
  assert(requests.some(request => /\.qpk$/.test(request)))
  assert(!requests.some(request => request.includes('/@qua-assets/')))
  pass('production QPK loads without browser errors or development VFS requests')
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ url, results, errors }, null, 2))
  await rm(resolve(output, 'failure.json'), { force: true }); await rm(resolve(output, 'failure.png'), { force: true })
} catch (error) {
  await snapshot('failure')
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, results, errors,  text: await page.locator('body').innerText() }, null, 2))
  throw error
} finally { await browser.close() }
