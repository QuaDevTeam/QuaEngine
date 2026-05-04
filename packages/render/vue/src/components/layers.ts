import type { AssetType } from '@quajs/assets'
import { computed, defineComponent, h } from 'vue'
import { emitRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'
import { useAssetUrl, useAudio, useBackground, useCharacters, useChoices, useDialogue, useEffects, useRendererActions } from '../composables'
import { useQuaRenderer } from '../context'

export const QuaStage = defineComponent({
  name: 'QuaStage',
  props: projectionProps(),
  setup(_, { slots }) {
    const actions = useRendererActions()
    const slotProps = () => ({ ...useProjectionProps(), actions })
    return () => h('section', {
      class: 'qua-stage',
      onClick: () => actions.advance('stage-click'),
    }, [
      slots.background?.(slotProps()) || h(QuaBackgroundLayer),
      slots.characters?.(slotProps()) || h(QuaCharacterLayer),
      slots.effects?.(slotProps()) || h(QuaEffectLayer),
      slots.dialogue?.(slotProps()) || h(QuaDialogueBox),
      slots.choices?.(slotProps()) || h(QuaChoicePanel),
      slots.audio?.(slotProps()) || h(QuaAudioController),
      slots.overlay?.(slotProps()) || null,
    ])
  },
})

export const QuaBackgroundLayer = defineComponent({
  name: 'QuaBackgroundLayer',
  setup(_, { slots }) {
    const background = useBackground()
    const actions = useRendererActions()
    return () => h('div', { class: 'qua-background-layer' }, slots.default?.({ ...useProjectionProps(), background: background.value, actions }) || [
      background.value ? h(QuaBackgroundProjection, { background: background.value }) : null,
    ])
  },
})

export const QuaBackgroundProjection = defineComponent({
  name: 'QuaBackgroundProjection',
  props: {
    background: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    return () => {
      const background = props.background
      if (background.mode === 'video' && background.video) {
        return h(QuaVideoBackground, { video: background.video })
      }
      if (background.mode === 'layered') {
        return h(QuaLayeredBackground, { layers: background.layers || [] })
      }
      return background.assetName
        ? h(QuaBackground, { assetName: background.assetName })
        : null
    }
  },
})

export const QuaBackground = defineComponent({
  name: 'QuaBackground',
  props: {
    assetName: String,
  },
  setup(props) {
    const asset = useAssetUrl('images', () => props.assetName)
    return () => h('img', {
      class: 'qua-background',
      src: asset.url.value,
      alt: '',
      'aria-hidden': 'true',
    })
  },
})

export const QuaVideoBackground = defineComponent({
  name: 'QuaVideoBackground',
  props: {
    video: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    const videoAsset = useAssetUrl('video', () => props.video.assetName)
    const posterAsset = useAssetUrl('images', () => props.video.poster)
    return () => h('video', {
      class: 'qua-background qua-background--video',
      src: videoAsset.url.value,
      poster: posterAsset.url.value,
      autoplay: true,
      playsinline: true,
      loop: props.video.loop !== false,
      muted: props.video.muted !== false,
      volume: props.video.volume,
      playbackRate: props.video.playbackRate,
      'aria-hidden': 'true',
    })
  },
})

export const QuaLayeredBackground = defineComponent({
  name: 'QuaLayeredBackground',
  props: {
    layers: {
      type: Array,
      required: true,
    },
  },
  setup(props: any, { slots }) {
    return () => h('div', { class: 'qua-layered-background' }, props.layers.map((layer: any) =>
      slots.layer?.({ layer }) || h(QuaBackgroundLayerItem, { key: layer.id, layer }),
    ))
  },
})

export const QuaBackgroundLayerItem = defineComponent({
  name: 'QuaBackgroundLayerItem',
  props: {
    layer: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    const assetType = computed(() => normalizeBackgroundLayerAssetType(props.layer.assetType))
    const asset = useAssetUrl(assetType, () => props.layer.assetName)
    return () => props.layer.assetType === 'video'
      ? h('video', {
          class: ['qua-background-layer-item', 'qua-background-layer-item--video', props.layer.visible === false ? 'is-hidden' : undefined],
          src: asset.url.value,
          autoplay: true,
          playsinline: true,
          loop: true,
          muted: true,
          'data-background-layer-id': props.layer.id,
          'data-background-layer-type': props.layer.assetType || 'images',
          style: backgroundLayerProjectionVars(props.layer),
          'aria-hidden': 'true',
        })
      : h('img', {
          class: ['qua-background-layer-item', props.layer.visible === false ? 'is-hidden' : undefined],
          src: asset.url.value,
          alt: '',
          'data-background-layer-id': props.layer.id,
          'data-background-layer-type': props.layer.assetType || 'images',
          style: backgroundLayerProjectionVars(props.layer),
          'aria-hidden': 'true',
        })
  },
})

export const QuaCharacterLayer = defineComponent({
  name: 'QuaCharacterLayer',
  setup(_, { slots }) {
    const characters = useCharacters()
    const actions = useRendererActions()
    return () => h('div', { class: 'qua-character-layer' }, slots.default?.({ ...useProjectionProps(), characters: characters.value, actions }) || characters.value.map(character =>
      slots.character?.({ ...useProjectionProps(), character, actions }) || h(QuaCharacter, { key: character.id, character }),
    ))
  },
})

export const QuaCharacter = defineComponent({
  name: 'QuaCharacter',
  props: {
    character: {
      type: Object,
      required: true,
    },
  },
  setup(props: any) {
    const assetName = computed(() => props.character.sprite)
    const asset = useAssetUrl('characters', () => assetName.value)
    return () => h('img', {
      class: ['qua-character', props.character.visible ? 'is-visible' : 'is-hidden'],
      src: asset.url.value,
      alt: props.character.name,
      'data-character-id': props.character.id,
      'data-character-anchor': props.character.position?.anchor,
      'data-character-x': props.character.position?.x,
      'data-character-y': props.character.position?.y,
      'data-character-scale': props.character.position?.scale,
      'data-character-rotation': props.character.position?.rotation,
      'data-character-layer': props.character.layer,
      style: characterProjectionVars(props.character),
    })
  },
})

export const QuaDialogueBox = defineComponent({
  name: 'QuaDialogueBox',
  setup(_, { slots }) {
    const dialogue = useDialogue()
    const actions = useRendererActions()
    return () => dialogue.value.visible
      ? h('div', {
          class: 'qua-dialogue-box',
          onClick: (event: Event) => {
            event.stopPropagation()
            actions.advance('dialogue')
          },
        }, slots.default?.({ ...useProjectionProps(), dialogue: dialogue.value, actions }) || [
        dialogue.value.characterName ? h('div', { class: 'qua-dialogue-speaker' }, dialogue.value.characterName) : null,
        h('p', { class: 'qua-dialogue-text' }, dialogue.value.text),
      ])
      : null
  },
})

export const QuaChoicePanel = defineComponent({
  name: 'QuaChoicePanel',
  setup(_, { slots }) {
    const choices = useChoices()
    const actions = useRendererActions()
    return () => choices.value.length
      ? h('div', {
          class: 'qua-choice-panel',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({ ...useProjectionProps(), choices: choices.value, actions }) || choices.value.map(choice =>
        slots.choice?.({ ...useProjectionProps(), choice, actions }) || h(QuaChoiceButton, {
          key: choice.id,
          choice,
          onSelect: () => actions.selectChoice(choice.id),
        }),
      ))
      : null
  },
})

export const QuaChoiceButton = defineComponent({
  name: 'QuaChoiceButton',
  props: {
    choice: {
      type: Object,
      required: true,
    },
  },
  emits: ['select'],
  setup(props: any, { emit }) {
    return () => h('button', {
      class: 'qua-choice-button',
      disabled: !props.choice.enabled,
      onClick: (event: Event) => {
        event.stopPropagation()
        emit('select')
      },
    }, props.choice.text)
  },
})

export const QuaAudioController = defineComponent({
  name: 'QuaAudioController',
  setup() {
    const audio = useAudio()
    return () => h('div', { class: 'qua-audio-controller', 'aria-hidden': 'true' }, [
      audio.value.bgm ? h(AudioElement, { key: audio.value.bgm.id, intent: audio.value.bgm, channel: 'bgm' }) : null,
      ...audio.value.sounds.map(sound => h(AudioElement, { key: sound.id, intent: sound, channel: 'sound' })),
      ...audio.value.voices.map(voice => h(AudioElement, { key: voice.id, intent: voice, channel: 'voice' })),
    ])
  },
})

export const AudioElement = defineComponent({
  name: 'QuaAudioElement',
  props: {
    intent: {
      type: Object,
      required: true,
    },
    channel: {
      type: String,
      required: true,
    },
  },
  setup(props: any) {
    const { pipeline } = useQuaRenderer()
    const asset = useAssetUrl('audio', () => props.intent.assetName)
    return () => h('audio', {
      src: asset.url.value,
      autoplay: props.intent.state === 'playing',
      loop: props.intent.loop,
      volume: props.intent.volume,
      onEnded: () => emitRenderToLogic(pipeline.value, RenderToLogicEvents.AUDIO_ENDED, {
        channel: props.channel,
        id: props.intent.id,
        assetName: props.intent.assetName,
      }),
    })
  },
})

export const QuaEffectLayer = defineComponent({
  name: 'QuaEffectLayer',
  setup(_, { slots }) {
    const effects = useEffects()
    const actions = useRendererActions()
    return () => h('div', { class: 'qua-effect-layer' }, slots.default?.({ ...useProjectionProps(), effects: effects.value, actions }) || effects.value.map(effect =>
      h('div', { key: effect.id, class: ['qua-effect', `qua-effect--${effect.type}`] }),
    ))
  },
})

export const QuaOverlayLayer = defineComponent({
  name: 'QuaOverlayLayer',
  setup(_, { slots }) {
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    return () => slots.default
      ? h('div', {
      class: 'qua-overlay-layer',
      onClick: (event: Event) => event.stopPropagation(),
    }, slots.default?.({ ...useProjectionProps(), ui: view.value.ui, actions }))
      : null
  },
})

function projectionProps() {
  return {
    view: Object,
    background: Object,
    characters: Array,
    dialogue: Object,
    choices: Array,
    audio: Object,
    effects: Array,
    actions: Object,
  }
}

function useProjectionProps() {
  const { view } = useQuaRenderer()
  return {
    view: view.value,
    background: view.value.background,
    characters: view.value.characters,
    dialogue: view.value.dialogue,
    choices: view.value.choices,
    audio: view.value.audio,
    effects: view.value.effects,
  }
}

function characterProjectionVars(character: any): Record<string, string | number> | undefined {
  const position = character.position || {}
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-character-x', position.x)
  assignVar(vars, '--qua-character-y', position.y)
  assignVar(vars, '--qua-character-scale', position.scale)
  assignVar(vars, '--qua-character-rotation', position.rotation)
  assignVar(vars, '--qua-character-layer', character.layer)
  return Object.keys(vars).length ? vars : undefined
}

function backgroundLayerProjectionVars(layer: any): Record<string, string | number> | undefined {
  const vars: Record<string, string | number> = {}
  assignVar(vars, '--qua-background-layer-x', layer.x)
  assignVar(vars, '--qua-background-layer-y', layer.y)
  assignVar(vars, '--qua-background-layer-scale', layer.scale)
  assignVar(vars, '--qua-background-layer-rotation', layer.rotation)
  assignVar(vars, '--qua-background-layer-opacity', layer.opacity)
  assignVar(vars, '--qua-background-layer-z-index', layer.zIndex)
  assignVar(vars, '--qua-background-layer-blend-mode', layer.blendMode)
  return Object.keys(vars).length ? vars : undefined
}

function normalizeBackgroundLayerAssetType(assetType: string | undefined): AssetType {
  if (assetType === 'video' || assetType === 'characters' || assetType === 'audio' || assetType === 'scripts' || assetType === 'data') {
    return assetType
  }
  return 'images'
}

function assignVar(vars: Record<string, string | number>, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    vars[name] = value as string | number
  }
}
