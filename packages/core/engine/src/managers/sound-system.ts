import type { QuaEngine } from '../core/engine'
import type { SoundOptions, VolumeSettings } from '../core/types'
import { getPackageLogger } from '@quajs/logger'
import { emitLogicToRender, LogicToRenderEvents } from '../events/events'

const logger = getPackageLogger('engine:sound-system')

export class SoundSystem {
  constructor(private engine: QuaEngine) {}

  async playSound(assetName: string, options: SoundOptions = {}): Promise<void> {
    await this.engine.playSound(assetName, options)
  }

  async stopSound(soundId: string): Promise<void> {
    await this.engine.stopSound(soundId)
  }

  async stopAllSounds(): Promise<void> {
    const sounds = this.engine.getViewState().audio.sounds
    await Promise.all(sounds.map(sound => this.engine.stopSound(sound.id)))
  }

  async dub(assetName: string, options: SoundOptions & { characterId?: string } = {}): Promise<void> {
    await this.engine.dub(assetName, {
      ...options,
      id: options.id || options.characterId,
    })
  }

  async stopDub(characterId: string): Promise<void> {
    await this.engine.stopDub(characterId)
  }

  async stopAllDubs(): Promise<void> {
    const voices = this.engine.getViewState().audio.voices
    await Promise.all(voices.map(voice => this.engine.stopDub(voice.id)))
  }

  async playBGM(assetName: string, options: SoundOptions & { fadeOutPrevious?: number } = {}): Promise<void> {
    if (options.fadeOutPrevious && this.getCurrentBGM()) {
      await this.fadeBGM(0, options.fadeOutPrevious)
    }
    await this.engine.playBGM(assetName, options)
  }

  async stopBGM(fadeOut?: number): Promise<void> {
    if (fadeOut) {
      await this.fadeBGM(0, fadeOut)
    }
    await this.engine.stopBGM()
  }

  async fadeBGM(targetVolume: number, duration: number): Promise<void> {
    const current = this.engine.getViewState().audio.bgm
    if (current) {
      await this.engine.updateAudioIntent({
        channel: 'bgm',
        id: current.id,
        patch: {
          volume: targetVolume,
          state: 'fading',
        },
      })
    }
    await emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.BGM_FADE, {
      targetVolume,
      duration,
    })
  }

  async setVolume(type: keyof VolumeSettings, value: number): Promise<void> {
    await this.engine.setVolume(type, value)
  }

  getVolumeSettings(): VolumeSettings {
    return this.engine.getVolumeSettings()
  }

  async setMasterMute(muted: boolean): Promise<void> {
    await this.setVolume('master', muted ? 0 : 1)
  }

  async setTypeMute(type: Exclude<keyof VolumeSettings, 'master'>, muted: boolean): Promise<void> {
    await this.setVolume(type, muted ? 0 : 1)
  }

  async pauseAll(): Promise<void> {
    const audio = this.engine.getViewState().audio
    await Promise.all([
      audio.bgm
        ? this.engine.updateAudioIntent({ channel: 'bgm', id: audio.bgm.id, patch: { state: 'paused' } })
        : Promise.resolve(),
      ...audio.sounds.map(sound => this.engine.updateAudioIntent({ channel: 'sound', id: sound.id, patch: { state: 'paused' } })),
      ...audio.voices.map(voice => this.engine.updateAudioIntent({ channel: 'voice', id: voice.id, patch: { state: 'paused' } })),
      emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.SOUND_PAUSE, {}),
    ])
  }

  async resumeAll(): Promise<void> {
    const audio = this.engine.getViewState().audio
    await Promise.all([
      audio.bgm
        ? this.engine.updateAudioIntent({ channel: 'bgm', id: audio.bgm.id, patch: { state: 'playing' } })
        : Promise.resolve(),
      ...audio.sounds.map(sound => this.engine.updateAudioIntent({ channel: 'sound', id: sound.id, patch: { state: 'playing' } })),
      ...audio.voices.map(voice => this.engine.updateAudioIntent({ channel: 'voice', id: voice.id, patch: { state: 'playing' } })),
      emitLogicToRender(this.engine.getPipeline(), LogicToRenderEvents.SOUND_RESUME, {}),
    ])
  }

  getCurrentBGM(): string | undefined {
    return this.engine.getViewState().audio.bgm?.assetName
  }

  getActiveSounds(): string[] {
    return this.engine.getViewState().audio.sounds.map(sound => sound.id)
  }

  getActiveDubs(): string[] {
    return this.engine.getViewState().audio.voices.map(voice => voice.id)
  }

  destroy(): void {
    logger.debug('Sound system destroyed')
  }
}
