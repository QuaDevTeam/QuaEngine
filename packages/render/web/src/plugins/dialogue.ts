import type { AssetType } from '@quajs/assets'
import type { DialogueAvatarProjection, RichTextBlockProjection, RichTextContent, RichTextSpanProjection, ViewDialogueProjection } from '@quajs/render-core'
import type { QuaWebRendererPluginContext } from '../controller'
import type { QuaWebDomLayerContext, QuaWebDomRendererPlugin } from './core'
import { isRichTextDocument, viewAllowsDialogueChrome } from '@quajs/render-core'
import { DialoguePresenceRuntime } from '../dialogue-presence'
import { DialogueTypewriterRuntime } from '../dialogue-typewriter'
import { motionProjectionVars, projectDialogue } from '../projection'
import { runtimePackageCandidatesFromMetadata } from '../assets'
import { defineWebRendererPlugin } from './core'
import { applyStyleVars } from './shared'

export function createDialogueWebRendererPlugin(): QuaWebDomRendererPlugin {
  let typewriterRuntime: DialogueTypewriterRuntime | undefined
  let presenceRuntime: DialoguePresenceRuntime | undefined
  return defineWebRendererPlugin({
    name: '@quajs/renderer-web/dialogue',
    setup(context) {
      const webContext = context as QuaWebRendererPluginContext
      typewriterRuntime = new DialogueTypewriterRuntime({
        getAssets: () => webContext.getAssets(),
        getDocument: () => globalThis.document,
        refresh: () => context.refresh(),
      })
      presenceRuntime = new DialoguePresenceRuntime({
        refresh: () => context.refresh(),
      })
      context.addDisposer(webContext.registerAdvanceInterceptor(() =>
        viewAllowsDialogueChrome(webContext.getViewState()) && (typewriterRuntime?.revealNow() ?? false),
      ))
      context.addDisposer(() => {
        typewriterRuntime?.destroy()
        typewriterRuntime = undefined
        presenceRuntime?.destroy()
        presenceRuntime = undefined
      })
    },
    layers: [{
      id: 'dialogue',
      order: 50,
      plane: 'safe',
      render: context => renderDialogueLayer(context, typewriterRuntime, presenceRuntime),
      update: (context, node) => updateDialogueLayer(context, node, typewriterRuntime, presenceRuntime),
    }],
  })
}

export const dialogueWebRendererPlugin = createDialogueWebRendererPlugin()

function renderDialogueLayer(
  context: QuaWebDomLayerContext,
  typewriterRuntime?: DialogueTypewriterRuntime,
  presenceRuntime?: DialoguePresenceRuntime,
): Node | undefined {
  const chromeAllowed = viewAllowsDialogueChrome(context.view)
  const currentDialogue = chromeAllowed
    ? projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
    : undefined
  const typewriterProjection = currentDialogue ? typewriterRuntime?.project(currentDialogue) : undefined
  const presenceProjection = presenceRuntime?.project(typewriterProjection?.dialogue || currentDialogue, chromeAllowed)
  if (!chromeAllowed && !presenceProjection?.dialogue) {
    typewriterRuntime?.destroy()
  }

  const projectedDialogue = presenceProjection?.dialogue
  if (!projectedDialogue) {
    return undefined
  }

  const box = context.document.createElement('div')
  box.className = 'qua-dialogue-box'
  box.setAttribute('data-dialogue-presence', presenceProjection.phase)
  box.setAttribute('data-dialogue-visible', presenceProjection.phase === 'enter' ? 'true' : 'false')
  if (presenceProjection.phase === 'exit') {
    box.setAttribute('aria-hidden', 'true')
  }
  box.addEventListener('click', (event) => {
    if (presenceProjection.phase === 'enter' && typewriterProjection?.revealing && typewriterRuntime?.revealNow()) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
  applyStyleVars(box, motionProjectionVars(projectedDialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
  renderDialogueContent(context, box, projectedDialogue)
  return box
}

function renderDialogueContent(context: QuaWebDomLayerContext, box: HTMLElement, dialogue: ViewDialogueProjection): void {
  box.textContent = ''
  if (dialogue.avatar) {
    const avatar = context.document.createElement('img')
    avatar.className = 'qua-dialogue-avatar'
    avatar.alt = dialogue.avatar.alt || dialogue.characterName || ''
    avatar.setAttribute('data-dialogue-avatar-type', dialogue.avatar.type || 'images')
    avatar.setAttribute('data-dialogue-avatar-name', dialogue.avatar.name)
    context.bindAssetUrl(
      avatar,
      (dialogue.avatar.type || 'images') as AssetType,
      dialogue.avatar.name,
      'src',
      runtimePackageCandidatesFromDialogueAvatar(dialogue.avatar),
    )
    box.append(avatar)
  }

  const speakerContent = dialogue.speaker ?? dialogue.characterName
  if (speakerContent) {
    const speaker = context.document.createElement('div')
    speaker.className = 'qua-dialogue-speaker'
    renderRichTextContent(context, speaker, speakerContent)
    applyStyleVars(speaker, motionProjectionVars(dialogue.speakerStyle as Record<string, unknown> | undefined, '--qua-dialogue-speaker'))
    box.append(speaker)
  }

  const text = context.document.createElement('p')
  text.className = 'qua-dialogue-text'
  renderRichTextContent(context, text, dialogue.text)
  box.append(text)
}

function runtimePackageCandidatesFromDialogueAvatar(avatar: DialogueAvatarProjection): readonly string[] | undefined {
  return runtimePackageCandidatesFromMetadata({
    ...(avatar.metadata || {}),
    ...(avatar.runtimePackageId ? { contentPackageId: avatar.runtimePackageId } : {}),
  })
}

function updateDialogueLayer(
  context: QuaWebDomLayerContext,
  node: Node,
  typewriterRuntime?: DialogueTypewriterRuntime,
  presenceRuntime?: DialoguePresenceRuntime,
): void {
  if (!(node instanceof HTMLElement))
    return
  const chromeAllowed = viewAllowsDialogueChrome(context.view)
  const currentDialogue = chromeAllowed
    ? projectDialogue(context.view.dialogue, context.view.animations, Date.now(), context.view.plugins.dialogue as Record<string, unknown> | undefined)
    : undefined
  const typewriterProjection = currentDialogue ? typewriterRuntime?.project(currentDialogue) : undefined
  const presenceProjection = presenceRuntime?.project(typewriterProjection?.dialogue || currentDialogue, chromeAllowed)
  if (!chromeAllowed && !presenceProjection?.dialogue) {
    typewriterRuntime?.destroy()
    node.textContent = ''
    return
  }
  const projectedDialogue = presenceProjection?.dialogue
  if (!projectedDialogue) {
    node.textContent = ''
    return
  }
  node.setAttribute('data-dialogue-presence', presenceProjection.phase)
  node.setAttribute('data-dialogue-visible', presenceProjection.phase === 'enter' ? 'true' : 'false')
  if (presenceProjection.phase === 'exit') {
    node.setAttribute('aria-hidden', 'true')
  }
  else {
    node.removeAttribute('aria-hidden')
  }
  applyStyleVars(node, motionProjectionVars(projectedDialogue as unknown as Record<string, unknown>, '--qua-dialogue'))
  renderDialogueContent(context, node, projectedDialogue)
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
