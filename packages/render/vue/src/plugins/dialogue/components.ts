import type { AssetType } from '@quajs/assets'
import type { DialogueAvatarProjection, RichTextContent, RichTextSpanProjection } from '@quajs/render-core'
import type { PropType } from 'vue'
import { isRichTextDocument, viewAllowsDialogueChrome } from '@quajs/render-core'
import { DialoguePresenceRuntime, DialogueTypewriterRuntime, motionProjectionVars, projectDialogue, runtimePackageCandidatesFromMetadata } from '@quajs/renderer-web'
import { computed, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import { useProjectionProps } from '../../components/projection'
import { useAnimationClock, useAnimations, useAssetUrl, useDialogue, usePluginProjection, useQuaRenderer, useRendererActions } from '../../composables'

export const QuaDialogueAvatar = defineComponent({
  name: 'QuaDialogueAvatar',
  props: {
    avatar: {
      type: Object as PropType<DialogueAvatarProjection>,
      required: true,
    },
    alt: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const assetType = computed(() => (props.avatar.type || 'images') as AssetType)
    const asset = useAssetUrl(
      assetType,
      () => props.avatar.name,
      () => runtimePackageCandidatesFromDialogueAvatar(props.avatar),
    )
    return () => h('img', {
      'class': 'qua-dialogue-avatar',
      'src': asset.url.value,
      'alt': props.avatar.alt || props.alt,
      'data-dialogue-avatar-type': props.avatar.type || 'images',
      'data-dialogue-avatar-name': props.avatar.name,
    })
  },
})

export const QuaDialogueBox = defineComponent({
  name: 'QuaDialogueBox',
  setup(_, { slots }) {
    const renderer = useQuaRenderer()
    const dialogue = useDialogue()
    const dialogueProjection = usePluginProjection<Record<string, unknown>>('dialogue')
    const animations = useAnimations()
    const animationNow = useAnimationClock()
    const typewriterNow = ref(Date.now())
    const typewriterRefresh = ref(0)
    const presenceRefresh = ref(0)
    const actions = useRendererActions()
    const typewriterRuntime = new DialogueTypewriterRuntime({
      getAssets: () => renderer.assets.value,
      getDocument: () => globalThis.document,
      refresh: () => {
        typewriterNow.value = Date.now()
        typewriterRefresh.value += 1
      },
    })
    const presenceRuntime = new DialoguePresenceRuntime({
      refresh: () => {
        presenceRefresh.value += 1
      },
    })
    const unregisterAdvanceInterceptor = renderer.web.registerAdvanceInterceptor(() =>
      viewAllowsDialogueChrome(renderer.view.value) && typewriterRuntime.revealNow(),
    )
    onBeforeUnmount(() => {
      unregisterAdvanceInterceptor()
      typewriterRuntime.destroy()
      presenceRuntime.destroy()
    })
    return () => {
      void typewriterRefresh.value
      void presenceRefresh.value
      const chromeAllowed = viewAllowsDialogueChrome(renderer.view.value)
      const now = Math.max(animationNow.value, typewriterNow.value)
      const currentDialogue = chromeAllowed
        ? projectDialogue(dialogue.value, animations.value, now, dialogueProjection.value)
        : undefined
      const typewriterProjection = currentDialogue ? typewriterRuntime.project(currentDialogue, now) : undefined
      const presenceProjection = presenceRuntime.project(typewriterProjection?.dialogue || currentDialogue, chromeAllowed)
      if (!chromeAllowed && !presenceProjection.dialogue) {
        typewriterRuntime.destroy()
      }

      const projectedDialogue = presenceProjection.dialogue
      if (!projectedDialogue) {
        return null
      }
      const speakerContent = projectedDialogue.speaker ?? projectedDialogue.characterName
      return h('div', {
        class: 'qua-dialogue-box',
        'data-dialogue-presence': presenceProjection.phase,
        'data-dialogue-visible': presenceProjection.phase === 'enter' ? 'true' : 'false',
        'aria-hidden': presenceProjection.phase === 'exit' ? 'true' : undefined,
        style: motionProjectionVars(projectedDialogue as unknown as Record<string, unknown>, '--qua-dialogue'),
        onClick: (event: MouseEvent) => {
          if (presenceProjection.phase === 'enter' && typewriterProjection?.revealing && typewriterRuntime.revealNow()) {
            event.preventDefault()
            event.stopPropagation()
          }
        },
      }, slots.default?.({ ...useProjectionProps(), dialogue: projectedDialogue, actions }) || [
        projectedDialogue.avatar
          ? h(QuaDialogueAvatar, {
              avatar: projectedDialogue.avatar,
              alt: projectedDialogue.characterName || '',
            })
          : null,
        speakerContent
          ? h('div', {
              class: 'qua-dialogue-speaker',
              style: [
                isRichTextDocument(speakerContent)
                  ? motionProjectionVars(speakerContent as unknown as Record<string, unknown>, '--qua-rich-text')
                  : undefined,
                motionProjectionVars(projectedDialogue.speakerStyle as Record<string, unknown> | undefined, '--qua-dialogue-speaker'),
              ],
            }, renderRichTextContent(speakerContent))
          : null,
        h('p', {
          class: 'qua-dialogue-text',
          style: isRichTextDocument(projectedDialogue.text)
            ? motionProjectionVars(projectedDialogue.text as unknown as Record<string, unknown>, '--qua-rich-text')
            : undefined,
        }, renderRichTextContent(projectedDialogue.text)),
      ])
    }
  },
})

function runtimePackageCandidatesFromDialogueAvatar(
  avatar: DialogueAvatarProjection | undefined,
): readonly string[] | undefined {
  if (!avatar) {
    return undefined
  }
  return runtimePackageCandidatesFromMetadata({
    ...(avatar.metadata || {}),
    ...(avatar.runtimePackageId ? { contentPackageId: avatar.runtimePackageId } : {}),
  })
}

function renderRichTextContent(content: RichTextContent) {
  if (!isRichTextDocument(content)) {
    return content
  }
  return content.blocks.map(block => h('span', {
    'key': block.id,
    'class': ['qua-rich-text-block', block.type ? `qua-rich-text-block--${block.type}` : undefined],
    'data-rich-text-block-id': block.id,
    'style': motionProjectionVars(block as unknown as Record<string, unknown>, '--qua-rich-text-block'),
  }, block.spans.map(span => renderRichTextSpan(span))))
}

function renderRichTextSpan(span: Readonly<RichTextSpanProjection>) {
  return h(span.ruby ? 'ruby' : 'span', {
    'key': span.id,
    'class': 'qua-rich-text-span',
    'data-rich-text-span-id': span.id,
    'aria-label': span.ariaLabel,
    'style': motionProjectionVars(span as unknown as Record<string, unknown>, '--qua-rich-text-span'),
  }, span.ruby ? [span.text, h('rt', span.ruby)] : span.text)
}
