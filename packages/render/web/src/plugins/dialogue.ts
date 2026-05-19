import type { RichTextBlockProjection, RichTextContent, RichTextSpanProjection, ViewDialogueProjection } from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { motionProjectionVars, projectDialogue } from '../projection'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createDialogueWebRendererPlugin(): QuaWebDomRendererPlugin {
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/dialogue',
    setup() {},
    layers: [{
      id: 'dialogue',
      order: 50,
      plane: 'safe',
      render: renderDialogueLayer,
      update: updateDialogueLayer,
    }],
  })
}

export const dialogueWebRendererPlugin = createDialogueWebRendererPlugin()

function renderDialogueLayer(context: QuaWebDomLayerContext): Node | undefined {
  const dialogue = projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
  if (!dialogue.visible) {
    return undefined
  }

  const box = context.document.createElement('div')
  box.className = 'qua-dialogue-box'
  applyStyleVars(box, motionProjectionVars(dialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
  renderDialogueContent(context, box, dialogue)
  return box
}

function renderDialogueContent(context: QuaWebDomLayerContext, box: HTMLElement, dialogue: ViewDialogueProjection): void {
  box.textContent = ''
  if (dialogue.characterName) {
    const speaker = context.document.createElement('div')
    speaker.className = 'qua-dialogue-speaker'
    speaker.textContent = dialogue.characterName
    box.append(speaker)
  }

  const text = context.document.createElement('p')
  text.className = 'qua-dialogue-text'
  renderRichTextContent(context, text, dialogue.text)
  box.append(text)
}

function updateDialogueLayer(context: QuaWebDomLayerContext, node: Node): void {
  if (!(node instanceof HTMLElement))
    return
  const dialogue = projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
  applyStyleVars(node, motionProjectionVars(dialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
  renderDialogueContent(context, node, dialogue)
}

function renderRichTextContent(context: QuaWebDomLayerContext, root: HTMLElement, content: RichTextContent): void {
  if (!isRichTextDocument(content)) {
    root.textContent = content
    return
  }

  applyStyleVars(root, motionProjectionVars(content as unknown as Record<string, unknown>, '--qua-rich-text'))
  for (const block of content.blocks) {
    root.append(renderRichTextBlock(context, block))
  }
}

function renderRichTextBlock(context: QuaWebDomLayerContext, block: Readonly<RichTextBlockProjection>): HTMLElement {
  const element = context.document.createElement(block.type === 'line' ? 'span' : 'span')
  element.className = ['qua-rich-text-block', block.type ? `qua-rich-text-block--${block.type}` : undefined].filter(Boolean).join(' ')
  element.style.display = 'block'
  if (block.id) {
    element.setAttribute('data-rich-text-block-id', block.id)
  }
  applyStyleVars(element, motionProjectionVars(block as unknown as Record<string, unknown>, '--qua-rich-text-block'))
  for (const span of block.spans) {
    element.append(renderRichTextSpan(context, span))
  }
  return element
}

function renderRichTextSpan(context: QuaWebDomLayerContext, span: Readonly<RichTextSpanProjection>): HTMLElement {
  const text = context.document.createElement(span.ruby ? 'ruby' : 'span')
  text.className = 'qua-rich-text-span'
  text.style.display = 'inline-block'
  if (span.id) {
    text.setAttribute('data-rich-text-span-id', span.id)
  }
  if (span.ariaLabel) {
    text.setAttribute('aria-label', span.ariaLabel)
  }
  applyStyleVars(text, motionProjectionVars(span as unknown as Record<string, unknown>, '--qua-rich-text-span'))
  text.append(context.document.createTextNode(span.text))
  if (span.ruby) {
    const rubyText = context.document.createElement('rt')
    rubyText.textContent = span.ruby
    text.append(rubyText)
  }
  return text
}
