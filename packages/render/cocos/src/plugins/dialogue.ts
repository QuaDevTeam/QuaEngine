import type { DialogueTypewriterProjection } from '@quajs/render-core'
import { projectDialogue, viewAllowsDialogueChrome } from '@quajs/render-core'
import { CocosDialogueTypewriterRuntime } from '../dialogue-typewriter'
import { renderCocosDialogue } from '../projection'
import { resolveAssetWithTargetPackages, runtimePackageCandidatesFromMetadata } from '../utils'
import { defineCocosRendererPlugin } from './core'
import { createCocosProjectionTask, subscribeCocosProjection } from './projection-task'

export function createDialogueCocosRendererPlugin() {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/dialogue',
    setup(context) {
      let frame: number | undefined
      const soundHandles = new Map<string, { handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } }>()
      const playTypewriterSound = createCocosProjectionTask<{ sound: NonNullable<DialogueTypewriterProjection['sound']>, visibleCharacters: number }>(context, 'dialogue-typewriter-sound', async (cocos, { sound, visibleCharacters }) => {
        const resource = await resolveAssetWithTargetPackages(cocos, 'audio', sound.assetKey, runtimePackageCandidatesFromMetadata({
          ...(sound.metadata || {}),
          ...(sound.contentPackageId ? { contentPackageId: sound.contentPackageId } : {}),
        }))
        if (!resource)
          return
        const key = `typewriter:${visibleCharacters}:${cocos.host.runtime.now()}`
        cocos.setLayerResource('dialogue-typewriter', key, resource)
        let handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } | undefined
        try {
          const audioHandle = await cocos.host.audio.createAudioHandle(resource, {
            id: key,
            loop: false,
            volume: sound.gainDb === undefined ? 1 : 10 ** (sound.gainDb / 20),
            playbackRate: sound.playbackRate,
            bus: 'sfx',
          })
          handle = audioHandle
          soundHandles.set(key, { handle: audioHandle })
          audioHandle.onEnded?.(() => {
            if (soundHandles.get(key)?.handle !== audioHandle)
              return
            void audioHandle.dispose()
            soundHandles.delete(key)
            cocos.setLayerResource('dialogue-typewriter', key, undefined)
          })
          await audioHandle.play()
        }
        catch (error) {
          if (handle) {
            void handle.stop()
            void handle.dispose()
            soundHandles.delete(key)
          }
          cocos.setLayerResource('dialogue-typewriter', key, undefined)
          throw error
        }
      }, { subscribe: false })
      const typewriterRuntime = new CocosDialogueTypewriterRuntime({
        now: () => context.cocos.host.runtime.now(),
        onSound: (sound, visibleCharacters) => {
          void playTypewriterSound({ sound, visibleCharacters }).catch(error => context.reportError(error, {
            message: 'Cocos typewriter sound playback failed.',
            phase: 'renderer-cocos:dialogue-typewriter-sound',
            pluginName: '@quajs/renderer-cocos/dialogue',
          }))
        },
      })
      const renderTask = createCocosProjectionTask<Parameters<typeof renderCocosDialogue>[1]>(context, 'dialogue', (cocos, options) => renderCocosDialogue(cocos, options), { subscribe: false })
      const renderDialogue = (options?: Parameters<typeof renderCocosDialogue>[1]) => {
        void renderTask(options)
      }
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
        if (!viewAllowsDialogueChrome(context.getViewState())) {
          typewriterRuntime.destroy()
          renderDialogue()
          return
        }
        const projectedDialogue = projectDialogue(
          context.getViewState().dialogue,
          context.getViewState().animations,
          context.cocos.host.runtime.now(),
          context.getViewState().plugins.dialogue as Record<string, unknown> | undefined,
        )
        const typewriter = typewriterRuntime.project(projectedDialogue)
        renderDialogue({ typewriter })
        if (typewriter.revealing) {
          schedule()
        }
      }

      context.addDisposer(context.cocos.registerAdvanceInterceptor(() => {
        if (!viewAllowsDialogueChrome(context.getViewState())) {
          return false
        }
        const revealed = typewriterRuntime.revealNow()
        if (revealed) {
          sync()
        }
        return revealed
      }))
      context.addDisposer(subscribeCocosProjection(context, sync))
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
