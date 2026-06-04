import type { DialogueTypewriterProjection } from '@quajs/render-core'
import { LogicToRenderEvents, projectDialogue } from '@quajs/render-core'
import { CocosDialogueTypewriterRuntime } from '../dialogue-typewriter'
import { renderCocosDialogue } from '../projection'
import { defineCocosRendererPlugin } from './core'

export function createDialogueCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/dialogue',
    setup(context) {
      let frame: number | undefined
      const soundHandles = new Map<string, { handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } }>()
      const playTypewriterSound = async (
        sound: NonNullable<DialogueTypewriterProjection['sound']>,
        visibleCharacters: number,
      ) => {
        const resource = await context.cocos.resolveAsset('audio', sound.assetKey, {
          targetPackageId: sound.contentPackageId,
        })
        if (!resource)
          return
        const key = `typewriter:${visibleCharacters}:${context.cocos.host.runtime.now()}`
        context.cocos.setLayerResource('dialogue-typewriter', key, resource)
        let handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } | undefined
        try {
          const audioHandle = await context.cocos.host.audio.createAudioHandle(resource, {
            id: key,
            loop: false,
            volume: sound.gainDb === undefined ? 1 : 10 ** (sound.gainDb / 20),
            playbackRate: sound.playbackRate,
            bus: 'sfx',
          })
          handle = audioHandle
          soundHandles.set(key, { handle: audioHandle })
          audioHandle.onEnded?.(() => {
            void audioHandle.dispose()
            soundHandles.delete(key)
            context.cocos.setLayerResource('dialogue-typewriter', key, undefined)
          })
          await audioHandle.play()
        }
        catch (error) {
          if (handle) {
            void handle.stop()
            void handle.dispose()
            soundHandles.delete(key)
          }
          context.cocos.setLayerResource('dialogue-typewriter', key, undefined)
          throw error
        }
      }
      const typewriterRuntime = new CocosDialogueTypewriterRuntime({
        now: () => context.cocos.host.runtime.now(),
        onSound: (sound, visibleCharacters) => {
          void playTypewriterSound(sound, visibleCharacters).catch(error => context.reportError(error, {
            message: 'Cocos typewriter sound playback failed.',
            phase: 'renderer-cocos:dialogue-typewriter-sound',
            pluginName: '@quajs/renderer-cocos/dialogue',
          }))
        },
      })
      let sync: () => void
      const schedule = () => {
        if (frame !== undefined)
          return
        frame = context.cocos.host.scheduler.requestFrame(() => {
          frame = undefined
          sync()
        })
      }
      sync = () => {
        const projectedDialogue = projectDialogue(
          context.getViewState().dialogue,
          context.getViewState().animations,
          context.cocos.host.runtime.now(),
          context.getViewState().plugins.dialogue as Record<string, unknown> | undefined,
        )
        const typewriter = typewriterRuntime.project(projectedDialogue)
        renderCocosDialogue(context.cocos, { typewriter })
        if (typewriter.revealing) {
          schedule()
        }
      }

      context.addDisposer(context.cocos.registerAdvanceInterceptor(() => {
        const revealed = typewriterRuntime.revealNow()
        if (revealed) {
          sync()
        }
        return revealed
      }))
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.cocos.registerAnimationSync(sync))
      context.addDisposer(() => {
        if (frame !== undefined) {
          context.cocos.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
        typewriterRuntime.destroy()
        for (const [key, record] of soundHandles.entries()) {
          void record.handle.stop()
          void record.handle.dispose()
          context.cocos.setLayerResource('dialogue-typewriter', key, undefined)
        }
        soundHandles.clear()
      })
      sync()
    },
  })
}

export const dialogueCocosRendererPlugin = createDialogueCocosRendererPlugin()
