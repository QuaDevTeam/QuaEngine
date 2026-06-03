import type { BacklogEntry, BacklogProjection, BacklogUiSceneProjection } from '@quajs/plugin-backlog/contracts'
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
      plane: 'screen',
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
  layer.className = createBacklogLayerClassName(projection.ui?.scene)
  layer.style.pointerEvents = 'auto'
  layer.setAttribute('data-qua-capture-role', 'overlay')
  applyBacklogSceneDataset(layer, projection.ui?.scene)
  layer.addEventListener('click', event => event.stopPropagation())

  const panel = context.document.createElement('section')
  panel.className = 'qua-backlog-panel'
  panel.setAttribute('data-backlog-count', String(projection.entries.length))
  bindUiControlSkin(context, panel, {
    kind: 'panel',
  })

  panel.append(renderBacklogHeader(context, projection))

  if (projection.entries.length === 0) {
    const empty = context.document.createElement('p')
    empty.className = 'qua-backlog-empty'
    empty.textContent = 'No recorded lines yet.'
    panel.append(empty)
    layer.append(panel)
    return layer
  }

  const list = context.document.createElement('ol')
  list.className = 'qua-backlog-list'
  projection.entries.forEach((entry, index) => {
    list.append(renderBacklogEntry(context, entry, index))
  })
  panel.append(list)
  layer.append(panel)
  return layer
}

function renderBacklogHeader(context: QuaWebDomLayerContext, projection: BacklogProjection): Node {
  const header = context.document.createElement('header')
  header.className = 'qua-backlog-header'

  const heading = context.document.createElement('div')
  heading.className = 'qua-backlog-heading'
  const kicker = context.document.createElement('p')
  kicker.className = 'qua-backlog-kicker'
  kicker.textContent = 'LOG'
  const title = context.document.createElement('h2')
  title.className = 'qua-backlog-title'
  title.textContent = 'Backlog'
  const subtitle = context.document.createElement('p')
  subtitle.className = 'qua-backlog-subtitle'
  subtitle.textContent = `${projection.entries.length} entries / ${projection.retention.scope}`
  heading.append(kicker, title, subtitle)

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
  header.append(heading, close)
  return header
}

function renderBacklogEntry(context: QuaWebDomLayerContext, entry: BacklogEntry, index: number): Node {
  const item = context.document.createElement('li')
  item.className = [
    'qua-backlog-entry',
    `qua-backlog-entry--${entry.kind}`,
    entry.rewindable ? '' : 'is-not-rewindable',
  ].filter(Boolean).join(' ')
  item.setAttribute('data-backlog-entry', entry.id)
  item.setAttribute('data-backlog-kind', entry.kind)
  item.setAttribute('data-backlog-rewindable', entry.rewindable ? 'true' : 'false')
  if (entry.voice) {
    item.setAttribute('data-backlog-voice', 'true')
  }

  const main = entry.rewindable
    ? context.document.createElement('button')
    : context.document.createElement('article')
  main.className = 'qua-backlog-entry-main'
  main.setAttribute('aria-label', entry.rewindable ? `Jump to backlog entry ${index + 1}` : `Backlog entry ${index + 1}`)
  main.append(renderBacklogEntryMeta(context, entry, index), renderBacklogEntryContent(context, entry))
  if (entry.rewindable) {
    const button = main as HTMLButtonElement
    button.type = 'button'
    bindUiControlSkin(context, button, {
      kind: 'button',
    })
    button.addEventListener('click', () => {
      dispatchRendererIntent(context, () => context.actions.requestPluginEvent(BacklogRenderToLogicEvents.JUMP_REQUEST, { entryId: entry.id }), {
        phase: 'backlog:jump',
        metadata: { entryId: entry.id },
      })
    })
  }
  item.append(main)

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

function renderBacklogEntryMeta(context: QuaWebDomLayerContext, entry: BacklogEntry, index: number): Node {
  const meta = context.document.createElement('span')
  meta.className = 'qua-backlog-entry-meta'

  const number = context.document.createElement('span')
  number.className = 'qua-backlog-entry-index'
  number.textContent = String(index + 1).padStart(2, '0')

  const kind = context.document.createElement('span')
  kind.className = 'qua-backlog-entry-kind'
  kind.textContent = entry.kind === 'choice' ? 'Choice' : 'Line'

  const time = context.document.createElement('time')
  time.className = 'qua-backlog-entry-time'
  const date = new Date(entry.timestamp)
  if (!Number.isNaN(date.getTime())) {
    time.dateTime = date.toISOString()
    time.textContent = formatBacklogTime(entry.timestamp)
  }

  meta.append(number, kind, time)
  return meta
}

function renderBacklogEntryContent(context: QuaWebDomLayerContext, entry: BacklogEntry): Node {
  const content = context.document.createElement('span')
  content.className = 'qua-backlog-entry-content'

  if (entry.speaker) {
    const speaker = context.document.createElement('strong')
    speaker.className = 'qua-backlog-entry-speaker'
    speaker.textContent = entry.speaker
    content.append(speaker)
  }

  const line = context.document.createElement('span')
  line.className = 'qua-backlog-entry-text'
  line.textContent = entry.kind === 'choice' ? choiceText(entry) : entry.text || ''
  content.append(line)

  if (entry.kind === 'choice' && entry.choices?.length) {
    const choices = context.document.createElement('span')
    choices.className = 'qua-backlog-choice-list'
    for (const choice of entry.choices) {
      const choiceNode = context.document.createElement('span')
      choiceNode.className = 'qua-backlog-choice-item'
      choiceNode.setAttribute('data-backlog-choice-id', choice.id)
      choiceNode.textContent = choice.text
      choices.append(choiceNode)
    }
    content.append(choices)
  }

  return content
}

function createBacklogLayerClassName(scene?: Readonly<BacklogUiSceneProjection>): string {
  return [
    'qua-backlog-layer',
    scene ? 'qua-backlog-layer--ui-scene' : '',
    scene?.presentation === 'scene' ? 'qua-backlog-layer--scene' : '',
    scene?.presentation === 'overlay' ? 'qua-backlog-layer--overlay' : '',
  ].filter(Boolean).join(' ')
}

function applyBacklogSceneDataset(element: HTMLElement, scene: Readonly<BacklogUiSceneProjection> | undefined): void {
  setOptionalAttribute(element, 'data-ui-scene-id', scene?.id)
  setOptionalAttribute(element, 'data-ui-scene-presentation', scene?.presentation)
  setOptionalAttribute(element, 'data-ui-scene-overlay-variant', scene?.overlay?.variant)
  setOptionalAttribute(element, 'data-ui-scene-hide-hud', scene?.overlay?.hideHud ? 'true' : undefined)
  setOptionalAttribute(element, 'data-ui-scene-hide-dialogue', scene?.overlay?.hideDialogue ? 'true' : undefined)
}

function setOptionalAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(name)
    return
  }
  element.setAttribute(name, value)
}

function choiceText(entry: BacklogEntry): string {
  return entry.text || entry.choices?.map(choice => choice.text).join(' / ') || ''
}

function formatBacklogTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
