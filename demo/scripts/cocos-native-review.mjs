import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readCocosSnapshot } from './cocos-observations.mjs'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
export const clickNativeId = (client, id) => dispatchNativeNode(client, id)
export const scrollNativeId = (client, id, wheelDeltaY = -1) => dispatchNativeNode(client, id, wheelDeltaY)
async function dispatchNativeNode(client, id, wheelDeltaY) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const clicked = await client.evaluate(`(async()=>{
      const sdk=await System.import('cc'), host=globalThis.__QUA_COCOS__.host.nodes;
      function find(n){if(n.name===${JSON.stringify(id)})return n; for(const child of host.getNodeChildren(n)){const result=find(child);if(result)return result}}
      const node=find(host.getRootNode()); if(!node||!node.native.activeInHierarchy)return false;
      const ui=node.native.getComponent(sdk.UITransform), p=node.native.worldPosition, s=node.native.worldScale;
      const frame=sdk.view.getFrameSize(), visible=sdk.view.getVisibleSize();
      const camera=host.getRootNode().native.getComponent(sdk.Canvas).cameraComponent.node.worldPosition;
      const e={x:(p.x-camera.x+visible.width/2+(0.5-ui.anchorX)*ui.width*s.x)*frame.width/visible.width,y:(visible.height/2+camera.y-p.y-(0.5-ui.anchorY)*ui.height*s.y)*frame.height/visible.height,button:0,windowId:1};
      if (${wheelDeltaY !== undefined}) {
        sdk.input._dispatchMouseScrollEvent({...e,wheelDeltaX:0,wheelDeltaY:${wheelDeltaY ?? 0}});
      } else {
        sdk.input._dispatchMouseDownEvent(e); sdk.input._dispatchMouseUpEvent(e);
      }
      for(let frame=0;frame<2;frame++)await new Promise(resolve=>sdk.director.once(sdk.Director.EVENT_AFTER_UPDATE,resolve));
      return true;
    })()`)
    if (clicked) {
      await delay(250)
      return
    }
    await delay(100)
  }
  throw new Error(`Native rendered control not found: ${id}`)
}
export async function pressNativeKey(client, keyCode = 32, waitMs = 200) {
  await client.evaluate(`(async()=>{
    const sdk=await System.import('cc');
    const e={keyCode:${keyCode},windowId:1};
    sdk.input._dispatchKeyboardDownEvent(e);sdk.input._dispatchKeyboardUpEvent(e);
    // JSB input is queued until Director's frame dispatch. Wait for that
    // frame and the following update before polling or retrying this key.
    for(let frame=0;frame<2;frame++)await new Promise(resolve=>sdk.director.once(sdk.Director.EVENT_AFTER_UPDATE,resolve));
  })()`)
  await delay(waitMs)
}
export const inspectNative = client => client.evaluate(`(${readCocosSnapshot.toString()})()`)
async function waitForDialogue(client, text) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const state = await inspectNative(client)
    if (state.view.dialogue.text === text && !state.view.background?.preparationId)
      return
    await delay(100)
  }
  throw new Error(`Native load did not restore the saved dialogue: ${text}`)
}
export async function captureNative(client, path) {
  const bytes = await client.evaluate(`(async () => Array.from((await globalThis.__QUA_COCOS__.host.capture.captureNode(globalThis.__QUA_COCOS__.host.nodes.getRootNode(), { maxWidth:1920, maxHeight:1080 })).bytes))()`)
  await writeFile(path, new Uint8Array(bytes))
}

export async function connectCocosNative() {
  const [target] = await (await fetch(process.env.QUA_COCOS_NATIVE_DEBUG_URL || 'http://127.0.0.1:6086/json')).json()
  if (!target)
    throw new Error('Cocos native debugger has no application')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let serial = 0
  const pending = new Map()
  const logs = []
  const rejectPending = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Cocos native debugger disconnected'))
    }
    pending.clear()
  }
  socket.addEventListener('close', rejectPending)
  socket.addEventListener('error', rejectPending)
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.consoleAPICalled')
      logs.push(message.params)
    const request = pending.get(message.id)
    if (request) {
      pending.delete(message.id)
      clearTimeout(request.timer)
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
    }
  })
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Cocos native debugger is not connected'))
        return
      }
      const id = ++serial
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, 30000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  await send('Runtime.enable')
  return {
    logs,
    heapUsage: () => send('Runtime.getHeapUsage'),
    async evaluate(expression) {
      const objectGroup = `qua-review-${serial + 1}`
      let failed = false
      try {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, objectGroup })
        if (result.exceptionDetails)
          throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
        return result.result.value
      }
      catch (error) {
        failed = true
        throw error
      }
      finally {
        await send('Runtime.releaseObjectGroup', { objectGroup }).catch((error) => {
          if (!failed)
            throw error
        })
      }
    },
    close() {
      socket.close()
    },
  }
}

if (process.argv[1]?.endsWith('/cocos-native-review.mjs')) {
  const client = await connectCocosNative()
  const output = resolve(process.env.QUA_COCOS_REVIEW || new URL('../dist/cocos/review', import.meta.url).pathname)
  await mkdir(output, { recursive: true })
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await client.evaluate('!!globalThis.__QUA_COCOS__'))
        break
      if (client.logs.some(log => log.type === 'error'))
        break
      await new Promise(r => setTimeout(r, 100))
    }
    const state = await client.evaluate(`JSON.stringify({ready: !!globalThis.__QUA_COCOS__, diagnostics:globalThis.__QUA_COCOS__?.diagnostics(), size:cc.view.getVisibleSize(), frame:cc.view.getFrameSize(), scene: cc.director.getScene()?.name})`)
    process.stdout.write(`${state}\n`)
    await writeFile(resolve(output, 'mac-runtime.json'), JSON.stringify({ state: JSON.parse(state), logs: client.logs }, null, 2))
    if (!JSON.parse(state).ready)
      throw new Error('Native Cocos demo did not boot; inspect mac-runtime.json')
    if (process.argv.includes('--restart-check')) {
      const baseline = JSON.parse(await readFile(resolve(output, 'cocos-mac-review.json'), 'utf8'))
      assert.equal((await inspectNative(client)).diagnostics.screen, 'title')
      await clickNativeId(client, 'native-main-menu-load')
      await clickNativeId(client, 'slot-8')
      await waitForDialogue(client, baseline.screens.save.view.dialogue.text)
      const restored = await inspectNative(client)
      assert.deepEqual(restored.view.dialogue.text, baseline.screens.save.view.dialogue.text)
      await clickNativeId(client, 'native-game-hud-menu')
      await clickNativeId(client, 'native-game-menu-settings')
      await delay(800)
      const settings = await inspectNative(client)
      const selected = s => s.nodes.find(n => n.name === 'settings-field--quajs-plugin-settings-skipMode-select')?.metadata.quiControl.selectedIndex
      assert.equal(selected(settings), selected(baseline.screens.settings), 'Settings survive process restart')
      await clickNativeId(client, 'settings-close')
      assert(!client.logs.some(log => log.type === 'error'), 'Native restart errors')
      await captureNative(client, resolve(output, 'cocos-mac-restarted.png'))
      await writeFile(resolve(output, 'cocos-mac-restart.json'), JSON.stringify({ status: 'restart-save-settings-passed', inputEvidence: 'native input binding', restored, settings, logs: client.logs }, null, 2))
      process.stdout.write('Native save restored after actual process restart\n')
    }
    else {
      const report = { target: 'cocos-mac', inputEvidence: 'Creator native input binding; no OS pointer automation', screens: {}, checks: [], logs: client.logs }
      const snapshot = async (name) => {
        await delay(1200)
        report.screens[name] = await inspectNative(client)
        await captureNative(client, resolve(output, `cocos-mac-${name}.png`))
        assert(!report.screens[name].diagnostics.error, report.screens[name].diagnostics.error)
      }
      try {
        await snapshot('title')
        await clickNativeId(client, 'native-main-menu-start')
        for (let attempt = 0; attempt < 300; attempt++) {
          const state = await inspectNative(client)
          if (state.view.dialogue.visible && state.view.dialogue.text && !state.view.background?.preparationId)
            break
          await delay(100)
        }
        await snapshot('story')
        assert.equal(report.screens.story.diagnostics.screen, 'game')
        const before = report.screens.story.view.dialogue.text
        assert(before, 'Opening dialogue must be prepared before saving')
        await clickNativeId(client, 'native-game-hud-menu')
        await snapshot('menu')
        await clickNativeId(client, 'native-game-menu-save')
        await clickNativeId(client, 'slot-8')
        if ((await inspectNative(client)).diagnostics.screen === 'save-confirm')
          await clickNativeId(client, 'native-save-confirm-accept')
        await snapshot('save')
        assert.notEqual(report.screens.save.nodes.find(n => n.name === 'slot-8-name')?.text, '空存档')
        await clickNativeId(client, 'slot-8')
        assert.equal((await inspectNative(client)).diagnostics.screen, 'save-confirm')
        await clickNativeId(client, 'native-save-confirm-accept')
        await delay(1000)
        await clickNativeId(client, 'native-save-load-close')
        await pressNativeKey(client)
        await pressNativeKey(client)
        assert.notDeepEqual((await inspectNative(client)).view.dialogue.text, before)
        await clickNativeId(client, 'native-game-hud-menu')
        await clickNativeId(client, 'native-game-menu-load')
        await clickNativeId(client, 'slot-8')
        await waitForDialogue(client, before)
        await snapshot('restored')
        assert.deepEqual(report.screens.restored.view.dialogue.text, before)
        await clickNativeId(client, 'native-game-hud-log')
        await snapshot('backlog')
        assert(report.screens.backlog.nodes.some(n => n.name === 'backlog-panel'))
        await clickNativeId(client, 'backlog-close')
        await clickNativeId(client, 'native-game-hud-screenshot')
        assert.equal((await inspectNative(client)).view.ui.visible, false)
        await pressNativeKey(client, 72)
        assert.equal((await inspectNative(client)).view.ui.visible, true)
        await clickNativeId(client, 'native-game-hud-menu')
        await clickNativeId(client, 'native-game-menu-settings')
        await delay(800)
        const initialSettings = await inspectNative(client)
        const skipControl = s => s.nodes.find(n => n.name === 'settings-field--quajs-plugin-settings-skipMode-select')?.metadata.quiControl.selectedIndex
        await clickNativeId(client, 'settings-field--quajs-plugin-settings-skipMode-select')
        await snapshot('settings')
        assert.notEqual(skipControl(report.screens.settings), skipControl(initialSettings), 'Actual settings control changes the preference')
        assert(report.screens.settings.nodes.some(n => n.name === 'settings-panel'))
        await clickNativeId(client, 'settings-close')
        assert(!client.logs.some(log => log.type === 'error'), 'Native runtime errors')
        report.status = 'interaction-passed'
        report.checks = ['standalone native boot', 'native input start', 'save', 'overwrite', 'keyboard advance', 'load', 'backlog', 'screenshot mode', 'settings control mutation']
      }
      catch (error) {
        report.status = 'failed'
        report.error = error.stack
        throw error
      }
      finally {
        await writeFile(resolve(output, 'cocos-mac-review.json'), JSON.stringify(report, null, 2))
      }
    }
  }
  finally {
    client.close()
  }
}
