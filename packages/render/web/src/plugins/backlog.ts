import type { BacklogEntry, BacklogProjection } from '@quajs/plugin-backlog/contracts'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { BACKLOG_PLUGIN_ID, BacklogRenderToLogicEvents } from '@quajs/plugin-backlog/contracts'
import { bindUiControlSkin } from '../ui-skin'
import { defineWebRendererPlugin } from './core'
import { dispatchRendererIntent } from './shared'

export function createBacklogWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/backlog',
    setup() {},
    layers: [{
      id: 'backlog',
      order: 95,
      plane: 'safe',
      render: renderBacklogLayer,
    }],
  })
}

export const backlogWebRendererPlugin = createBacklogWebRendererPlugin()

function renderBacklogLayer(context: QuaWebDomLayerContext): Node | undefined {
  const projection = context.view.plugins[BACKLOG_PLUGIN_ID] as BacklogProjection | undefined
  if (!projection?.visible) {
    return undefined
  }

  const layer = context.document.createElement('div')
  layer.className = 'qua-backlog-layer'
  layer.addEventListener('click', event => event.stopPropagation())

  const panel = context.document.createElement('section')
  panel.className = 'qua-backlog-panel'
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })

  const close = context.document.createElement('button')
  close.className = 'qua-backlog-close'
  close.type = 'button'
  close.textContent = 'Close'
  bindUiControlSkin(context, close, {
    kind: 'button',
  })
  close.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(BacklogRenderToLogicEvents.CLOSE_REQUEST), {
      phase: 'backlog:close',
    })
  })
  panel.append(close)

  const list = context.document.createElement('ol')
  list.className = 'qua-backlog-list'
  projection.entries.forEach((entry) => {
    list.append(renderBacklogEntry(context, entry))
  })
  panel.append(list)
  layer.append(panel)
  return layer
}

function renderBacklogEntry(context: QuaWebDomLayerContext, entry: BacklogEntry): Node {
  const item = context.document.createElement('li')
  item.className = 'qua-backlog-entry'
  item.setAttribute('data-backlog-entry', entry.id)

  const text = context.document.createElement('button')
  text.className = 'qua-backlog-entry-main'
  text.type = 'button'
  text.disabled = !entry.rewindable
  text.textContent = entry.kind === 'choice'
    ? entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
    : `${entry.speaker ? `${entry.speaker}: ` : ''}${entry.text || ''}`
  bindUiControlSkin(context, text, {
    kind: 'button',
  })
  text.addEventListener('click', () => {
    dispatchRendererIntent(context, () => context.actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.id }), {
      phase: 'backlog:jump',
      metadata: { entryId: entry.id },
    })
  })
  item.append(text)

  if (entry.voice) {
    const voice = context.document.createElement('button')
    voice.className = 'qua-backlog-entry-voice'
    voice.type = 'button'
    voice.disabled = !entry.voiceReplay
    voice.textContent = 'Voice'
    bindUiControlSkin(context, voice, {
      kind: 'button',
    })
    voice.addEventListener('click', () => {
      dispatchRendererIntent(context, () => context.actions.requestPluginEvent(BacklogRenderToLogicEvents.REPLAY_VOICE_REQUEST, { entryId: entry.id }), {
        phase: 'backlog:replay-voice',
        metadata: { entryId: entry.id },
      })
    })
    item.append(voice)
  }

  return item
}
