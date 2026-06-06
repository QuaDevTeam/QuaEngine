import type { AssetData, AssetManifestRecord, BundleManifest } from '@quajs/assets'
import type { QuaViewProjection } from '@quajs/render-core'
import { createFakeCocosHost } from '@quajs/cocos-host/testing'
import { Pipeline } from '@quajs/pipeline'
import { AchievementRenderToLogicEvents } from '@quajs/plugin-achievement/contracts'
import { AudioRenderToLogicEvents } from '@quajs/plugin-audio/contracts'
import { BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import {
  createFlowControlProjection,
  createViewLayoutProjection,
  DEFAULT_OVERLAY_STACK_PRIORITIES,
  DEFAULT_UI_OVERLAY_Z_INDEXES,
  isRichTextDocument,
  LogicToRenderEvents,
  RenderToLogicEvents,
} from '@quajs/render-core'
import { describe, expect, it } from 'vitest'
import { QuaCocosRendererController } from '../src'
import { CocosDialogueTypewriterRuntime } from '../src/dialogue-typewriter'
import { createInputCocosRendererPlugin } from '../src/plugins/input'
import { createVisualNovelCocosRendererPlugins } from '../src/plugins/preset'
import { createSavePreviewCocosRendererPlugin } from '../src/plugins/save-preview'

describe('@quajs/renderer-cocos', () => {
  it('resolves stage layout and cleans transient nodes on destroy', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1280, height: 720 } })
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    expect(renderer.getSnapshot().stageLayout.logicalHeight).toBe(1080)
    expect(host.root.children[0]?.name).toBe('qua-stage')
    expect(host.root.children[0]?.children[0]?.name).toBe('qua-scene')
    expect(host.root.children[0]?.children[0]?.children[0]?.name).toBe('qua-camera')

    await renderer.destroy()
    expect(host.root.children).toHaveLength(0)
  })

  it('emits Cocos destroy timestamps from the host runtime clock', async () => {
    const host = createFakeCocosHost({ now: () => 321 })
    const pipeline = new Pipeline()
    const destroyed: unknown[] = []
    pipeline.on(RenderToLogicEvents.RENDER_DESTROYED, context => destroyed.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })

    await renderer.start()
    await renderer.destroy()

    expect(destroyed).toEqual([{ timestamp: 321 }])
  })

  it('emits logical pointer clicks and choice intents through pipeline', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1920, height: 1080 } })
    const pipeline = new Pipeline()
    const clicks: unknown[] = []
    const choices: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CLICK, context => clicks.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => choices.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540 })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540, metadata: { choiceId: 'a' } })
    const choiceNode = [...host.nodesById.values()].find(node => node.metadata.choiceId === 'a')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: choiceNode! })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: choiceNode!.transform.x! + 1, y: choiceNode!.transform.y! + 1 })

    expect(clicks[0]).toMatchObject({ x: 960, y: 540 })
    expect(choices[0]).toEqual({ choiceId: 'a' })
    expect(choices[1]).toEqual({ choiceId: 'a' })
    expect(choices[2]).toEqual({ choiceId: 'a' })
    expect(advances).toEqual([{ source: 'cocos:pointer' }])
  })

  it('maps Cocos keyboard and gamepad input to renderer commands', async () => {
    const host = createFakeCocosHost({ now: () => 123 })
    const pipeline = new Pipeline()
    const commands: unknown[] = []
    const autoStarts: unknown[] = []
    const choices: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, context => commands.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.FLOW_CONTROL_START_AUTO_REQUEST, context => autoStarts.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => choices.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'KeyA', key: 'a' })
    await host.emitInput({ kind: 'gamepad', phase: 'down', metadata: { button: 0 } })

    expect(commands).toMatchObject([
      {
        command: 'auto:toggle',
        device: 'keyboard',
        source: 'cocos:keyboard:KeyA',
        pressed: true,
        timestamp: 123,
      },
      {
        command: 'choice:confirm',
        device: 'gamepad',
        source: 'cocos:gamepad:button:0',
        pressed: true,
        timestamp: 123,
      },
    ])
    expect(autoStarts).toEqual([{ source: 'cocos:keyboard:KeyA' }])
    expect(choices).toEqual([{ choiceId: 'a' }])
  })

  it('dispatches the first Cocos wheel command when runtime time starts at zero', async () => {
    const host = createFakeCocosHost({ now: () => 0 })
    const pipeline = new Pipeline()
    const commands: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, context => commands.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: [createInputCocosRendererPlugin({
        includeDefaultBindings: false,
        bindings: [{ source: 'wheel', command: 'advance' }],
      })],
    })
    await renderer.start()

    await host.emitInput({ kind: 'pointer', phase: 'wheel', metadata: { deltaY: 1 } })

    expect(commands).toMatchObject([{
      command: 'advance',
      device: 'wheel',
      source: 'cocos:wheel:down',
      timestamp: 0,
    }])
  })

  it('does not render or activate default dialogue and choices for no-default-chrome UI scenes', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const commands: unknown[] = []
    const autoStarts: unknown[] = []
    const choices: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_INPUT_COMMAND, context => commands.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.FLOW_CONTROL_START_AUTO_REQUEST, context => autoStarts.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => choices.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        uiOverlays: {
          menu: {
            open: true,
            scene: {
              id: 'system:menu',
              presentation: 'scene',
              overlay: {
                defaultChrome: false,
              },
            },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    expect(findNodeByKind(host, 'dialogue-box')).toBeUndefined()
    expect([...host.nodesById.values()].some(node => node.metadata.choiceId === 'a')).toBe(false)
    expect(findNode(host, 'qua-ui')?.metadata.defaultChrome).toBe(false)

    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'KeyA', key: 'a' })
    await host.emitInput({ kind: 'gamepad', phase: 'down', metadata: { button: 0 } })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540, metadata: { choiceId: 'a' } })
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540 })

    expect(commands).toMatchObject([
      { command: 'auto:toggle' },
      { command: 'choice:confirm' },
    ])
    expect(autoStarts).toEqual([])
    expect(choices).toEqual([])
    expect(advances).toEqual([])
  })

  it('focuses the first enabled choice on the first next command', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const choices: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CHOICE_SELECT, context => choices.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        choices: [
          { id: 'a', text: 'A', enabled: true },
          { id: 'b', text: 'B', enabled: true },
        ],
      }),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    await host.emitInput({ kind: 'keyboard', phase: 'down', code: 'ArrowDown', key: 'ArrowDown' })
    await host.emitInput({ kind: 'gamepad', phase: 'down', metadata: { button: 0 } })

    expect(choices).toEqual([{ choiceId: 'a' }])
  })

  it('does not advance pointer input captured by UI overlays', async () => {
    const host = createFakeCocosHost({ containerSize: { width: 1920, height: 1080 } })
    const pipeline = new Pipeline()
    const clicks: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_CLICK, context => clicks.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({ uiOverlay: { visible: true } }),
      plugins: createVisualNovelCocosRendererPlugins(),
    })
    await renderer.start()

    const overlayNode = [...host.nodesById.values()].find(node => node.metadata.elementId === 'menu')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: overlayNode! })

    expect(clicks).toHaveLength(1)
    expect(advances).toEqual([])
  })

  it('updates projection layers from view updates', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView({ dialogueText: 'next' }) })

    const dialogueLayer = [...host.nodesById.values()].find(node => node.name === 'qua-dialogue')
    expect(dialogueLayer?.children[0]?.text).toContain('next')
  })

  it('renders rich text dialogue through the Cocos typewriter runtime', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pipeline = new Pipeline()
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        dialogueText: {
          kind: 'rich-text',
          blocks: [{
            spans: [{
              text: 'Hello',
              color: '#ff0000',
              fontWeight: 'bold',
            }],
          }],
        },
        dialogueTypewriter: {
          enabled: true,
          durationMs: 1000,
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    expect(findNodeByKind(host, 'dialogue-box')?.richText).not.toContain('Hello')
    await renderer.actions.advance('test')
    expect(findNodeByKind(host, 'dialogue-box')?.richText).toContain('<color=#ff0000><b>Hello</b></color>')
    expect(advances).toEqual([])

    now = 1000
    await renderer.actions.advance('test')
    expect(advances).toEqual([{ source: 'test' }])
    await renderer.destroy()
  })

  it('reveals Cocos rich dialogue by grapheme without cutting combined characters', () => {
    let now = 0
    const runtime = new CocosDialogueTypewriterRuntime({ now: () => now })
    const dialogue = createView({
      dialogueText: {
        kind: 'rich-text',
        blocks: [{
          id: 'line',
          spans: [
            { id: 'emoji', text: '👩‍💻' },
            { id: 'copy', text: '测试' },
          ],
        }],
      },
      dialogueTypewriter: { enabled: true, durationMs: 300 },
    }).dialogue

    expect(firstRichTextBlockSpans(runtime.project(dialogue).dialogue.text)).toEqual([])

    now = 100
    expect(firstRichTextBlockSpans(runtime.project(dialogue).dialogue.text)).toEqual([
      { id: 'emoji', text: '👩‍💻' },
    ])

    now = 200
    expect(firstRichTextBlockSpans(runtime.project(dialogue).dialogue.text)).toEqual([
      { id: 'emoji', text: '👩‍💻' },
      { id: 'copy', text: '测' },
    ])

    now = 300
    expect(firstRichTextBlockSpans(runtime.project(dialogue).dialogue.text)).toEqual([
      { id: 'emoji', text: '👩‍💻' },
      { id: 'copy', text: '测试' },
    ])
  })

  it('renders rich speaker markup and falls back to plain speaker text', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const richSpeakerView = createView({ dialogueText: 'Line' })
    richSpeakerView.dialogue = {
      ...richSpeakerView.dialogue,
      speaker: {
        kind: 'rich-text',
        blocks: [{
          spans: [{ text: 'Hero', color: '#ff6699' }],
        }],
      },
      speakerStyle: { color: '#7cc7ff', fontSize: 28 },
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: richSpeakerView,
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    const dialogue = findNodeByKind(host, 'dialogue-box')
    expect(dialogue?.richText).toContain('<color=#7cc7ff><size=28><color=#ff6699>Hero</color></size></color>')
    expect(dialogue?.richText).toContain('Line')

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {
      view: createView({ dialogueText: 'Plain speaker' }),
    })
    expect(findNodeByKind(host, 'dialogue-box')?.text).toContain('Hero')
    expect(findNodeByKind(host, 'dialogue-box')?.text).toContain('Plain speaker')

    await renderer.destroy()
  })

  it('lets advance pass after the Cocos typewriter completes naturally', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pipeline = new Pipeline()
    const advances: unknown[] = []
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        dialogueText: 'done',
        dialogueTypewriter: {
          enabled: true,
          durationMs: 10,
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    now = 10
    await waitForEventually(() => findNodeByKind(host, 'dialogue-box')?.text?.includes('done') === true)
    await renderer.actions.advance('test')

    expect(advances).toEqual([{ source: 'test' }])
    await renderer.destroy()
  })

  it('captures save previews through host capture only', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const results: unknown[] = []
    pipeline.on(RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, context => results.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'request',
      saveOpId: 'save',
      slotId: 'slot',
      reason: 'save',
      transaction: 'sync',
      policy: { format: 'image/png' },
    })

    expect(results[0]).toMatchObject({ requestId: 'request', mimeType: 'image/png' })
  })

  it('applies Cocos save preview uiMode layer visibility policy', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const duringCapture: Record<string, boolean | undefined> = {}
    host.capture!.captureNode = async (_node, captureOptions = {}) => {
      duringCapture.background = findNode(host, 'qua-background')?.visible
      duringCapture.dialogue = findNode(host, 'qua-dialogue')?.visible
      duringCapture.choices = findNode(host, 'qua-choices')?.visible
      duringCapture.ui = findNode(host, 'qua-ui')?.visible
      return {
        bytes: new Uint8Array([1]),
        mimeType: captureOptions.mimeType || 'image/png',
        capturedAt: 1,
      }
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({ uiOverlay: { visible: true } }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST, {
      requestId: 'request',
      saveOpId: 'save',
      slotId: 'slot',
      reason: 'save',
      transaction: 'sync',
      policy: { format: 'image/png', uiMode: 'scene-only' },
    })

    expect(duringCapture).toMatchObject({
      dialogue: false,
      choices: false,
      ui: false,
    })
    expect(findNode(host, 'qua-dialogue')?.visible).toBe(true)
    expect(findNode(host, 'qua-choices')?.visible).toBe(true)
    expect(findNode(host, 'qua-ui')?.visible).toBe(true)
  })

  it('renders Cocos UI overlay content and dispatches overlay actions', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const closes: unknown[] = []
    const pluginEvents: unknown[] = []
    pipeline.on(RenderToLogicEvents.UI_REQUEST_CLOSE, context => closes.push(context.event.payload))
    pipeline.on('ui/custom_action', context => pluginEvents.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        uiOverlays: {
          menu: {
            visible: true,
            title: 'Menu',
            subtitle: 'System',
            description: 'Manage the current session.',
            actions: [{
              label: 'Custom',
              event: 'ui/custom_action',
              payload: { ok: true },
            }],
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect([...host.nodesById.values()].find(node => node.name === 'menu:title')?.text).toBe('Menu')
    expect([...host.nodesById.values()].find(node => node.name === 'menu:description')?.text).toBe('Manage the current session.')

    const close = [...host.nodesById.values()].find(node => node.name === 'menu:close')
    const action = [...host.nodesById.values()].find(node => node.name === 'menu:action:0')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: close })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: action })

    expect(closes).toEqual([{ elementId: 'menu' }])
    expect(pluginEvents).toEqual([{ ok: true }])
  })

  it('renders settings form controls and dispatches settings intents', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const updates: unknown[] = []
    const resetScopes: unknown[] = []
    const resetAll: unknown[] = []
    const closes: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(SettingsRenderToLogicEvents.UPDATE_REQUEST, context => updates.push(context.event.payload))
    pipeline.on(SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, context => resetScopes.push(context.event.payload))
    pipeline.on(SettingsRenderToLogicEvents.RESET_ALL_REQUEST, context => resetAll.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.UI_REQUEST_CLOSE, context => closes.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        settings: createSettingsProjection(),
        uiOverlays: {
          settings: { open: true },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const muted = [...host.nodesById.values()].find(node => node.metadata.settingsPathKey === 'muted')
    const quality = [...host.nodesById.values()].find(node => node.metadata.settingsPathKey === 'quality')
    const speed = [...host.nodesById.values()].find(node => node.metadata.settingsPathKey === 'speed')
    expect(muted?.control).toMatchObject({ kind: 'toggle', checked: false })
    expect(quality?.control).toMatchObject({ kind: 'select' })
    expect(speed?.control).toMatchObject({ kind: 'slider', min: 0, max: 2, step: 0.5 })

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: muted })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: quality })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: speed, metadata: { value: '1.5' } })

    expect(updates).toEqual([
      { scope: 'player', patch: { muted: true } },
      { scope: 'player', patch: { quality: 'high' } },
      { scope: 'player', patch: { speed: 1.5 } },
    ])

    const resetScope = [...host.nodesById.values()].find(node => node.metadata.settingsAction === 'resetScope')
    const resetAllNode = [...host.nodesById.values()].find(node => node.metadata.settingsAction === 'resetAll')
    const close = [...host.nodesById.values()].find(node => node.name === 'settings:close')
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: resetScope })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: resetAllNode })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: close })
    expect(resetScopes).toEqual([{ scope: 'player' }])
    expect(resetAll).toEqual([{}])
    expect(closes).toEqual([{ elementId: 'settings' }])
    expect(advances).toEqual([])
  })

  it('renders Cocos settings field errors and custom control metadata', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView({
        settings: {
          revision: 1,
          profileId: 'default',
          updatedAt: 1,
          scopes: {
            player: {
              title: 'Player',
              schema: {
                type: 'object',
                properties: {
                  nickname: { type: 'string', title: 'Nickname' },
                  theme: {
                    type: 'string',
                    title: 'Theme',
                    'x-qua-ui': {
                      control: 'custom',
                      component: 'ThemePicker',
                      props: { dense: true },
                    },
                  },
                },
              },
              defaults: { nickname: '', theme: 'dark' },
              values: { nickname: '', theme: 'dark' },
              errors: [{ path: 'nickname', message: 'Nickname is required.' }],
            },
          },
        },
        uiOverlays: {
          settings: { open: true },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const error = findNode(host, 'settings:field:player:nickname:error')
    const theme = findNode(host, 'settings:field:player:theme')
    expect(error?.text).toBe('Nickname is required.')
    expect(theme?.metadata).toMatchObject({
      settingsCustomComponent: 'ThemePicker',
      settingsCustomProps: { dense: true },
    })
    expect(theme?.control).toMatchObject({
      kind: 'panel',
      metadata: {
        component: 'ThemePicker',
        props: { dense: true },
      },
    })
  })

  it('applies overlay placement zIndex to Cocos official overlay layers', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView({
        uiOverlays: {
          settings: { open: true },
        },
        plugins: {
          settings: createSettingsProjection(),
          backlog: {
            revision: 1,
            visible: true,
            entries: [],
            retention: { scope: 'global', maxEntries: 50 },
            defaultPolicy: { include: true, rewindable: false, voiceReplay: true },
          },
          gallery: {
            revision: 1,
            sceneActive: true,
            profileId: 'default',
            catalogs: [],
            entries: [],
            filteredEntryIds: [],
            requiredRuntimePackages: [],
            filter: {},
          },
          achievement: {
            revision: 1,
            sceneActive: true,
            profileId: 'default',
            notificationMode: 'toast',
            groups: [],
            achievements: [],
            filteredAchievementIds: [],
            notifications: [{
              id: 'toast-1',
              achievementId: 'first',
              title: 'Unlocked',
              mode: 'toast',
              durationMs: 1000,
              createdAt: 1,
            }],
            requiredRuntimePackages: [],
            filter: {},
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(findNode(host, 'qua-backlog')?.transform.zIndex).toBe(overlayZIndex(DEFAULT_UI_OVERLAY_Z_INDEXES.backlog))
    expect(findNode(host, 'qua-settings')?.transform.zIndex).toBe(overlayZIndex(DEFAULT_UI_OVERLAY_Z_INDEXES.settings))
    expect(findNode(host, 'qua-gallery')?.transform.zIndex).toBe(overlayZIndex(DEFAULT_UI_OVERLAY_Z_INDEXES.gallery))
    expect(findNode(host, 'qua-achievement-board')?.transform.zIndex).toBe(overlayZIndex(DEFAULT_UI_OVERLAY_Z_INDEXES.achievementBoard))
    expect(findNode(host, 'qua-achievement-toast')?.transform.zIndex).toBe(toastZIndex(DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast))
    expect(findNode(host, 'qua-achievement-board')?.metadata).toMatchObject({
      kind: 'board',
      overlayPlacement: {
        overlayStack: 'overlay',
        zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementBoard,
      },
    })
    expect(findNode(host, 'qua-achievement-toast')?.metadata).toMatchObject({
      kind: 'toast',
      overlayPlacement: {
        overlayStack: 'toast',
        zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.achievementToast,
      },
    })
  })

  it('applies UI skin manifests as sliced Cocos sprites', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets({
        json: {
          'data:ui/dark/ui-skin.manifest.json': {
            version: 1,
            family: 'ui/dark',
            skins: {
              panel: {
                base: { asset: 'panel.png' },
                slice: { top: 12, right: 12, bottom: 12, left: 12 },
                contentInsets: { top: 6, right: 7, bottom: 8, left: 9 },
              },
              button: {
                base: { asset: 'button.png' },
                slice: { top: 4, right: 5, bottom: 6, left: 7 },
              },
            },
          },
        },
        assets: {
          'images:ui/dark/panel.png': imageAsset('ui/dark/panel.png'),
          'images:ui/dark/button.png': imageAsset('ui/dark/button.png'),
        },
      }),
      initialView: createView({
        uiOverlays: {
          menu: {
            visible: true,
            title: 'Skinned',
          },
        },
        plugins: {
          ui: {
            themeId: 'dark',
            defaults: {
              panel: 'panel',
              button: 'button',
            },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await waitFor(() => Boolean(findNode(host, 'menu:close')?.spriteOptions))

    const close = findNode(host, 'menu:close')
    expect(close?.spriteOptions).toMatchObject({
      mode: 'sliced',
      slice: { top: 4, right: 5, bottom: 6, left: 7 },
    })
    const panel = findNode(host, 'menu')
    expect(panel?.spriteOptions).toMatchObject({
      mode: 'sliced',
      contentInsets: { top: 6, right: 7, bottom: 8, left: 9 },
    })
  })

  it('registers and unregisters Cocos font faces through the host', async () => {
    const host = createFakeCocosHost()
    const registeredFonts = new Map<string, unknown>()
    ;(host as any).fonts = {
      registerFontFace: (_resource: unknown, options: { id: string }) => {
        registeredFonts.set(options.id, options)
      },
      unregisterFontFace: (id: string) => {
        registeredFonts.delete(id)
      },
    }
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets({
        assets: {
          'fonts:main.ttf': defaultAsset('fonts', 'main.ttf'),
        },
      }),
      initialView: createView({
        plugins: {
          fonts: {
            revision: 1,
            faces: [{
              id: 'main',
              family: 'Main',
              assetName: 'main.ttf',
              weight: 700,
              style: 'normal',
            }],
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await waitForEventually(() => registeredFonts.has('main'))

    expect(registeredFonts.get('main')).toMatchObject({
      family: 'Main',
      assetName: 'main.ttf',
      weight: 700,
    })

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {
      view: createView({
        plugins: {
          fonts: {
            revision: 2,
            faces: [],
          },
        },
      }),
    })
    await waitForEventually(() => registeredFonts.size === 0)
  })

  it('loads Cocos hybrid native assets from bundle manifests without reading QPK bytes', async () => {
    const host = createFakeCocosHost()
    const nativeLoads: Array<{ kind: string, source: string }> = []
    const loadResource = host.assets.loadResource!
    host.assets.loadResource = async (kind, source, options) => {
      nativeLoads.push({ kind, source })
      return loadResource(kind, source, options)
    }
    let qpkReads = 0
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createHybridNativeAssets({
        onQpkRead: () => {
          qpkReads += 1
        },
      }),
      initialView: createView({ backgroundAsset: 'hero.png' }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(qpkReads).toBe(0)
    expect(nativeLoads).toEqual([{
      kind: 'spriteFrame',
      source: 'assets/resources/qua-hybrid/images/hero.png',
    }])
    const background = [...host.nodesById.values()].find(node => node.kind === 'background')
    expect(background?.sprite?.native).toEqual({
      kind: 'spriteFrame',
      source: 'assets/resources/qua-hybrid/images/hero.png',
    })
  })

  it('resolves character sprite manifests into Cocos sprite layers', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets({
        json: {
          'characters:hero/sprite.manifest.json': {
            version: 1,
            family: 'hero',
            base: { asset: 'hero/base.png' },
            expressions: {
              smile: {
                layers: [{
                  asset: 'hero/smile.png',
                  offsetY: -4,
                  zIndex: 4,
                  opacity: 0.9,
                }],
              },
            },
          },
        },
        assets: {
          'characters:hero/base.png': imageAsset('hero/base.png'),
          'characters:hero/smile.png': imageAsset('hero/smile.png'),
        },
      }),
      initialView: createView({
        characterSprite: 'hero/base.png',
        characterExpression: 'smile',
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const baseLayer = findNode(host, 'hero:sprite:base:0')
    const expressionLayer = findNode(host, 'hero:sprite:expression:1')
    expect(baseLayer?.sprite?.source).toBe('hero/base.png')
    expect(baseLayer?.metadata).toMatchObject({ spriteLayerKind: 'base', asset: 'hero/base.png' })
    expect(expressionLayer?.sprite?.source).toBe('hero/smile.png')
    expect(expressionLayer?.transform).toMatchObject({ y: -4, opacity: 0.9, zIndex: 4 })
    expect(expressionLayer?.metadata).toMatchObject({ spriteLayerKind: 'expression', asset: 'hero/smile.png' })
  })

  it('projects atlas sprite layer options and spriteLayer animations', async () => {
    const host = createFakeCocosHost({ now: () => 500 })
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets({
        json: {
          'characters:hero/sprite.manifest.json': {
            version: 1,
            family: 'hero',
            base: { asset: 'atlas.png', frame: 'base' },
            expressions: {
              smile: {
                layers: [{
                  asset: 'atlas.png',
                  frame: 'smile',
                  mask: 'mask.png',
                  blendMode: 'multiply',
                  opacity: 0.6,
                }],
              },
            },
            atlas: {
              asset: 'atlas.png',
              frames: {
                base: { x: 0, y: 0, width: 320, height: 640 },
                smile: { x: 320, y: 0, width: 320, height: 640, offsetY: -4 },
              },
            },
          },
        },
        assets: {
          'characters:hero/atlas.png': imageAsset('hero/atlas.png'),
          'characters:mask.png': imageAsset('mask.png'),
        },
      }),
      initialView: createView({
        characterSprite: 'hero/base.png',
        characterExpression: 'smile',
        animations: [{
          id: 'sprite-motion',
          state: 'running',
          startedAt: 0,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            { target: 'spriteLayer:hero:expression', property: 'opacity', keyframes: [{ at: 0, value: 0.2 }, { at: 1000, value: 1 }] },
            { target: 'spriteLayer:hero:expression:1', property: 'offsetX', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 20 }] },
          ],
        }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const expressionLayer = findNode(host, 'hero:sprite:expression:1')
    expect(expressionLayer?.sprite?.source).toBe('hero/atlas.png')
    expect(expressionLayer?.spriteOptions).toMatchObject({
      frame: { x: 320, y: 0, width: 320, height: 640 },
      mask: {
        assetName: 'mask.png',
        assetType: 'characters',
      },
      blendMode: 'multiply',
    })
    expect(expressionLayer?.spriteOptions?.mask?.resource?.source).toBe('mask.png')
    expect(expressionLayer?.transform).toMatchObject({
      x: 10,
      y: -4,
    })
    expect(expressionLayer?.transform.opacity).toBeCloseTo(0.6, 6)
  })

  it('passes background composition options to Cocos sprites', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets({
        assets: {
          'images:bg.png': imageAsset('bg.png'),
          'images:mask.png': imageAsset('mask.png'),
        },
      }),
      initialView: createView({
        background: {
          mode: 'image',
          assetName: 'bg.png',
          composition: {
            blendMode: 'screen',
            isolation: true,
            filter: { brightness: 1.1, blur: 2 },
            mask: {
              assetName: 'mask.png',
              assetType: 'images',
              mode: 'alpha',
              repeat: 'no-repeat',
            },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const background = [...host.nodesById.values()].find(node => node.kind === 'background')
    expect(background?.spriteOptions).toMatchObject({
      blendMode: 'screen',
      filter: { brightness: 1.1, blur: 2 },
      mask: {
        assetName: 'mask.png',
        assetType: 'images',
        resourceId: 'bundle:images:mask.png:spriteFrame',
      },
      composition: {
        blendMode: 'screen',
        isolation: true,
      },
    })
    expect(background?.spriteOptions?.mask?.resource?.source).toBe('mask.png')
  })

  it('keeps single-file character sprites on the root Cocos character node without a manifest', async () => {
    const host = createFakeCocosHost()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets({
        assets: {
          'characters:alice.png': imageAsset('alice.png'),
        },
      }),
      initialView: createView({
        characterSprite: 'alice.png',
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(findNode(host, 'hero')?.sprite?.source).toBe('alice.png')
    expect(findNode(host, 'hero:sprite:base:0')).toBeUndefined()
  })

  it('reuses audio handles and disposes inactive audio resources', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({ audioAsset: 'bgm.ogg' }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const first = host.audioHandlesById.get('bgm:main')
    expect(first?.playing).toBe(true)
    expect(host.resourcesById.size).toBe(1)

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView({ audioAsset: 'bgm.ogg' }) })
    await flushAsync()
    expect(host.audioHandlesById.get('bgm:main')).toBe(first)
    expect(host.resourcesById.size).toBe(1)

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, { view: createView() })
    await flushAsync()
    expect(first?.disposed).toBe(true)
    expect(host.resourcesById.size).toBe(0)
  })

  it('schedules Cocos audio playback from projected playAt timestamps', async () => {
    const host = createFakeCocosHost({ now: () => 0 })
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'future.ogg',
        audioPlayAt: 5,
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const handle = await waitForAudioHandle(host, 'bgm:main')
    expect(handle.playing).toBe(false)
    await waitForEventually(() => handle.playing)
    expect(handle.playing).toBe(true)
    await renderer.destroy()
  })

  it('forwards Cocos audio ended events and applies bus EQ', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const ended: unknown[] = []
    pipeline.on(AudioRenderToLogicEvents.ENDED, context => ended.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'voice.ogg',
        audioKind: 'voice',
        audioEq: [{ frequency: 1000, gainDb: -3 }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(host.audioBusEq.get('voice')).toEqual([{ frequency: 1000, gainDb: -3 }])
    const handle = await waitForAudioHandle(host, 'voice:main')
    expect(handle.endedListenerCount).toBe(1)
    handle.emitEnded()
    await waitFor(() => ended.length > 0)
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({
      channel: 'voice',
      id: 'main',
      assetKey: 'voice.ogg',
    })
  })

  it('uses optional Cocos audio methods even when capabilities are not declared', async () => {
    const host = createFakeCocosHost()
    const warnings: unknown[] = []
    host.runtime.warn = (message, metadata) => warnings.push({ message, metadata })
    host.capabilities = {
      ...host.capabilities,
      audioEq: false,
      audioPlaybackRate: false,
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'bgm.ogg',
        audioPlaybackRate: 1.25,
        audioEq: [{ frequency: 2000, gainDb: -4 }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })

    await renderer.start()
    await flushAsync()

    const handle = await waitForAudioHandle(host, 'bgm:main')
    expect(handle.playbackRate).toBe(1.25)
    expect(host.audioBusEq.get('bgm')).toEqual([{ frequency: 2000, gainDb: -4 }])
    expect(warnings).toEqual([])
    await renderer.destroy()
  })

  it('interrupts active Cocos voice tracks on user advance', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const interrupted: unknown[] = []
    pipeline.on(AudioRenderToLogicEvents.INTERRUPTED, context => interrupted.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'voice.ogg',
        audioKind: 'voice',
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const handle = await waitForAudioHandle(host, 'voice:main')
    expect(handle.playing).toBe(true)
    await renderer.actions.advance('test')
    await waitForEventually(() => interrupted.length > 0)

    expect(handle.playing).toBe(false)
    expect(interrupted[0]).toMatchObject({
      channel: 'voice',
      id: 'main',
      assetKey: 'voice.ogg',
      metadata: { source: 'test' },
    })
  })

  it('applies Cocos audio seek, fade, and gain automation', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets(),
      initialView: createView({
        plugins: {
          audio: {
            revision: 1,
            unlocked: true,
            buses: {
              master: {
                automation: [{
                  target: 'master',
                  propertyPath: 'gainDb',
                  curve: { points: [{ at: 0, value: -6 }, { at: 1000, value: 0 }] },
                }],
              },
              bgm: {},
              voice: {},
              sfx: {},
              ambient: {},
            },
            bgm: {
              id: 'main',
              kind: 'bgm',
              assetKey: 'bgm.ogg',
              state: 'playing',
              loop: true,
              fadeInMs: 1000,
              seekMs: 250,
              eq: [{ frequency: 1000, gainDb: -6 }],
              automation: [{
                target: 'main',
                propertyPath: 'gainDb',
                curve: { points: [{ at: 0, value: -12 }, { at: 1000, value: 0 }] },
              }, {
                target: 'main',
                propertyPath: 'eq[0].gainDb',
                curve: { points: [{ at: 0, value: -6 }, { at: 1000, value: 0 }] },
              }],
            },
            voices: [],
            sfx: [],
            ambients: [],
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    const handle = await waitForAudioHandle(host, 'bgm:main')
    expect(handle.seekCalls).toEqual([250])
    expect(handle.volume).toBe(0)
    expect(handle.eqBands).toEqual([{ frequency: 1000, gainDb: -6 }])
    expect(host.audioBusVolumes.get('master')).toBeCloseTo(10 ** (-6 / 20), 6)

    now = 500
    await waitForEventually(() => handle.volume > 0.2)

    expect(handle.volume).toBeCloseTo((10 ** (-6 / 20)) * 0.5, 6)
    expect(handle.eqBands).toEqual([{ frequency: 1000, gainDb: -3 }])
    expect(host.audioBusVolumes.get('master')).toBeCloseTo(10 ** (-3 / 20), 6)
    await renderer.destroy()
  })

  it('warns when Cocos audio seek is projected without host support', async () => {
    const host = createFakeCocosHost()
    const warnings: unknown[] = []
    host.runtime.warn = (message, metadata) => warnings.push({ message, metadata })
    const createAudioHandle = host.audio.createAudioHandle
    host.audio.createAudioHandle = async (...args) => {
      const handle = await createAudioHandle(...args)
      ;(handle as any).seek = undefined
      return handle
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      assets: createFakeAssets(),
      initialView: createView({
        plugins: {
          audio: {
            revision: 1,
            unlocked: true,
            buses: { master: {}, bgm: {}, voice: {}, sfx: {}, ambient: {} },
            bgm: {
              id: 'main',
              kind: 'bgm',
              assetKey: 'bgm.ogg',
              state: 'playing',
              seekMs: 1000,
            },
            voices: [],
            sfx: [],
            ambients: [],
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await waitForEventually(() => warnings.length > 0)

    expect(warnings[0]).toMatchObject({
      metadata: {
        key: 'bgm:main',
        positionMs: 1000,
      },
    })
  })

  it('projects animation targets from feature plugins into transient Cocos nodes', async () => {
    const host = createFakeCocosHost({ now: () => 500 })
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        audioAsset: 'bgm.ogg',
        uiOverlay: { visible: true },
        effects: [{ id: 'flash', type: 'flash', options: {} }],
        plugins: {
          stage: { x: 4 },
          camera: { x: 20, y: 8 },
          dialogue: { y: 12 },
          choices: {
            x: 3,
            choices: {
              a: { x: 7 },
            },
          },
        },
        animations: [{
          id: 'motion',
          state: 'running',
          startedAt: 0,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            { target: 'stage:main', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 24 }] },
            { target: 'camera:main', property: 'y', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 12 }] },
            { target: 'dialogue:box', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
            { target: 'choices:panel', property: 'y', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 10 }] },
            { target: 'choice:a', property: 'opacity', keyframes: [{ at: 0, value: 0.2 }, { at: 1000, value: 1 }] },
            { target: 'ui:menu', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 30 }] },
            { target: 'effect:flash', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
            { target: 'audioBus:master', property: 'gainDb', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: -6 }] },
            { target: 'audioTrack:main', property: 'gainDb', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: -12 }] },
          ],
        }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect([...host.nodesById.values()].find(node => node.name === 'qua-scene')?.transform.x).toBe(12)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-camera')?.transform.y).toBe(-6)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-dialogue')?.children[0]?.transform.opacity).toBe(0.5)
    expect([...host.nodesById.values()].find(node => node.name === 'qua-choices')?.transform.y).toBe(5)
    expect([...host.nodesById.values()].find(node => node.metadata.choiceId === 'a')?.transform.opacity).toBeCloseTo(0.6, 6)
    expect([...host.nodesById.values()].find(node => node.name === 'menu')?.transform.x).toBe(15)
    expect([...host.nodesById.values()].find(node => node.name === 'flash')?.transform.opacity).toBe(0.5)
    expect(host.audioBusVolumes.get('master')).toBeCloseTo(10 ** (-3 / 20), 6)
    expect(host.audioHandlesById.get('bgm:main')?.volume).toBeCloseTo(10 ** (-6 / 20), 6)
  })

  it('ticks running Cocos animations without synthetic view updates', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pendingFrames = new Set<number>()
    const requestFrame = host.scheduler.requestFrame
    const cancelFrame = host.scheduler.cancelFrame
    host.scheduler.requestFrame = (callback) => {
      const handle = requestFrame((timestamp) => {
        pendingFrames.delete(handle)
        callback(timestamp)
      })
      pendingFrames.add(handle)
      return handle
    }
    host.scheduler.cancelFrame = (handle) => {
      pendingFrames.delete(handle)
      cancelFrame(handle)
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView({
        uiOverlay: { visible: true },
        animations: [{
          id: 'motion',
          state: 'running',
          startedAt: 0,
          duration: 1000,
          playbackRate: 1,
          resolvedTracks: [
            { target: 'stage:main', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 20 }] },
            { target: 'dialogue:box', property: 'opacity', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 1 }] },
            { target: 'ui:menu', property: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1000, value: 40 }] },
          ],
        }],
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(findNode(host, 'qua-scene')?.transform.x).toBe(0)
    expect(findNodeByKind(host, 'dialogue-box')?.transform.opacity).toBe(0)
    expect(pendingFrames.size).toBeGreaterThan(0)

    now = 500
    await waitForEventually(() => findNodeByKind(host, 'dialogue-box')?.transform.opacity === 0.5)

    expect(findNode(host, 'qua-scene')?.transform.x).toBe(10)
    expect(findNode(host, 'menu')?.transform.x).toBe(20)
    await renderer.destroy()
    expect(pendingFrames.size).toBe(0)
  })

  it('projects Cocos scene transitions and emits scene readiness', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pipeline = new Pipeline()
    const ready: unknown[] = []
    pipeline.on(RenderToLogicEvents.SCENE_READY, context => ready.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.SCENE_CHANGE, {
      fromScene: 'old',
      toScene: 'new',
      transition: {
        type: 'fade',
        duration: 1000,
      },
    })

    const transition = findNode(host, 'scene-transition')
    expect(transition?.metadata).toMatchObject({
      fromScene: 'old',
      toScene: 'new',
      progress: 0,
    })
    expect(ready).toEqual([])

    now = 1000
    await waitForEventually(() => ready.length > 0)
    expect(ready[0]).toMatchObject({ sceneId: 'new', timestamp: 1000 })
    expect(findNode(host, 'scene-transition')).toBeUndefined()
  })

  it('projects Cocos wipe scene transitions as clip transforms', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pipeline = new Pipeline()
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView(),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    await pipeline.emit(LogicToRenderEvents.SCENE_CHANGE, {
      fromScene: 'old',
      toScene: 'new',
      transition: {
        type: 'wipe',
        duration: 1000,
      },
    })

    expect(findNode(host, 'scene-transition')?.transform.clip).toMatchObject({ width: 1920, height: 1080 })
    now = 500
    await waitForEventually(() => findNode(host, 'scene-transition')?.metadata.progress === 0.5)
    expect(findNode(host, 'scene-transition')?.transform.clip).toMatchObject({ width: 960, height: 1080 })
    await renderer.destroy()
  })

  it('renders the Cocos backlog panel and dispatches backlog intents', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const closes: unknown[] = []
    const jumps: unknown[] = []
    const voiceReplays: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(BacklogRenderToLogicEvents.CLOSE_REQUEST, context => closes.push(context.event.payload))
    pipeline.on(BacklogRenderToLogicEvents.JUMP_REQUEST, context => jumps.push(context.event.payload))
    pipeline.on(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, context => voiceReplays.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        plugins: {
          backlog: {
            revision: 1,
            visible: true,
            entries: [{
              id: 'entry-1',
              kind: 'dialogue',
              speaker: 'Hero',
              text: 'Remember this line.',
              voice: { assetKey: 'voice.ogg' },
              rewindable: true,
              voiceReplay: true,
              tags: ['important'],
              gameTimeMs: 123000,
              recordedAt: 1,
            }],
            retention: { scope: 'global', maxEntries: 50 },
            defaultPolicy: { include: true, rewindable: true, voiceReplay: true },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    const entry = findNode(host, 'backlog:entry-1')
    const voice = findNode(host, 'backlog:entry-1:voice')
    const close = findNode(host, 'backlog:close')
    expect(findNode(host, 'backlog:title')?.text).toBe('Backlog')
    expect(findNode(host, 'backlog:subtitle')).toBeUndefined()
    expect(entry?.text).toContain('Remember this line.')
    expect(entry?.text).not.toContain('Line')
    expect(entry?.text).toContain('00:02:03')
    expect(entry?.metadata).toMatchObject({ backlogKind: 'dialogue', gameTimeMs: 123000, recordedAt: 1, tags: ['important'] })
    expect(findNode(host, 'backlog:entry-1:tags')?.text).toBe('important')
    expect(voice?.control).toMatchObject({ kind: 'button', disabled: false })

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: entry })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: voice })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: close })

    expect(jumps).toEqual([{ entryId: 'entry-1' }])
    expect(voiceReplays).toEqual([{ entryId: 'entry-1' }])
    expect(closes).toEqual([{}])
    expect(advances).toEqual([])
  })

  it('paginates Cocos backlog entries locally', async () => {
    const host = createFakeCocosHost()
    const entries = Array.from({ length: 9 }, (_, index) => ({
      id: `entry-${index + 1}`,
      kind: 'dialogue' as const,
      text: `Line ${index + 1}`,
      rewindable: true,
      voiceReplay: false,
      gameTimeMs: index * 1000,
      recordedAt: index + 1,
    }))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: createView({
        plugins: {
          backlog: {
            revision: 1,
            visible: true,
            entries,
            retention: { scope: 'global', maxEntries: 50 },
            defaultPolicy: { include: true, rewindable: true, voiceReplay: true },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    expect(findNode(host, 'backlog:entry-9')).toBeUndefined()
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'backlog:page:next') })
    expect(findNode(host, 'backlog:entry-9')?.text).toContain('Line 9')
  })

  it('renders the Cocos achievement board and dispatches achievement intents', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const dismisses: unknown[] = []
    const selections: unknown[] = []
    const groups: unknown[] = []
    const filters: unknown[] = []
    const closes: unknown[] = []
    const advances: unknown[] = []
    pipeline.on(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, context => dismisses.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, context => selections.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.SELECT_GROUP_REQUEST, context => groups.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.UPDATE_FILTER_REQUEST, context => filters.push(context.event.payload))
    pipeline.on(AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, context => closes.push(context.event.payload))
    pipeline.on(RenderToLogicEvents.USER_ADVANCE, context => advances.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        plugins: {
          achievement: {
            revision: 1,
            sceneActive: true,
            profileId: 'default',
            notificationMode: 'toast',
            groups: [{
              id: 'main',
              title: 'Main',
              totalAchievements: 1,
              unlockedAchievements: 0,
              lockedAchievements: 1,
            }],
            achievements: [{
              id: 'first',
              title: 'First Step',
              summary: 'Start the route.',
              description: 'Unlocked after entering the first route.',
              groupId: 'main',
              tags: ['route'],
              icon: { type: 'images', name: 'first-icon.png' },
              banner: { type: 'images', name: 'first-banner.png' },
              maxProgress: 3,
              progress: { achievementId: 'first', value: 2, updatedAt: 2 },
              unlockRecord: { achievementId: 'first', unlockedAt: 1 },
              unlocked: true,
            }],
            filteredAchievementIds: ['first'],
            selectedGroupId: 'main',
            notifications: [{
              id: 'toast-1',
              achievementId: 'first',
              title: 'Achievement unlocked',
              mode: 'toast',
              durationMs: 3000,
              createdAt: 1,
              sound: { type: 'audio', name: 'achievement.ogg' },
            }],
            requiredRuntimePackages: [],
            filter: { unlockedOnly: false },
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(findNode(host, 'achievement:title')?.text).toBe('Achievements 1/1')
    expect(findNode(host, 'achievement:item:first:image')?.sprite?.source).toBe('first-icon.png')
    expect(findNode(host, 'achievement:item:first:badges')?.text).toContain('2/3')
    expect(findNode(host, 'achievement:item:first:badges')?.text).toContain('route')
    expect(findNode(host, 'achievement:detail:first:image')?.sprite?.source).toBe('first-banner.png')
    expect(findNode(host, 'achievement:detail:first')?.text).toContain('Unlocked 1970-01-01T00:00:00.001Z')
    const sound = host.audioHandlesById.get('achievement:toast-1:sound')
    expect(sound?.playing).toBe(true)

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'achievement:toast:toast-1') })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'achievement:item:first') })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'achievement:group:main') })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'achievement:filter:unlocked') })
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'achievement:close') })

    expect(dismisses).toEqual([{ notificationId: 'toast-1', achievementId: 'first' }])
    expect(selections).toEqual([{ achievementId: 'first' }])
    expect(groups).toEqual([{ groupId: 'main' }])
    expect(filters).toEqual([{ filter: { unlockedOnly: true } }])
    expect(closes).toEqual([{}])
    expect(advances).toEqual([])

    await renderer.destroy()
    expect(sound?.disposed).toBe(true)
  })

  it('auto-dismisses Cocos achievement notifications', async () => {
    let now = 0
    const host = createFakeCocosHost({ now: () => now })
    const pipeline = new Pipeline()
    const dismisses: unknown[] = []
    pipeline.on(AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, context => dismisses.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        plugins: {
          achievement: {
            revision: 1,
            sceneActive: false,
            profileId: 'default',
            notificationMode: 'toast',
            groups: [],
            achievements: [],
            filteredAchievementIds: [],
            notifications: [{
              id: 'toast-auto',
              achievementId: 'first',
              title: 'Auto dismiss',
              mode: 'toast',
              durationMs: 10,
              createdAt: 0,
            }],
            requiredRuntimePackages: [],
            filter: {},
          },
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    now = 10
    await waitForEventually(() => dismisses.length > 0)
    expect(dismisses[0]).toEqual({ notificationId: 'toast-auto', achievementId: 'first' })
    await renderer.destroy()
  })

  it('projects optional feature plugins and emits plugin intents', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const events: unknown[] = []
    pipeline.on('gallery/select_entry_request', context => events.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      initialView: createView({
        gallery: {
          revision: 1,
          sceneActive: true,
          profileId: 'default',
          catalogs: [],
          entries: [{
            id: 'cg-1',
            title: 'CG 1',
            summary: 'First gallery item.',
            tags: ['cg'],
            unlocked: true,
            contents: [],
            catalogId: 'main',
          }],
          filteredEntryIds: ['cg-1'],
          requiredRuntimePackages: [],
          filter: {},
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()

    const galleryEntry = [...host.nodesById.values()].find(node => node.metadata.galleryEntryId === 'cg-1')
    expect(galleryEntry?.text).toBe('CG 1')
    expect(findNode(host, 'gallery:entry:cg-1:status')?.text).toContain('cg')
    expect(findNode(host, 'gallery:entry:cg-1:summary')?.text).toBe('First gallery item.')
    expect(findNode(host, 'gallery:entry:cg-1:placeholder')?.text).toBe('Open')
    await host.emitInput({ kind: 'pointer', phase: 'down', x: 960, y: 540, targetNode: galleryEntry })
    expect(events[0]).toEqual({ entryId: 'cg-1' })
  })

  it('opens Cocos gallery lightbox for projected entries without exposing hidden locked entries', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const events: unknown[] = []
    pipeline.on('gallery/select_entry_request', context => events.push(context.event.payload))
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({
        gallery: {
          revision: 1,
          sceneActive: true,
          profileId: 'default',
          catalogs: [{ id: 'main', title: 'Main', entryIds: ['cg-1', 'cg-locked', 'cg-teaser'], totalEntries: 3, unlockedEntries: 1, lockedEntries: 2 }],
          entries: [
            {
              id: 'cg-1',
              title: 'CG 1',
              unlocked: true,
              contents: [{
                id: 'image',
                kind: 'image',
                title: 'Full CG',
                asset: { type: 'images', name: 'cg-1.png' },
              }],
              catalogId: 'main',
            },
            {
              id: 'cg-locked',
              title: 'Unknown Record',
              unlocked: false,
              contents: [],
              catalogId: 'main',
            },
            {
              id: 'cg-teaser',
              title: 'Classified Preview',
              unlocked: false,
              contents: [{
                id: 'teaser',
                kind: 'image',
                title: 'Safe Teaser',
                asset: { type: 'images', name: 'teaser.png' },
              }],
              catalogId: 'main',
            },
          ],
          filteredEntryIds: ['cg-1', 'cg-locked', 'cg-teaser'],
          selectedCatalogId: 'main',
          requiredRuntimePackages: [],
          filter: {},
        },
      }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'gallery:entry:cg-1') })
    await waitForEventually(() => findNode(host, 'gallery:lightbox') !== undefined)
    expect(events[0]).toEqual({ entryId: 'cg-1' })
    expect(findNode(host, 'gallery:lightbox:media')?.sprite?.source).toBe('cg-1.png')
    expect(findNode(host, 'gallery:lightbox:caption')?.text).toBe('Full CG')

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'gallery:lightbox:close') })
    await waitForEventually(() => findNode(host, 'gallery:lightbox') === undefined)
    await waitForEventually(() => findNode(host, 'gallery:entry:cg-locked') !== undefined)
    expect(findNode(host, 'gallery:entry:cg-locked')?.text).toBe('Unknown Record')

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'gallery:entry:cg-locked') })
    await flushAsync()
    expect(events[1]).toEqual({ entryId: 'cg-locked' })
    expect(findNode(host, 'gallery:lightbox')).toBeUndefined()

    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'gallery:entry:cg-teaser') })
    await waitForEventually(() => findNode(host, 'gallery:lightbox') !== undefined)
    expect(events[2]).toEqual({ entryId: 'cg-teaser' })
    expect(findNode(host, 'gallery:lightbox:media')?.sprite?.source).toBe('teaser.png')
    expect(findNode(host, 'gallery:lightbox:caption')?.text).toBe('Safe Teaser')
  })

  it('paginates Cocos gallery entries and cleans audio previews', async () => {
    const host = createFakeCocosHost()
    const pipeline = new Pipeline()
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: `cg-${index + 1}`,
      title: `CG ${index + 1}`,
      unlocked: true,
      contents: [],
      catalogId: 'main',
    }))
    entries[10] = {
      ...entries[10]!,
      contents: [{
        id: 'audio-preview',
        kind: 'audio',
        title: 'Preview',
        asset: { type: 'audio', name: 'preview.ogg' },
      }],
    }
    const gallery = {
      revision: 1,
      sceneActive: true,
      profileId: 'default',
      catalogs: [{ id: 'main', title: 'Main', entryIds: entries.map(entry => entry.id), totalEntries: 11, unlockedEntries: 11, lockedEntries: 0 }],
      entries,
      filteredEntryIds: entries.map(entry => entry.id),
      selectedEntryId: 'cg-11',
      selectedContentId: 'audio-preview',
      requiredRuntimePackages: [],
      filter: {},
    }
    const renderer = new QuaCocosRendererController({
      host,
      pipeline,
      assets: createFakeAssets(),
      initialView: createView({ gallery }),
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await flushAsync()

    expect(findNode(host, 'gallery:entry:cg-11')).toBeUndefined()
    await host.emitInput({ kind: 'pointer', phase: 'down', targetNode: findNode(host, 'gallery:entries:next') })
    await waitForEventually(() => findNode(host, 'gallery:entry:cg-11') !== undefined)
    expect(host.audioHandlesById.get('gallery:audio-preview:audio')?.playing).toBe(false)

    await pipeline.emit(LogicToRenderEvents.VIEW_UPDATE, {
      view: createView({
        gallery: {
          ...gallery,
          sceneActive: false,
        },
      }),
    })
    await waitForEventually(() => host.audioHandlesById.get('gallery:audio-preview:audio')?.disposed === true)
  })

  it('keeps preset plugin order stable', () => {
    expect(createVisualNovelCocosRendererPlugins({ input: false }).map(plugin => plugin.name)).toEqual([
      '@quajs/renderer-cocos/background',
      '@quajs/renderer-cocos/sprite',
      '@quajs/renderer-cocos/character',
      '@quajs/renderer-cocos/effects',
      '@quajs/renderer-cocos/fonts',
      '@quajs/renderer-cocos/dialogue',
      '@quajs/renderer-cocos/choices',
      '@quajs/renderer-cocos/audio',
      '@quajs/renderer-cocos/scene',
      '@quajs/renderer-cocos/ui',
      '@quajs/renderer-cocos/settings',
      '@quajs/renderer-cocos/backlog',
      '@quajs/renderer-cocos/gallery',
      '@quajs/renderer-cocos/achievement',
      '@quajs/renderer-cocos/save-preview',
    ])
  })

  it('exports save-preview as a standalone Cocos plugin entry', () => {
    expect(createSavePreviewCocosRendererPlugin().name).toBe('@quajs/renderer-cocos/save-preview')
  })

  it('does not mutate engine-owned view on destroy', async () => {
    const host = createFakeCocosHost()
    const view = createView()
    const frozen = structuredCloneJson(view)
    const renderer = new QuaCocosRendererController({
      host,
      pipeline: new Pipeline(),
      initialView: view,
      plugins: createVisualNovelCocosRendererPlugins({ input: false }),
    })
    await renderer.start()
    await renderer.destroy()
    expect(structuredCloneJson(view)).toEqual(frozen)
  })
})

function createView(options: {
  dialogueText?: QuaViewProjection['dialogue']['text']
  dialogueTypewriter?: QuaViewProjection['dialogue']['typewriter']
  audioAsset?: string
  audioKind?: 'bgm' | 'voice' | 'sfx' | 'ambient'
  audioEq?: readonly unknown[]
  audioPlaybackRate?: number
  audioPlayAt?: number
  gallery?: Record<string, unknown>
  settings?: Record<string, unknown>
  plugins?: Record<string, unknown>
  animations?: QuaViewProjection['animations']
  uiOverlay?: Record<string, unknown>
  uiOverlays?: Record<string, Record<string, unknown>>
  effects?: QuaViewProjection['effects']
  background?: QuaViewProjection['background']
  backgroundAsset?: string
  characterSprite?: string
  characterExpression?: string
  choices?: QuaViewProjection['choices']
} = {}): QuaViewProjection {
  const uiOverlays = {
    ...(options.uiOverlays || {}),
    ...(options.uiOverlay ? { menu: options.uiOverlay } : {}),
  }
  const audioKind = options.audioKind || 'bgm'
  const audioTrack = options.audioAsset
    ? {
        id: 'main',
        kind: audioKind,
        assetKey: options.audioAsset,
        state: 'playing',
        loop: audioKind === 'bgm' || audioKind === 'ambient',
        playAt: options.audioPlayAt,
        playbackRate: options.audioPlaybackRate,
      }
    : undefined
  return {
    layout: createViewLayoutProjection(),
    background: options.background ?? (options.backgroundAsset ? { mode: 'image', assetName: options.backgroundAsset } : undefined),
    characters: [{
      id: 'hero',
      name: 'Hero',
      visible: true,
      sprite: options.characterSprite,
      expression: options.characterExpression,
      position: { x: 960, y: 760, anchor: 'center' },
    }],
    dialogue: {
      visible: true,
      characterName: 'Hero',
      text: options.dialogueText || 'hello',
      typewriter: options.dialogueTypewriter,
    },
    choices: options.choices || [{
      id: 'a',
      text: 'A',
      enabled: true,
    }],
    ui: {
      visible: true,
      ...(Object.keys(uiOverlays).length > 0
        ? {
            overlays: uiOverlays,
          }
        : {}),
    },
    flowControl: createFlowControlProjection(),
    effects: options.effects || [],
    animations: options.animations || [],
    plugins: {
      ...(options.audioAsset
        ? {
            audio: {
              revision: 1,
              unlocked: true,
              buses: {
                master: {},
                bgm: audioKind === 'bgm' && options.audioEq ? { eq: options.audioEq } : {},
                voice: audioKind === 'voice' && options.audioEq ? { eq: options.audioEq } : {},
                sfx: audioKind === 'sfx' && options.audioEq ? { eq: options.audioEq } : {},
                ambient: audioKind === 'ambient' && options.audioEq ? { eq: options.audioEq } : {},
              },
              ...(audioKind === 'bgm' ? { bgm: audioTrack } : {}),
              voices: audioKind === 'voice' ? [audioTrack] : [],
              sfx: audioKind === 'sfx' ? [audioTrack] : [],
              ambients: audioKind === 'ambient' ? [audioTrack] : [],
            },
          }
        : {}),
      ...(options.gallery ? { gallery: options.gallery } : {}),
      ...(options.settings ? { settings: options.settings } : {}),
      ...(options.plugins || {}),
    },
  }
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function overlayZIndex(zIndex: number): number {
  return DEFAULT_OVERLAY_STACK_PRIORITIES.overlay * 1_000_000 + zIndex
}

function toastZIndex(zIndex: number): number {
  return DEFAULT_OVERLAY_STACK_PRIORITIES.toast * 1_000_000 + zIndex
}

function createSettingsProjection() {
  return {
    revision: 1,
    profileId: 'default',
    updatedAt: 1,
    scopes: {
      player: {
        title: 'Player',
        schema: {
          type: 'object',
          properties: {
            muted: { type: 'boolean', title: 'Muted' },
            quality: { type: 'string', enum: ['low', 'high'], title: 'Quality' },
            speed: { type: 'number', minimum: 0, maximum: 2, multipleOf: 0.5, title: 'Speed' },
          },
        },
        defaults: { muted: false, quality: 'low', speed: 1 },
        values: { muted: false, quality: 'low', speed: 1 },
      },
    },
  }
}

function createFakeAssets(options: {
  assets?: Record<string, AssetData>
  json?: Record<string, unknown>
} = {}) {
  const assets = new Map<string, AssetData>(Object.entries(options.assets || {}))
  for (const [key, value] of Object.entries(options.json || {})) {
    assets.set(key, {
      id: `bundle:${key}`,
      type: 'data',
      name: key.split(':').slice(1).join(':'),
      bundleName: 'bundle',
      locale: 'default',
      data: new TextEncoder().encode(JSON.stringify(value)),
      size: JSON.stringify(value).length,
      version: 1,
      mtime: 1,
      fromCache: true,
      mimeType: 'application/json',
    })
  }
  return {
    getAsset: async (type: string, name: string) => {
      const key = `${type}:${name}`
      return assets.get(key) || defaultAsset(type, name)
    },
    getJSON: async <T>(type: string, name: string): Promise<T> => {
      const asset = assets.get(`${type}:${name}`)
      if (!asset)
        throw new Error(`Missing fake JSON asset: ${type}:${name}`)
      return JSON.parse(new TextDecoder().decode(asset.data)) as T
    },
    on: () => {},
    off: () => {},
  } as never
}

function defaultAsset(type: string, name: string): AssetData {
  return {
    id: `bundle:${type}:${name}`,
    type: type as AssetData['type'],
    name,
    bundleName: 'bundle',
    locale: 'default',
    data: new Uint8Array([1, 2, 3]),
    size: 3,
    version: 1,
    mtime: 1,
    fromCache: true,
  }
}

function imageAsset(name: string): AssetData {
  return {
    ...defaultAsset('images', name),
    mimeType: 'image/png',
  }
}

function createHybridNativeAssets(options: { onQpkRead?: () => void } = {}) {
  const source = 'assets/resources/qua-hybrid/images/hero.png'
  const manifest: BundleManifest = {
    name: 'bundle',
    version: '1.0.0',
    bundler: 'test',
    created: '2026-06-04T00:00:00.000Z',
    format: 'qpk',
    compression: { algorithm: 'none' },
    encryption: { enabled: false, algorithm: 'none' },
    locales: ['default'],
    defaultLocale: 'default',
    assets: {
      images: {
        'hero.png': {
          name: 'hero.png',
          path: source,
          relativePath: source,
          size: 3,
          hash: '0'.repeat(64),
          type: 'images',
          locales: ['default'],
          mimeType: 'image/png',
          mediaMetadata: { format: 'png', width: 320, height: 180 },
          variants: {
            default: {
              locale: 'default',
              path: source,
              relativePath: source,
              size: 3,
              hash: '0'.repeat(64),
              mimeType: 'image/png',
              mediaMetadata: { format: 'png', width: 320, height: 180 },
            },
          },
        },
      },
    },
    assetTarget: {
      name: 'cocos-mobile',
      platform: 'cocos',
      staticOnly: true,
      cocos: {
        staticOnly: true,
        hybrid: {
          enabled: true,
          resourceRoot: 'assets/resources',
          assetBundle: 'qua-hybrid',
          domains: {
            images: 'cocos-bundle',
            characters: 'cocos-bundle',
            audio: 'qpk',
            video: 'qpk',
            fonts: 'qpk',
          },
        },
      },
    },
  }
  const record: AssetManifestRecord = {
    id: `bundle-v1:default:images:${source}`,
    bundleName: 'bundle',
    logicalBundleName: 'bundle',
    bundleVersionKey: 'bundle-v1',
    name: 'hero.png',
    type: 'images',
    locale: 'default',
    path: source,
    mimeType: 'image/png',
    mediaMetadata: { format: 'png', width: 320, height: 180 },
    bundlePriority: 0,
    loadedAt: 1,
  }
  return {
    getAsset: async () => {
      options.onQpkRead?.()
      throw new Error('QPK bytes should not be read for Cocos hybrid native assets.')
    },
    getAssetManifestRecord: async (type: string, name: string) => type === 'images' && name === 'hero.png' ? record : undefined,
    getBundleManifest: async (bundleName: string) => bundleName === 'bundle-v1' || bundleName === 'bundle' ? manifest : undefined,
    on: () => {},
    off: () => {},
  } as never
}

function findNode(host: ReturnType<typeof createFakeCocosHost>, name: string) {
  return [...host.nodesById.values()].find(node => node.name === name)
}

function findNodeByKind(host: ReturnType<typeof createFakeCocosHost>, kind: string) {
  return [...host.nodesById.values()].find(node => node.kind === kind)
}

function firstRichTextBlockSpans(content: QuaViewProjection['dialogue']['text']) {
  if (!isRichTextDocument(content))
    return []
  return content.blocks[0]?.spans || []
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 32; index += 1) {
    await Promise.resolve()
  }
}

async function waitForAudioHandle(host: ReturnType<typeof createFakeCocosHost>, id: string) {
  for (let index = 0; index < 10; index += 1) {
    const handle = host.audioHandlesById.get(id)
    if (handle)
      return handle
    await flushAsync()
  }
  throw new Error(`Missing fake Cocos audio handle: ${id}`)
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    if (predicate())
      return
    await flushAsync()
  }
}

async function waitForEventually(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 100
  while (Date.now() < deadline) {
    if (predicate())
      return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('Timed out waiting for condition.')
}
