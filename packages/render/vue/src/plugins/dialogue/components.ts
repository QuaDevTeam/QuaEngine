import type { RichTextContent, RichTextSpanProjection } from '@quajs/render-core'
import { isRichTextDocument } from '@quajs/render-core'
import { motionProjectionVars, projectDialogue } from '@quajs/renderer-web'
import { defineComponent, h } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useDialogue, usePluginProjection, useRendererActions } from '../../composables'

export const QuaDialogueBox = defineComponent({
  name: 'QuaDialogueBox',
  setup(_, { slots }) {
    const dialogue = useDialogue()
    const dialogueProjection = usePluginProjection<Record<string, unknown>>('dialogue')
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const actions = useRendererActions()
    return () => {
      const projectedDialogue = projectDialogue(dialogue.value, animations.value, animationNow.value, dialogueProjection.value)
      return projectedDialogue.visible
        ? h('div', {
            class: 'qua-dialogue-box',
            style: motionProjectionVars(projectedDialogue as unknown as Record<string, unknown>, '--qua-dialogue'),
          }, slots.default?.({ ...useProjectionProps(), dialogue: projectedDialogue, actions }) || [
            projectedDialogue.characterName ? h('div', { class: 'qua-dialogue-speaker' }, projectedDialogue.characterName) : null,
            h('p', {
              class: 'qua-dialogue-text',
              style: isRichTextDocument(projectedDialogue.text)
                ? motionProjectionVars(projectedDialogue.text as unknown as Record<string, unknown>, '--qua-rich-text')
                : undefined,
            }, renderRichTextContent(projectedDialogue.text)),
          ])
        : null
    }
  },
})

function renderRichTextContent(content: RichTextContent) {
  if (!isRichTextDocument(content)) {
    return content
  }
  return content.blocks.map(block => h('span', {
    key: block.id,
    class: ['qua-rich-text-block', block.type ? `qua-rich-text-block--${block.type}` : undefined],
    'data-rich-text-block-id': block.id,
    style: motionProjectionVars(block as unknown as Record<string, unknown>, '--qua-rich-text-block'),
  }, block.spans.map(span => renderRichTextSpan(span))))
}

function renderRichTextSpan(span: Readonly<RichTextSpanProjection>) {
  return h(span.ruby ? 'ruby' : 'span', {
    key: span.id,
    class: 'qua-rich-text-span',
    'data-rich-text-span-id': span.id,
    'aria-label': span.ariaLabel,
    style: motionProjectionVars(span as unknown as Record<string, unknown>, '--qua-rich-text-span'),
  }, span.ruby ? [span.text, h('rt', span.ruby)] : span.text)
}
