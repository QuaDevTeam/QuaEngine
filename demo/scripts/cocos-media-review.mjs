import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { captureNative, connectCocosNative } from './cocos-native-review.mjs'
import { createCocosArtifactServer } from './cocos-static-server.mjs'

const output = resolve(process.env.QUA_COCOS_MEDIA_REVIEW || 'dist/cocos/review/media')
const workspace = resolve(process.env.QUA_COCOS_WORKSPACE || 'dist/cocos/workspace')
const profileRoot = resolve('.generated/cocos-media-profiles')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = { status: 'running', checks: [], gaps: [], errors: [], samples: {}, evidence: 'Shared demo plugin commands, real WebAudio/Creator SDK and macOS PCM processing, device clocks, decoded color-bar pixel checks, DOM/Creator transforms and browser/GPU frames. No subjective listening or OS audio recording.' }
const servers = []
const browsers = []
const targets = []
let native
await mkdir(output, { recursive: true })
report.artifact = { workspace, runtimeSha256: createHash('sha256').update(await readFile(resolve(workspace, 'assets/qua-runtime/runtime.js'))).digest('hex'), targetManifest: JSON.parse(await readFile(resolve(workspace, 'target-bundle-manifest.json'))) }
try {
  for (const [name, artifact] of [['web', resolve('dist')], ['creator', resolve(workspace, 'build/web-desktop')]]) {
    console.warn(`Media review: boot ${name}`)
    const server = createCocosArtifactServer(artifact)
    await new Promise((done, reject) => {
      server.once('error', reject)
      server.listen(46201 + targets.length, '127.0.0.1', done)
    })
    servers.push(server)
    const browser = await chromium.launchPersistentContext(resolve(profileRoot, name), { channel: 'chrome', viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, args: ['--no-proxy-server'] })
    browsers.push(browser)
    const page = browser.pages()[0]
    const cdp = await browser.newCDPSession(page)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    page.on('pageerror', error => report.errors.push({ target: name, message: error.message }))
    page.on('console', (msg) => {
      if (msg.type() === 'error')
        report.errors.push({ target: name, message: msg.text() })
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => (globalThis.__QUA_DEMO_REVIEW__ || globalThis.__QUA_COCOS__)?.media, null, { timeout: 60000 })
    // A real gesture unlocks browser audio. No autoplay exemption switches.
    await page.mouse.click(940, 20)
    targets.push({ name, page, evaluate: fn => page.evaluate(fn), command: (action, value) => page.evaluate(([a, v]) => (globalThis.__QUA_DEMO_REVIEW__ || globalThis.__QUA_COCOS__).media.command(a, v), [action, value]), capture: path => page.screenshot({ path }) })
  }
  native = await connectCocosNative()
  console.warn('Media review: connected macOS')
  assert(await native.evaluate('!!globalThis.__QUA_COCOS__?.media'), 'Launch the newly built macOS application with the shared media review entry')
  targets.push({ name: 'mac', evaluate: fn => native.evaluate(`(${fn.toString()})()`), command: (action, value) => native.evaluate(`globalThis.__QUA_COCOS__.media.command(${JSON.stringify(action)},${value === undefined ? 'undefined' : JSON.stringify(value)})`), capture: path => captureNative(native, path) })
  await all(t => t.command('prepare'))
  console.warn('Media review: prepared all targets')
  await wait(300)
  await all(t => t.command('channels'))
  await eventually(async () => (await samples()).every(s => ['qa-bgm', 'qa-ambient', 'qa-voice', 'qa-sfx'].every(id => s.audio.some(h => audioId(h, id) && h.playing))), 'All four channels actually start')
  await record('channels-start')
  await wait(700)
  await record('channels-playing')
  const events = await all(t => t.evaluate(readMedia))
  assert(events.every(s => ended(s, 'qa-sfx').length === 1), 'SFX reports ended exactly once')
  check('BGM / ambient / voice / SFX playback and SFX ended')
  await all(t => t.command('pause'))
  await wait(150)
  const paused = await record('paused')
  await wait(600)
  const held = await record('pause-held')
  paused.forEach((s, i) => assert(Math.abs(track(s, 'qa-bgm').positionMs - track(held[i], 'qa-bgm').positionMs) < 70, `${targets[i].name} paused device clock drift`))
  await all(t => t.command('gain', -18))
  await wait(150)
  const adjusted = await record('gain-while-paused')
  adjusted.forEach((s, i) => {
    assert(Math.abs(track(s, 'qa-bgm').positionMs - track(held[i], 'qa-bgm').positionMs) < 70, `${targets[i].name} gain change restarted paused playback`)
    // Track -12 dB plus bus -18 dB, with master at 0 dB.
    assert(Math.abs(track(s, 'qa-bgm').gain - 10 ** (-30 / 20)) < 0.005, `${targets[i].name} actual effective gain`)
  })
  check('Pause holds the device clock; bus gain changes preserve playback')
  await all(t => t.command('resume'))
  await wait(300)
  const resumed = await record('resumed')
  resumed.forEach((s, i) => assert(track(s, 'qa-bgm').positionMs > track(adjusted[i], 'qa-bgm').positionMs + 150, `${targets[i].name} resume`))
  resumed.forEach((s, i) => assert(Math.abs(track(s, 'qa-bgm').gain - 10 ** (-30 / 20)) < 0.003, `${targets[i].name} resume must preserve gain without replaying the fade-in`))
  await all(t => t.command('seek', 1800))
  await wait(160)
  const sought = await record('seek-1800')
  sought.forEach((s, i) => assert(track(s, 'qa-bgm').positionMs >= 1800 && track(s, 'qa-bgm').positionMs < 2400, `${targets[i].name} seek must use device playback clock`))
  sought.forEach((s, i) => assert(Math.abs(track(s, 'qa-bgm').gain - 10 ** (-30 / 20)) < 0.003, `${targets[i].name} seek must preserve gain`))
  await wait(1250)
  const looped = await record('looped')
  looped.forEach((s, i) => assert(track(s, 'qa-bgm').playing && track(s, 'qa-bgm').positionMs < 1300, `${targets[i].name} loop wrapped`))
  assert(looped.every(s => ended(s, 'qa-voice').length === 1), 'Voice natural end exactly once')
  check('Resume, seek, loop wrap and voice natural end')
  await all(t => t.command('gain', 18))
  await wait(150)
  const amplified = await record('gain-above-unity')
  amplified.forEach((state, i) => assert(Math.abs(track(state, 'qa-bgm').gain - 10 ** (6 / 20)) < 0.01, `${targets[i].name} actual gain above unity`))
  check('Gain above unity reaches every live audio processor')
  await all(t => t.command('gain', 0))
  await all(t => t.command('crossfade'))
  await wait(130)
  const crossfade = await record('crossfade-mid')
  assert(crossfade.every(s => s.view.plugins.audio.bgmOutgoing.length === 1 && track(s, 'qa-bgm').playing && track(s, 'qa-bgm-next').playing), 'Crossfade must keep both actual native/Web handles')
  await wait(650)
  const faded = await record('crossfade-ended')
  assert(faded.every(s => s.view.plugins.audio.bgmOutgoing.length === 0 && ended(s, 'qa-bgm').length === 1), 'Outgoing BGM clears via exactly one ended intent')
  check('Crossfade keeps two sources, then releases outgoing via pipeline')
  await all(t => t.command('eq'))
  await wait(150)
  const eq = await record('eq')
  eq.forEach((state, i) => assert(track(state, 'qa-bgm-next').eq.some(b => b.type === 'lowpass' && b.frequency === 300), `${targets[i].name} actual lowpass chain`))
  await all(t => t.command('stop'))
  await wait(650)
  const stopped = await record('stopped')
  assert(stopped.every(s => s.audio.every(h => !h.playing)), 'Stop releases all actual sources')
  check('Fade-out stop cleans all playing channels')
  await all(t => t.command('dsp-tone'))
  await wait(350)
  const dry = await record('dsp-dry')
  dry.forEach((s, i) => assert(Math.abs(track(s, 'qa-dsp').pcm.frequency - 440) < 2, `${targets[i].name} rendered dry PCM frequency`))
  await all(t => t.command('gain', 6))
  await wait(350)
  const dspGain = await record('dsp-gain')
  dspGain.forEach((s, i) => assert(Math.abs(track(s, 'qa-dsp').pcm.rms / track(dry[i], 'qa-dsp').pcm.rms - 10 ** (6 / 20)) < 0.06, `${targets[i].name} rendered PCM +6dB amplitude`))
  await all(t => t.command('gain', 0))
  for (let index = 0; index < 8; index++) {
    await all(t => t.command('eq-case', index))
    await wait(350)
    const filtered = await record(`dsp-eq-${index}`)
    const ratios = filtered.map((s, i) => track(s, 'qa-dsp').pcm.rms / track(dry[i], 'qa-dsp').pcm.rms)
    assert(ratios.every(v => Number.isFinite(v) && v > 0), 'EQ actually produces finite PCM')
    ratios.forEach((ratio, i) => assert(Math.abs(ratio / ratios[0] - 1) < 0.04, `${targets[i].name} filter ${index} processed PCM gain differs from Web: ${ratios}`))
    if (index < 2)
      assert(Math.abs(ratios[0] - 1) > 0.05, 'Pass filters must alter the rendered signal')
  }
  check('Eight track/bus/master EQ types produce matching processed PCM (4 percent amplitude tolerance)')
  await all(t => t.command('eq-clear'))
  const rateBefore = await record('rate-before')
  await all(t => t.command('rate', 1.5))
  await wait(300)
  const rateAfter = await record('rate-1.5')
  rateAfter.forEach((s, i) => {
    const h = track(s, 'qa-dsp')
    const old = track(rateBefore[i], 'qa-dsp')
    const delta = (h.positionMs - old.positionMs + 3000) % 3000
    assert(delta > 350 && delta < 950, `${targets[i].name} content clock advances at 1.5x: ${delta}`)
    assert(Math.abs(h.playbackRate - 1.5) < 0.001 && Math.abs(h.pcm.frequency - 660) < 3, `${targets[i].name} source rate changes actual PCM pitch`)
  })
  await all(t => t.command('pause'))
  const rateHeld = await record('rate-paused')
  await all(t => t.command('rate', 0.5))
  await wait(250)
  const rateAdjusted = await record('rate-adjusted-paused')
  rateAdjusted.forEach((s, i) => assert(Math.abs(track(s, 'qa-dsp').positionMs - track(rateHeld[i], 'qa-dsp').positionMs) < 70, `${targets[i].name} paused rate change preserves offset`))
  await all(t => t.command('resume'))
  await wait(300)
  const rateResumed = await record('rate-resumed')
  rateResumed.forEach((s, i) => assert(Math.abs(track(s, 'qa-dsp').pcm.frequency - 220) < 2, `${targets[i].name} resumed half-rate PCM`))
  await all(t => t.command('rate-end'))
  await wait(1900)
  const rateEnded = await record('rate-ended')
  rateEnded.forEach((s, i) => assert(ended(s, 'qa-rate-end').length === 1, `${targets[i].name} accelerated natural end exactly once`))
  check('Live 1.5x rate, held 0.5x update, resume and typed 2x natural ending')
  await all(t => t.command('animation'))
  await all(t => t.command('animation-pause'))
  for (const time of [0, 500, 1000, 1500]) {
    await all(t => t.command('animation-seek', time))
    await wait(160)
    const states = await record(`animation-${time}`)
    const fraction = time / 2000
    const ease = fraction < 0.5 ? 2 * fraction * fraction : 1 - (-2 * fraction + 2) ** 2 / 2
    const expected = { x: 120 + 1080 * ease, y: 240 + 300 * fraction, opacity: 0.4 + 0.6 * fraction, rotation: 30 * fraction }
    for (const [i, s] of states.entries()) {
      assert(s.card, `${targets[i].name} real card node`)
      for (const field of ['x', 'y', 'rotation', 'opacity']) assert(Math.abs(s.card[field] - expected[field]) < (field === 'opacity' ? 0.01 : 2), `${targets[i].name} actual animated ${field} at ${time}: ${s.card[field]} expected ${expected[field]}`)
    }
    await capture(`animation-${time}`)
  }
  const beforeHold = await samples()
  await wait(400)
  const afterHold = await samples()
  assert(beforeHold.every((s, i) => Math.abs(s.card.x - afterHold[i].card.x) < 2), 'Animation remains paused')
  await all(t => t.command('animation-resume'))
  await wait(750)
  const settled = await record('animation-settled')
  assert(settled.every(s => Math.abs(s.card.x - 1200) < 2 && s.view.background.layers.find(l => l.id === 'qa-card').x === 1200), 'Final values persist through owning animation adapter')
  await capture('animation-settled')
  check('Animation easing / position / rotation / opacity, pause / seek / resume and final commit')
  await all(t => t.command('video', 1800))
  await wait(400)
  const videoStart = await record('video-start')
  assert(videoStart[0].video?.currentTime >= 1.8 && videoStart[0].video.currentTime < 2.9, 'Web authored 1800ms video seek must reach the decoded playback clock')
  await capture('video-start')
  await wait(400)
  const videoNext = await record('video-next')
  assert(videoStart[0].video?.readyState >= 2 && !videoStart[0].video.paused, 'Web H.264 must actually decode and play')
  assert(videoNext[0].video.currentTime !== videoStart[0].video.currentTime, 'Web video device clock advances')
  for (const [i, t] of targets.entries()) {
    if (videoNext[i].capabilities?.video === false) {
      assert(videoNext[i].poster, `${t.name} real fallback sprite must be present`)
      report.gaps.push({ target: t.name, capability: 'video', result: 'poster-only', detail: 'No video decoding or moving frames. Real authored poster fallback is drawn; this is a parity failure, not successful video playback.' })
    }
    else {
      assert(videoStart[i].video?.currentTime >= 1.8 && videoStart[i].video.currentTime < 2.9, `${t.name} authored seek reaches the decoder clock`)
      assert(videoNext[i].video?.readyState >= 2 && !videoNext[i].video.paused, `${t.name} H.264 is decoded and playing`)
      assert(videoNext[i].video.currentTime !== videoStart[i].video.currentTime, `${t.name} video device clock advances`)
      if (t.name === 'mac')
        assert(videoNext[i].video.decodedFrames > 1, 'macOS uploads multiple decoded video frames')
    }
  }
  await capture('video-next')
  const wraps = videoNext.map((s, i) => s.capabilities?.video === false || s.video.currentTime < videoStart[i].video.currentTime - 0.1)
  let previousVideo = videoNext
  const loopDeadline = Date.now() + 5000
  const loopSamples = []
  while (!wraps.every(Boolean) && Date.now() < loopDeadline) {
    await wait(100)
    const next = await samples()
    next.forEach((s, i) => {
      if (s.video && previousVideo[i].video && s.video.currentTime < previousVideo[i].video.currentTime - 0.1)
        wraps[i] = true
    })
    loopSamples.push(next.map(s => s.video?.currentTime))
    previousVideo = next
  }
  report.videoLoop = { wraps, clocks: loopSamples }
  assert(wraps.every(Boolean), 'Each supported video decoder wraps its actual clock at EOF')
  const videoLooped = await record('video-looped')
  for (const [i, t] of targets.entries()) {
    if (videoLooped[i].capabilities?.video !== false) {
      assert(videoLooped[i].video.loop && videoLooped[i].video.muted, `${t.name} loop/mute reach the playback backend`)
    }
  }
  check('H.264 authored seek, real decoder clocks and moving frames on declared targets')
  await all(t => t.command('finish'))
  await wait(150)
  assert((await samples()).every(s => !s.video), 'Video components/decoders disappear after background clear')
  assert.deepEqual(report.errors, [], 'Runtime errors invalidate supported-capability validation')
  assert.equal(native.logs.filter(l => l.type === 'error').length, 0, 'Native errors invalidate supported-capability validation')
  report.status = report.gaps.length ? 'supported-capabilities-passed; parity-incomplete' : 'three-target-media-parity-passed'
  if (process.argv.includes('--require-parity'))
    assert.equal(report.gaps.length, 0, 'Unimplemented media capabilities block complete parity acceptance')
}
catch (error) {
  report.status = 'failed'
  report.error = error.stack
  process.exitCode = 1
}
finally {
  native?.close()
  await persist()
  let timer
  const closed = await Promise.race([Promise.all(browsers.map(b => b.close())).then(() => true), new Promise(done => timer = setTimeout(done, 10000, false))])
  clearTimeout(timer)
  await Promise.all(servers.map((s) => {
    s.closeAllConnections()
    return new Promise(done => s.close(done))
  }))
  if (!closed) {
    const processes = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' })
    assert(!processes.split('\n').some(p => ['web', 'creator'].some(n => p.includes(`--user-data-dir=${resolve(profileRoot, n)}`))), 'Owned QA browser remains alive')
    report.cleanup = { browserTransportTimedOut: true, ownedBrowserProcessesRemaining: 0, temporaryServersClosed: true }
    await persist()
    process.exit(process.exitCode || 0)
  }
}
function all(fn) {
  return Promise.all(targets.map(async (target) => {
    let timer
    try {
      return await Promise.race([fn(target), new Promise((_, reject) => timer = setTimeout(() => reject(new Error(`Media review timed out on ${target.name}`)), 25000))])
    }
    finally { clearTimeout(timer) }
  }))
}
function samples() {
  return all(t => t.evaluate(readMedia))
}
function audioId(handle, id) {
  return handle.id === id || handle.id.endsWith(`:${id}`)
}
function track(state, id) {
  const found = state.audio.find(h => audioId(h, id))
  assert(found, `Missing actual audio handle ${id}`)
  return found
}
function ended(state, id) {
  return state.events.filter(e => e.type === 'audio/ended' && e.payload.id === id)
}
function check(name) {
  report.checks.push({ name, status: 'passed' })
  console.warn(name)
}
async function record(name) {
  const states = await samples()
  report.samples[name] = states
  await persist()
  return states
}
async function eventually(predicate, label) {
  for (let i = 0; i < 40; i++) {
    if (await predicate())
      return
    await wait(30)
  }
  throw new Error(label)
}
async function capture(name) {
  const images = []
  for (const t of targets) {
    const path = resolve(output, `${name}-${t.name}.png`)
    await t.capture(path)
    let processor = sharp(path)
    if (t.name === 'mac') {
      const layout = await t.evaluate(() => globalThis.__QUA_COCOS__.renderer.getSnapshot().stageLayout)
      processor = processor.extract({ left: Math.round(layout.viewportX), top: Math.round(layout.viewportY), width: Math.round(layout.viewportWidth), height: Math.round(layout.viewportHeight) })
    }
    const image = await processor.resize(1920, 1080).png().toBuffer()
    if (name.startsWith('video-')) {
      const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const colors = [[255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255]]
      const actual = colors.map((expected, i) => {
        const offset = (270 * info.width + 160 + i * 320) * info.channels
        const pixel = [...data.subarray(offset, offset + 3)]
        assert(pixel.every((value, channel) => Math.abs(value - expected[channel]) < 80), `${t.name} decoded video color bar ${i} is visible: ${pixel}`)
        return pixel
      })
      report.videoPixels ??= {}
      report.videoPixels[name] ??= {}
      report.videoPixels[name][t.name] = actual
      const reference = report.videoPixels[name].web
      const difference = Math.max(...actual.flatMap((pixel, i) => pixel.map((value, channel) => Math.abs(value - reference[i][channel]))))
      report.videoMaximumColorChannelDifference = Math.max(report.videoMaximumColorChannelDifference ?? 0, difference)
      assert(difference <= 5, `${t.name} decoded BT.709 video color differs from Web by ${difference}`)
    }
    images.push(image)
  }
  await sharp({ create: { width: 5760, height: 1080, channels: 4, background: '#000' } }).composite(images.map((input, i) => ({ input, left: i * 1920, top: 0 }))).png().toFile(resolve(output, `${name}-compare.png`))
}
async function persist() {
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(resolve(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Demo media parity</title><style>body{font:16px system-ui;margin:24px}img{width:100%}li{margin:8px 0}</style><h1>Web · Creator · macOS 媒体验证</h1><p>${report.status}</p><p>${report.evidence}</p><ul>${report.checks.map(c => `<li>${c.name}: ${c.status}</li>`).join('')}</ul><h2>未达到一致性的能力</h2><ul>${report.gaps.map(g => `<li>${g.target} / ${g.capability}: ${g.detail}</li>`).join('')}</ul>${['animation-0', 'animation-500', 'animation-1000', 'animation-1500', 'animation-settled', 'video-start', 'video-next'].map(n => `<h2>${n}</h2><img src="${n}-compare.png">`).join('')}<p><a href="report.json">Device clocks, projections and complete evidence</a></p>`)
}

async function readMedia() {
  const debug = globalThis.__QUA_DEMO_REVIEW__ || globalThis.__QUA_COCOS__
  const state = { view: debug.view(), events: debug.media.events() }
  if (globalThis.__QUA_DEMO_REVIEW__) {
    state.audio = debug.audioPlayback().map(h => ({ ...h, playing: h.state === 'playing' }))
    const card = document.querySelector('[data-background-layer-id="qa-card"]')
    if (card) {
      const style = getComputedStyle(card)
      const transform = new DOMMatrix(style.transform)
      state.card = { x: transform.e, y: transform.f, opacity: Number(style.opacity), rotation: Math.atan2(transform.b, transform.a) * 180 / Math.PI, width: Number.parseFloat(style.width), height: Number.parseFloat(style.height), origin: style.transformOrigin }
    }
    const video = document.querySelector('.qua-background--video')
    if (video)
      state.video = { currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, paused: video.paused, loop: video.loop, muted: video.muted, playbackRate: video.playbackRate }
    return state
  }
  const cc = await globalThis.System.import('cc')
  const host = debug.host.nodes
  const root = host.getRootNode()
  state.capabilities = debug.host.capabilities
  state.audio = []
  function nativeWalk(node) {
    if (node.__quaVideo) {
      const v = node.__quaVideo
      state.video = { currentTime: v.positionMs / 1000, duration: v.durationMs / 1000, readyState: v.ready ? 2 : 0, paused: v.rate === 0, decodedFrames: v.decodedFrames, frameMs: v.frameMs, loop: !!v.loop, muted: !!v.muted, playbackRate: v.playbackRate, backend: v.backend }
    }
    const video = cc.VideoPlayer && node.getComponent(cc.VideoPlayer)
    if (video) {
      const actual = video.nativeVideo
      state.video = { currentTime: video.currentTime, duration: video.duration, readyState: actual?.readyState ?? 0, paused: !video.isPlaying, loop: video.loop, muted: video.mute, playbackRate: video.playbackRate, backend: 'creator-videoplayer' }
    }
    if (node.__quaAudio)
      state.audio.push({ id: node.name.replace(/^qua-audio-/, ''), ...node.__quaAudio.inspect() })
    const source = !node.__quaAudio && node.getComponent(cc.AudioSource)
    if (source)
      state.audio.push({ id: node.name.replace(/^qua-audio-/, ''), positionMs: source.currentTime * 1000, durationMs: source.duration * 1000, playing: source.playing, gain: source.volume, loop: source.loop })
    for (const child of node.children) nativeWalk(child)
  }
  nativeWalk(root.native)
  function walk(node) {
    if (node.name === 'qa-card') {
      const ui = node.native.getComponent(cc.UITransform)
      const parent = node.native.parent.getComponent(cc.UITransform)
      state.card = { x: node.native.position.x + parent.anchorX * parent.width - ui.anchorX * ui.width, y: (1 - parent.anchorY) * parent.height - node.native.position.y - (1 - ui.anchorY) * ui.height, width: ui.width, height: ui.height, rotation: -node.native.eulerAngles.z, opacity: node.native.getComponent(cc.UIOpacity)?.opacity / 255, anchorX: ui.anchorX, anchorY: 1 - ui.anchorY }
    }
    if (node.kind === 'video-poster')
      state.poster = { kind: node.kind, actualFrame: !!node.native.children.find(n => n.name === 'qua-sprite')?.getComponent(cc.Sprite)?.spriteFrame }
    for (const child of host.getNodeChildren(node)) walk(child)
  }
  walk(root)
  return state
}
