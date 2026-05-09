import { emitRenderToLogic, RenderToLogicEvents } from '@quajs/render-core'
import { defineComponent, h } from 'vue'
import { useAssetUrl, useAudio } from '../../composables'
import { useQuaRenderer } from '../../context'

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

export const QuaAudioController = defineComponent({
  name: 'QuaAudioController',
  setup() {
    const audio = useAudio()
    return () => h('div', { 'class': 'qua-audio-controller', 'aria-hidden': 'true' }, [
      audio.value.bgm ? h(AudioElement, { key: audio.value.bgm.id, intent: audio.value.bgm, channel: 'bgm' }) : null,
      ...audio.value.sounds.map(sound => h(AudioElement, { key: sound.id, intent: sound, channel: 'sound' })),
      ...audio.value.voices.map(voice => h(AudioElement, { key: voice.id, intent: voice, channel: 'voice' })),
    ])
  },
})
