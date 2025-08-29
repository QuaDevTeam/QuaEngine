import type { QuaEngine } from '../core/engine'
import type { SoundOptions, VolumeSettings } from '../core/types'
import { getPackageLogger } from '@quajs/logger'
import { LogicToRenderEvents } from '../events/events'

const logger = getPackageLogger('engine:sound-system')

/**
 * Sound System
 *
 * Provides comprehensive audio management for the game engine.
 * Handles sound effects, background music, voice dubbing, and volume control.
 */
export class SoundSystem {
  private engine: QuaEngine
  private currentBGM?: string
  private activeSounds: Set<string> = new Set()
  private activeDubs: Set<string> = new Set()

  constructor(engine: QuaEngine) {
    this.engine = engine
  }

  /**
   * Play a sound effect
   */
  async playSound(
    assetName: string,
    options: SoundOptions & { id?: string } = {},
  ): Promise<void> {
    logger.debug(`Playing sound: ${assetName}`)

    try {
      const soundId = options.id || assetName

      // Stop existing sound with same ID if not looping
      if (!options.loop && this.activeSounds.has(soundId)) {
        await this.stopSound(soundId)
      }

      // Play sound through engine (which applies sound-specific volume)
      await this.engine.playSound(assetName, options)

      // Track active sound
      if (!options.loop) {
        this.activeSounds.add(soundId)

        // Get actual duration from media metadata
        const metadata = await this.engine.getAssetMetadata('audio', assetName)
        if (!metadata || !('duration' in metadata) || typeof metadata.duration !== 'number') {
          throw new Error(`Asset ${assetName} is corrupted or missing duration metadata`)
        }

        const duration = metadata.duration * 1000

        // Auto-remove after actual duration
        setTimeout(() => {
          this.activeSounds.delete(soundId)
        }, duration)
      }

      logger.debug(`Sound started: ${assetName}`)
    }
    catch (error) {
      logger.error(`Failed to play sound: ${assetName}`, error)
      throw error
    }
  }

  /**
   * Stop a specific sound
   */
  async stopSound(soundId: string): Promise<void> {
    logger.debug(`Stopping sound: ${soundId}`)

    try {
      await this.engine.getPipeline().emit(LogicToRenderEvents.SOUND_STOP, { soundId })
      this.activeSounds.delete(soundId)
    }
    catch (error) {
      logger.error(`Failed to stop sound: ${soundId}`, error)
      throw error
    }
  }

  /**
   * Stop all sound effects
   */
  async stopAllSounds(): Promise<void> {
    logger.debug('Stopping all sounds')

    try {
      await this.engine.getPipeline().emit(LogicToRenderEvents.SOUND_STOP, { soundId: '*' })
      this.activeSounds.clear()
    }
    catch (error) {
      logger.error('Failed to stop all sounds', error)
      throw error
    }
  }

  /**
   * Play character dubbing/voice
   */
  async dub(
    assetName: string,
    options: SoundOptions & { characterId?: string } = {},
  ): Promise<void> {
    logger.debug(`Playing dub: ${assetName}`)

    try {
      const dubId = options.characterId || assetName

      // Stop existing dub for same character
      if (this.activeDubs.has(dubId)) {
        await this.stopDub(dubId)
      }

      // Play dubbing through engine (which applies voice-specific volume)
      await this.engine.dub(assetName, options)

      // Track active dub
      this.activeDubs.add(dubId)

      // Get actual duration from media metadata
      const metadata = await this.engine.getAssetMetadata('audio', assetName)
      if (!metadata || !('duration' in metadata) || typeof metadata.duration !== 'number') {
        throw new Error(`Asset ${assetName} is corrupted or missing duration metadata`)
      }

      const duration = metadata.duration * 1000

      // Auto-remove after actual duration
      setTimeout(() => {
        this.activeDubs.delete(dubId)
      }, duration)

      logger.debug(`Dub started: ${assetName}`)
    }
    catch (error) {
      logger.error(`Failed to play dub: ${assetName}`, error)
      throw error
    }
  }

  /**
   * Stop character dubbing
   */
  async stopDub(characterId: string): Promise<void> {
    logger.debug(`Stopping dub: ${characterId}`)

    try {
      await this.engine.getPipeline().emit(LogicToRenderEvents.DUB_STOP, { characterId })
      this.activeDubs.delete(characterId)
    }
    catch (error) {
      logger.error(`Failed to stop dub: ${characterId}`, error)
      throw error
    }
  }

  /**
   * Stop all dubbing
   */
  async stopAllDubs(): Promise<void> {
    logger.debug('Stopping all dubs')

    try {
      await this.engine.getPipeline().emit(LogicToRenderEvents.DUB_STOP, { characterId: '*' })
      this.activeDubs.clear()
    }
    catch (error) {
      logger.error('Failed to stop all dubs', error)
      throw error
    }
  }

  /**
   * Play background music
   */
  async playBGM(
    assetName: string,
    options: SoundOptions & { fadeOutPrevious?: number } = {},
  ): Promise<void> {
    logger.debug(`Playing BGM: ${assetName}`)

    try {
      // Fade out previous BGM if specified
      if (this.currentBGM && options.fadeOutPrevious) {
        await this.fadeBGM(0, options.fadeOutPrevious)
        await new Promise(resolve => setTimeout(resolve, options.fadeOutPrevious))
      }

      // Play BGM through engine (which applies bgm-specific volume)
      await this.engine.playBGM(assetName, options)
      this.currentBGM = assetName

      logger.debug(`BGM started: ${assetName}`)
    }
    catch (error) {
      logger.error(`Failed to play BGM: ${assetName}`, error)
      throw error
    }
  }

  /**
   * Stop background music
   */
  async stopBGM(fadeOut?: number): Promise<void> {
    logger.debug('Stopping BGM')

    try {
      if (fadeOut) {
        await this.fadeBGM(0, fadeOut)
        await new Promise(resolve => setTimeout(resolve, fadeOut))
      }

      await this.engine.getPipeline().emit(LogicToRenderEvents.BGM_STOP, {})
      this.currentBGM = undefined
    }
    catch (error) {
      logger.error('Failed to stop BGM', error)
      throw error
    }
  }

  /**
   * Fade background music volume
   */
  async fadeBGM(targetVolume: number, duration: number): Promise<void> {
    logger.debug(`Fading BGM to ${targetVolume} over ${duration}ms`)

    try {
      await this.engine.getPipeline().emit(LogicToRenderEvents.BGM_FADE, {
        targetVolume,
        duration,
      })
    }
    catch (error) {
      logger.error('Failed to fade BGM', error)
      throw error
    }
  }

  /**
   * Set volume for a specific audio type
   */
  setVolume(type: keyof VolumeSettings, value: number): void {
    this.engine.setVolume(type, value)
    logger.debug(`Volume set: ${type} = ${value}`)
  }

  /**
   * Get current volume settings
   */
  getVolumeSettings(): VolumeSettings {
    return this.engine.getVolumeSettings()
  }

  /**
   * Mute/unmute all audio
   */
  async setMasterMute(muted: boolean): Promise<void> {
    const volume = muted ? 0 : 1
    this.setVolume('master', volume)

    logger.debug(`Master audio ${muted ? 'muted' : 'unmuted'}`)
  }

  /**
   * Mute/unmute specific audio type
   */
  async setTypeMute(type: Exclude<keyof VolumeSettings, 'master'>, muted: boolean): Promise<void> {
    const volume = muted ? 0 : 1
    this.setVolume(type, volume)

    logger.debug(`${type} audio ${muted ? 'muted' : 'unmuted'}`)
  }

  /**
   * Pause all audio
   */
  async pauseAll(): Promise<void> {
    logger.debug('Pausing all audio')

    try {
      await Promise.all([
        this.engine.getPipeline().emit(LogicToRenderEvents.SOUND_PAUSE, {}),
        this.engine.getPipeline().emit(LogicToRenderEvents.BGM_STOP, {}),
        this.engine.getPipeline().emit(LogicToRenderEvents.DUB_STOP, { characterId: '*' }),
      ])
    }
    catch (error) {
      logger.error('Failed to pause all audio', error)
      throw error
    }
  }

  /**
   * Resume all audio
   */
  async resumeAll(): Promise<void> {
    logger.debug('Resuming all audio')

    try {
      await Promise.all([
        this.engine.getPipeline().emit(LogicToRenderEvents.SOUND_RESUME, {}),
        // Note: BGM and dubs would need to be restarted rather than resumed
        // as they were stopped, not paused
      ])
    }
    catch (error) {
      logger.error('Failed to resume all audio', error)
      throw error
    }
  }

  /**
   * Get current background music
   */
  getCurrentBGM(): string | undefined {
    return this.currentBGM
  }

  /**
   * Get active sound effects
   */
  getActiveSounds(): string[] {
    return Array.from(this.activeSounds)
  }

  /**
   * Get active voice dubbing
   */
  getActiveDubs(): string[] {
    return Array.from(this.activeDubs)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.activeSounds.clear()
    this.activeDubs.clear()
    this.currentBGM = undefined

    logger.debug('Sound system destroyed')
  }
}
