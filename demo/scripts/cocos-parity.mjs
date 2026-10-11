import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { captureNative, clickNativeId, connectCocosNative, inspectNative, pressNativeKey } from './cocos-native-review.mjs'
import { readCocosSnapshot } from './cocos-observations.mjs'
import { createCocosArtifactServer } from './cocos-static-server.mjs'

const output = resolve(process.env.QUA_COCOS_REVIEW || 'dist/cocos/review/parity')
const workspace = resolve(process.env.QUA_COCOS_WORKSPACE || 'dist/cocos/workspace')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await mkdir(output, { recursive: true })
const resume = process.argv.includes('--resume')
const report = resume ? JSON.parse(await readFile(resolve(output, 'report.json'), 'utf8')) : { status: 'running', evidence: { web: 'production artifact and browser input', creator: 'Creator web-desktop artifact and browser input', mac: 'running macOS application, GPU capture and native input binding; OS pointer automation unverified' }, comparisons: [], routes: [], errors: [] }
const manifest = JSON.parse(await readFile(resolve(workspace, 'target-bundle-manifest.json'), 'utf8'))
const runtimeHash = createHash('sha256').update(await readFile(resolve(workspace, 'assets/qua-runtime/runtime.js'))).digest('hex')
if (resume) {
  assert.equal(report.status, 'failed', 'Resume requires a failed full-story report')
  assert.deepEqual(report.errors, [], 'Resolve runtime errors before resuming')
  assert.equal(report.artifact?.runtimeSha256, runtimeHash, 'Untracked or changed game artifacts require a fresh full run')
  assert.equal(report.artifact?.buildNumber, manifest.app.buildNumber, 'Changed resource build requires a fresh full run')
  await writeFile(resolve(output, `failed-report-${Date.now()}.json`), JSON.stringify(report, null, 2))
  ;(report.resumptions ||= []).push({ previousError: report.error, previousRoute: report.routes.at(-1)?.name, previousNodes: report.routes.at(-1)?.nodes, failedObservations: report.failedObservations })
  delete report.error
  delete report.failedObservations
  report.status = 'running'
}
report.artifact = { workspace, buildNumber: manifest.app.buildNumber, runtimeSha256: runtimeHash }
const servers = []
const browsers = []
const profileRoot = resolve(process.env.QUA_COCOS_PARITY_PROFILE || '.generated/cocos-parity')
let native
try {
  const targets = []
  const basePort = Number(process.env.QUA_COCOS_PARITY_BASE_PORT || 46180)
  report.browserProfiles = { directory: profileRoot, webOrigin: `http://127.0.0.1:${basePort + 1}`, creatorOrigin: `http://127.0.0.1:${basePort + 2}` }
  for (const [name, artifact] of [['web', resolve('dist')], ['creator', resolve(workspace, 'build/web-desktop')]]) {
    const server = createCocosArtifactServer(artifact)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(basePort + targets.length + 1, '127.0.0.1', resolve)
    })
    servers.push(server)
    const context = await chromium.launchPersistentContext(resolve(profileRoot, name), { channel: 'chrome', args: ['--no-proxy-server'], viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, locale: 'zh-CN' })
    browsers.push(context)
    const page = context.pages()[0] || await context.newPage()
    page.on('pageerror', error => report.errors.push({ target: name, error: error.message }))
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.errors.push({ target: name, error: message.text() })
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(name => name === 'web' ? globalThis.__QUA_DEMO_REVIEW__ : globalThis.__QUA_COCOS__, name, { timeout: 60000 })
    targets.push({ name, page, observe: () => page.evaluate(readStoryObservation), inspect: () => page.evaluate(name === 'web' ? readWebSnapshot : readCocosSnapshot), async click(id) {
      if (name === 'web') {
        await page.locator(`[data-qui-id="${id}"]`).click()
        return
      }
      for (let i = 0; i < 100; i++) {
        const s = await page.evaluate(readCocosSnapshot)
        const n = s.nodes.find(n => n.name === id && n.active)
        if (n?.actual) {
          const canvas = await page.locator('#GameCanvas').boundingBox()
          const b = n.actual
          await page.mouse.click(canvas.x + (b.x + b.width / 2) / s.layout.containerWidth * canvas.width, canvas.y + (s.layout.containerHeight - b.y - b.height / 2) / s.layout.containerHeight * canvas.height)
          await delay(150)
          return
        }
        await delay(100)
      }
      throw new Error(`Missing Creator control ${id}`)
    }, key: () => page.keyboard.press('Space'), capture: path => page.screenshot({ path }) })
  }
  native = await connectCocosNative()
  assert(await native.evaluate('!!globalThis.__QUA_COCOS__'), 'Launch the generated macOS app before parity review')
  targets.push({ name: 'mac', observe: () => native.evaluate(`(${readStoryObservation.toString()})()`), inspect: () => inspectNative(native), click: id => clickNativeId(native, id), key: () => pressNativeKey(native, 32, 0), capture: path => captureNative(native, path) })
  const mac = targets[2]
  for (let attempt = 0; attempt < 20 && (await mac.observe()).screen !== 'title'; attempt++) {
    const snapshot = await mac.inspect()
    const close = ['native-story-tree-close', 'native-save-load-close', 'settings-close', 'backlog-close'].find(id => snapshot.nodes.some(n => n.name === id && n.active))
    if (close) {
      await mac.click(close)
      continue
    }
    const screen = (await mac.observe()).screen
    if (screen === 'game-over') {
      await mac.click('native-game-over-title-action')
    }
    else if (screen === 'title-confirm') {
      await mac.click('native-title-confirm-confirm')
      for (let pending = 0; pending < 300 && (await mac.observe()).screen === 'title-confirm'; pending++) await delay(100)
    }
    else if (screen === 'game-menu') {
      await mac.click('native-game-menu-title-action')
    }
    else if (screen === 'game') {
      await mac.click('native-game-hud-menu')
    }
    await delay(250)
  }
  for (let attempt = 0; attempt < 100 && (await mac.observe()).screen !== 'title'; attempt++) await delay(100)
  assert.equal((await mac.observe()).screen, 'title', 'Parity starts from title')
  if (!resume) {
    // Give all three profiles the same continuation availability through input.
    await startStory()
    await all(t => t.click('native-game-hud-menu'))
    await all(t => t.click('native-game-menu-title-action'))
    await all(t => t.click('native-title-confirm-confirm'))
    for (const t of targets) {
      for (let attempt = 0; attempt < 100 && (await t.observe()).screen !== 'title'; attempt++) await delay(100)
    }
    await capture('title')
    await startStory()
    await capture('opening')
    await all(t => t.click('native-game-hud-menu'))
    await delay(700)
    await capture('menu')
    await all(t => t.click('native-game-menu-close'))
    await delay(250)
    if (process.argv.includes('--surfaces')) {
      await all(t => t.click('native-game-hud-menu'))
      await all(t => t.click('native-game-menu-save'))
      await delay(1000)
      await capture('save-panel')
      await all(t => t.click('native-save-load-close'))
      await all(t => t.click('native-game-hud-log'))
      await delay(1000)
      await capture('backlog-panel')
      await all(t => t.click('backlog-close'))
      await all(t => t.click('native-game-hud-menu'))
      await all(t => t.click('native-game-menu-settings'))
      await delay(1000)
      await capture('settings-panel')
      await all(t => t.click('settings-close'))
      await all(t => t.click('native-game-hud-menu'))
      await all(t => t.click('native-game-menu-title-action'))
      await all(t => t.click('native-title-confirm-confirm'))
      await all(t => t.click('native-main-menu-story-tree'))
      await delay(1000)
      await capture('chapter-panel')
      await all(t => t.click('prologue-arrival'))
      for (let pending = 0; pending < 300; pending++) {
        const states = await all(t => t.observe())
        if (states.every(s => !s.background?.preparationId) && states.slice(1).every(s => JSON.stringify(identity(s)) === JSON.stringify(identity(states[0]))))
          break
        await delay(100)
      }
      await capture('chapter-jump')
      report.surfaceNotes = 'Saved-slot contents, reader preferences and chapter unlock labels reflect each durable profile. Compare shared panel geometry and presentation separately from those legitimate data differences.'
    }
  }

  const firstChoices = ['listen-first', 'verify-audio', 'tell-now', 'investigate-station', 'continue-inquiry', 'external-preservation']
  const slots = new Map()
  const slotStates = new Map()
  let resumedPrimary
  if (resume) {
    const primary = report.routes.find(r => r.name === 'primary')
    assert(primary?.history.length, 'Missing verified primary history')
    let checkpointIndex = -1
    for (const id of firstChoices) {
      const index = primary.history.findIndex(s => s.choices.some(c => c.id === id))
      if (index < 0)
        break
      const slot = `slot-${slots.size + 1}`
      slots.set(id, slot)
      slotStates.set(slot, primary.history[index])
      checkpointIndex = index
    }
    if (!primary.digest) {
      assert(checkpointIndex >= 0, 'No saved checkpoint; run a fresh test')
      const id = firstChoices[slots.size - 1]
      await loadSlot(slots.get(id))
      primary.history = primary.history.slice(0, checkpointIndex)
      primary.nodes = primary.history.length
      resumedPrimary = primary
      report.comparisons = report.comparisons.filter(c => !c.name.startsWith('primary-node-') || Number(c.name.slice('primary-node-'.length)) < checkpointIndex)
      Object.assign(report.resumptions.at(-1), { checkpoint: slots.get(id), verifiedPrefixNodes: checkpointIndex, replay: 'All remaining nodes replayed using real input from the durable checkpoint' })
    }
  }
  if (!resume || resumedPrimary)
    await play('primary', firstChoices, { saveChoices: true, max: process.argv.includes('--quick') ? 12 : 6000, resumeRoute: resumedPrimary })
  if (!process.argv.includes('--quick')) {
    // Check the other result of every choice from real saved checkpoints. The
    // last two branches continue through their distinct endings.
    for (const [index, id] of ['catalog-first', 'verify-notice', 'admit-fear', 'investigate-office', 'early-handoff', 'formal-followup'].entries()) {
      const name = `alternate-${id}`
      const previous = report.routes.find(r => r.name === name)
      if (previous?.digest)
        continue
      if (previous) {
        report.routes = report.routes.filter(r => r !== previous)
        report.comparisons = report.comparisons.filter(c => !c.name.startsWith(`${name}-node-`))
      }
      await loadSlot(slots.get(firstChoices[index]))
      await all(t => choose(t, id))
      await delay(100)
      await play(name, firstChoices, { stopAtChoice: index < 4, max: 6000 })
    }
  }
  assert.deepEqual(report.errors, [], 'Runtime errors invalidate parity')
  const nativeErrors = native.logs.filter(log => log.type === 'error')
  assert.equal(nativeErrors.length, 0, 'Native runtime errors invalidate parity')
  report.status = process.argv.includes('--surfaces') ? 'surfaces-and-smoke-passed' : process.argv.includes('--quick') ? 'smoke-only' : 'story-and-layout-passed'
  report.unverified = ['OS-level macOS mouse/keyboard automation', 'physical window resizing', 'subjective audio output', 'gallery and achievement content: current demo has empty catalogs']
  async function all(fn) {
    return Promise.all(targets.map(fn))
  }
  async function startStory() {
    const before = await all(t => t.observe())
    await all(t => t.click('native-main-menu-start'))
    for (let pending = 0; pending < 600; pending++) {
      const states = await all(t => t.observe())
      if (states.every((s, index) => s.screen === 'game' && s.revision !== before[index].revision && s.text && !s.background?.preparationId))
        return
      await delay(100)
    }
    throw new Error('Opening script did not finish preparing on all targets')
  }
  async function settledObservations() {
    let states
    for (let pending = 0; pending < 300; pending++) {
      states = await all(t => t.observe())
      if (states.every(s => !s.background?.preparationId) && states.slice(1).every(s => JSON.stringify(identity(s)) === JSON.stringify(identity(states[0]))))
        return states
      await delay(100)
    }
    report.failedObservations = states.map((state, index) => ({ target: targets[index].name, state }))
    throw new Error('Three-target narrative/asset projections did not converge after preparation')
  }
  async function capture(name) {
    await delay(300)
    await settledObservations()
    let snapshots
    for (let pending = 0; pending < 150; pending++) {
      snapshots = await all(t => t.inspect())
      const required = snapshots[0].nodes.filter(n => n.id && n.bounds.width && n.bounds.height)
      if (snapshots.slice(1).every(s => required.every(n => s.nodes.some(c => c.name === n.id && c.active && c.actual))))
        break
      await delay(200)
    }
    const observations = await settledObservations()
    const canonical = identity(observations[0])
    for (const state of observations.slice(1)) assert.deepEqual(identity(state), canonical, `Narrative/asset mismatch at ${name}`)
    const geometry = []
    const webNodes = snapshots[0].nodes
    for (let i = 1; i < snapshots.length; i++) {
      const s = snapshots[i]
      const l = s.layout
      for (const node of webNodes.filter(n => n.id && n.bounds.width && n.bounds.height)) {
        const counterpart = s.nodes.find(n => n.name === node.id && n.active)
        assert(counterpart?.actual, `Missing visible control ${node.id} in ${targets[i].name} at ${name}`)
        const b = counterpart.actual
        const actual = { x: (b.x - l.viewportX) / l.scale, y: (l.containerHeight - b.y - b.height - l.viewportY) / l.scale, width: b.width / l.scale, height: b.height / l.scale }
        const error = Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(actual[key] - node.bounds[key])))
        geometry.push({ target: targets[i].name, id: node.id, error, web: node.bounds, actual })
      }
    }
    const images = []
    for (const [i, t] of targets.entries()) {
      const path = resolve(output, `${name}-${t.name}.png`)
      await t.capture(path)
      let processor = sharp(path)
      if (t.name === 'mac') {
        const l = snapshots[i].layout
        processor = processor.extract({ left: Math.round(l.viewportX), top: Math.round(l.viewportY), width: Math.round(l.viewportWidth), height: Math.round(l.viewportHeight) })
      }
      images.push(await processor.resize(1920, 1080).png().toBuffer())
    }
    await sharp({ create: { width: 5760, height: 1080, channels: 4, background: '#000' } }).composite(images.map((input, index) => ({ input, left: index * 1920, top: 0 }))).png().toFile(resolve(output, `${name}-compare.png`))
    const coarse = await Promise.all(images.map(input => sharp(input).resize(240, 135).removeAlpha().raw().toBuffer()))
    const imageDifference = coarse.slice(1).map((data, i) => {
      let total = 0
      for (let k = 0; k < data.length; k++) total += Math.abs(data[k] - coarse[0][k])
      return { target: targets[i + 1].name, meanRgbDifference: total / data.length, interpretation: '0..255 RGB difference after downsampling; inspect contact sheet, not an automatic visual acceptance' }
    })
    report.comparisons.push({ name, identity: canonical, geometry, imageDifference, maximumLayoutError: Math.max(0, ...geometry.map(g => g.error)) })
    await writeFile(resolve(output, `${name}-projections.json`), JSON.stringify(snapshots, null, 2))
    assert(geometry.length > 0, `No comparable layout measurements at ${name}`)
    assert(geometry.every(g => g.error <= 2), `Layout exceeds 2 logical units at ${name}: ${JSON.stringify(geometry.filter(g => g.error > 2).slice(0, 5))}`)
    await persist()
  }
  async function saveSlot(slot) {
    slotStates.set(slot, identity(await targets[0].observe()))
    await all(t => t.click('native-game-hud-menu'))
    await all(t => t.click('native-game-menu-save'))
    await all(t => t.click(slot))
    await delay(400)
    for (const t of targets) {
      if ((await t.observe()).screen === 'save-confirm')
        await t.click('native-save-confirm-accept')
    }
    await delay(500)
    await all(t => t.click('native-save-load-close'))
    await delay(250)
  }
  async function loadSlot(slot) {
    assert(slot, 'Missing saved choice checkpoint')
    for (const t of targets) {
      const s = await t.observe()
      if (s.screen === 'game-over') {
        await t.click('native-game-over-title-action')
        for (let pending = 0; pending < 300 && (await t.observe()).screen !== 'title'; pending++) await delay(100)
        assert.equal((await t.observe()).screen, 'title', `${t.name} did not finish saving and returning from the ending`)
      }
      const screen = (await t.observe()).screen
      if (screen === 'title') {
        await t.click('native-main-menu-load')
      }
      else {
        await t.click('native-game-hud-menu')
        await t.click('native-game-menu-load')
      }
      await t.click(slot)
    }
    const expected = slotStates.get(slot)
    for (let pending = 0; pending < 300; pending++) {
      const states = await all(t => t.observe())
      if (states.every(s => s.screen === 'game' && JSON.stringify(identity(s)) === JSON.stringify(expected)))
        return
      await delay(100)
    }
    throw new Error(`Saved choice checkpoint did not restore on all targets: ${slot}`)
  }
  async function choose(t, id) {
    const before = await t.observe()
    if (t.name === 'web')
      await t.page.locator(`[data-choice-id="${id}"]`).click()
    else await t.click(`choice-${id}`)
    for (let pending = 0; pending < 300; pending++) {
      const next = await t.observe()
      if (!next.choices.length && (next.revision !== before.revision || next.story.status === 'ended')) {
        await delay(150)
        return
      }
      await delay(100)
    }
    throw new Error(`${t.name} choice outcome did not prepare: ${id}`)
  }
  async function play(name, preferred, { saveChoices = false, stopAtChoice = false, max, resumeRoute }) {
    const history = resumeRoute?.history || []
    const seenNodes = new Set()
    const seenCast = new Set()
    const seenLighting = new Set()
    const route = resumeRoute || { name, nodes: 0, history }
    if (!resumeRoute)
      report.routes.push(route)
    let ending
    for (let index = history.length; index < max; index++) {
      const states = await settledObservations()
      for (const state of states.slice(1)) assert.deepEqual(identity(state), identity(states[0]), `Story parity ${name} step ${index}`)
      const state = states[0]
      const entry = identity(state)
      history.push(entry)
      route.nodes = history.length
      if (state.story.status === 'ended') {
        ending = state.story.ending
        await capture(`ending-${ending}`)
        break
      }
      if (state.choices.length) {
        if (stopAtChoice)
          break
        const id = preferred.find(id => state.choices.some(choice => choice.id === id))
        assert(id, 'Uncovered choice group')
        if (saveChoices && !slots.has(id)) {
          const slot = `slot-${slots.size + 1}`
          slots.set(id, slot)
          await saveSlot(slot)
          await capture(`choice-${id}`)
        }
        await all(t => choose(t, id))
        await delay(150)
      }
      else {
        const node = state.point?.nodeId
        const cast = state.characters.map(c => `${c.id}:${c.expression}`).join(',')
        const lighting = JSON.stringify(state.background?.characterLighting)
        if ((node && !seenNodes.has(node)) || (cast && !seenCast.has(cast)) || (lighting && !seenLighting.has(lighting))) {
          seenNodes.add(node)
          seenCast.add(cast)
          seenLighting.add(lighting)
          if (index === 0 || node !== history.at(-2)?.point?.nodeId || (seenLighting.size <= 3 && lighting !== 'undefined')) {
            // Complete reveal using actual input, then retain this exact node.
            await all(t => reveal(t, state))
            await capture(`${name}-node-${index}`)
          }
        }
        await all(async (t) => {
          const before = await t.observe()
          for (let attempt = 0; attempt < 100; attempt++) {
            await t.key()
            await delay(150)
            if (progressSignature(await t.observe()) !== progressSignature(before)) {
              // A script point is published before awaited transition/entrance
              // decorators. Do not send another key while that line is preparing.
              for (let pending = 0; pending < 300; pending++) {
                const next = await t.observe()
                if (next.revision !== before.revision || next.choices.length || next.story.status === 'ended') {
                  await delay(150)
                  return
                }
                await delay(100)
              }
              throw new Error(`${t.name} line preparation stalled at ${(await t.observe()).point?.stepId}`)
            }
          }
          throw new Error(`${t.name} story input stalled at ${before.point?.stepId}`)
        })
        await delay(50)
      }
      if (index % 100 === 0) {
        const heap = await native.heapUsage()
        ;(report.nativeHeapSamples ||= []).push({ route: name, node: index, ...heap })
        process.stdout.write(`${name}: ${index} dialogue/choice nodes, ${state.point?.chapterId || ''}, native heap ${Math.round(heap.usedSize / 1048576)} MiB\n`)
        await persist()
      }
      if (index === max - 1 && !process.argv.includes('--quick'))
        throw new Error(`${name} exceeded story limit`)
    }
    Object.assign(route, { ending, digest: createHash('sha256').update(JSON.stringify(history)).digest('hex') })
    await persist()
  }
  async function reveal(t, state) {
    // Wait for the existing line to finish; never use engine mutation to reveal.
    const length = typeof state.text === 'string' ? state.text.length : JSON.stringify(state.text).length
    await delay(Math.min(12000, Math.max(500, length / 36 * 1000 + 100)))
  }
}
catch (error) {
  report.status = 'failed'
  report.error = error.stack
  throw error
}
finally {
  await persist()
  native?.close()
  let closeTimer
  const browsersClosed = await Promise.race([
    Promise.all(browsers.map(b => b.close())).then(() => true),
    new Promise(resolve => closeTimer = setTimeout(resolve, 10000, false)),
  ])
  clearTimeout(closeTimer)
  await Promise.all(servers.map((server) => {
    server.closeAllConnections()
    return new Promise(r => server.close(r))
  }))
  if (!browsersClosed) {
    // Playwright can leave its close transport pending after Chrome has exited.
    // Never force the runner to exit while one of its QA profiles is still live.
    const processes = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' })
    const profiles = ['web', 'creator'].map(name => `--user-data-dir=${resolve(profileRoot, name)}`)
    assert(!processes.split('\n').some(command => profiles.some(profile => command.includes(profile))), 'QA browser still alive after close timeout')
    report.cleanup = { browserTransportTimedOut: true, ownedBrowserProcessesRemaining: 0, temporaryServersClosed: true }
    await persist()
    process.exit(report.status === 'failed' ? 1 : 0)
  }
}
async function persist() {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>QuaEngine Cocos parity</title><style>body{font-family:system-ui;margin:24px;background:#f5f3eb;color:#29453f}img{width:100%;height:auto}section{margin-bottom:32px}</style><h1>Web · Creator · macOS</h1><p>Status: ${report.status}</p><p>macOS images are GPU captures. This runner tests native input bindings. Actual OS mouse, keyboard and window proof is recorded separately in the parent review/os-input-review.json.</p>${report.comparisons.map(c => `<section><h2>${c.name}</h2><p>Maximum layout error: ${c.maximumLayoutError.toFixed(3)} logical units</p><img src="${c.name}-compare.png"></section>`).join('')}<a href="report.json">Complete evidence and coverage</a>`)
}

function readStoryObservation() {
  const debug = globalThis.__QUA_DEMO_REVIEW__ || globalThis.__QUA_COCOS__
  const view = debug.view()
  return { point: debug.point?.(), text: view.dialogue.text, speaker: view.dialogue.speaker ?? view.dialogue.characterName, revision: view.dialogue.revision, choices: view.choices.map(c => ({ id: c.id, text: c.text, enabled: c.enabled })), background: view.background, characters: view.characters.map(c => ({ id: c.id, expression: c.expression, visible: c.visible, position: c.position, assetName: c.assetName })), story: view.plugins['demo-story'], screen: debug.diagnostics?.().screen || document.querySelector('.game-root')?.dataset.screen }
}
function identity(state) {
  if (state.screen === 'title')
    return { screen: 'title' }
  const { point, text, speaker, choices, background, characters, story } = state
  return JSON.parse(JSON.stringify({ point, text, speaker, choices, background, characters: characters.filter(c => c.visible), story }, (key, value) => ['startedAt', 'createdAt', 'updatedAt', 'revision', 'timestamp'].includes(key) ? undefined : value))
}
function progressSignature(state) {
  return JSON.stringify([state.point?.stepId, state.text, state.choices, state.story.status])
}
function readWebSnapshot() {
  const stage = document.querySelector('.qua-stage').getBoundingClientRect()
  const scale = stage.width / 1920
  const bounds = (element) => {
    const b = element.getBoundingClientRect()
    return { x: (b.x - stage.x) / scale, y: (b.y - stage.y) / scale, width: b.width / scale, height: b.height / scale }
  }
  const nodes = [...document.querySelectorAll('[data-qui-id]')].map(element => ({ id: element.dataset.quiId, bounds: bounds(element), text: element.textContent }))
  for (const [selector, id] of [['.qua-dialogue-box', 'demo-dialogue-box'], ['.qua-dialogue-text', 'demo-dialogue-text'], ['.qua-dialogue-speaker', 'demo-dialogue-speaker']]) {
    const element = document.querySelector(selector)
    if (element)
      nodes.push({ id, bounds: bounds(element), text: element.textContent })
  }
  for (const element of document.querySelectorAll('[data-choice-id]')) nodes.push({ id: `choice-${element.dataset.choiceId}`, bounds: bounds(element), text: element.textContent })
  for (const element of document.querySelectorAll('.qua-character[data-character-visible="true"]')) nodes.push({ id: element.dataset.characterId, bounds: bounds(element) })
  return { nodes, view: globalThis.__QUA_DEMO_REVIEW__.view() }
}
