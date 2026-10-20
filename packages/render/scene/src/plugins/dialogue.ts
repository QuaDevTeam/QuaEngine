import type { DialogueTypewriterProjection } from '@quajs/render-core'
import { projectDialogue, viewAllowsDialogueChrome } from '@quajs/render-core'
import { SceneDialogueTypewriterRuntime } from '../dialogue-typewriter'
import { renderSceneDialogue } from '../projection'
import { resolveAssetWithTargetPackages, runtimePackageCandidatesFromMetadata } from '../utils'
import { defineSceneRendererPlugin } from './core'
import { createSceneProjectionTask, subscribeSceneProjection } from './projection-task'

export function createDialogueSceneRendererPlugin(options: { render?: typeof renderSceneDialogue } = {}) {
  return defineSceneRendererPlugin({
    name: '@quajs/renderer-scene/dialogue',
    setup(context) {
      let frame: number | undefined
      const soundHandles = new Map<string, { handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } }>()
      const playTypewriterSound = createSceneProjectionTask<{ sound: NonNullable<DialogueTypewriterProjection['sound']>, visibleCharacters: number }>(context, 'dialogue-typewriter-sound', async (scene, { sound, visibleCharacters }) => {
        const resource = await resolveAssetWithTargetPackages(scene, 'audio', sound.assetKey, runtimePackageCandidatesFromMetadata({
          ...(sound.metadata || {}),
          ...(sound.contentPackageId ? { contentPackageId: sound.contentPackageId } : {}),
        }))
        if (!resource)
          return
        const key = `typewriter:${visibleCharacters}:${scene.host.runtime.now()}`
        scene.setLayerResource('dialogue-typewriter', key, resource)
        let handle: { stop: () => void | Promise<void>, dispose: () => void | Promise<void> } | undefined
        try {
          const audioHandle = await scene.host.audio.createAudioHandle(resource, {
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
            scene.setLayerResource('dialogue-typewriter', key, undefined)
          })
          await audioHandle.play()
        }
        catch (error) {
          if (handle) {
            void handle.stop()
            void handle.dispose()
            soundHandles.delete(key)
          }
          scene.setLayerResource('dialogue-typewriter', key, undefined)
          throw error
        }
      }, { subscribe: false })
      const typewriterRuntime = new SceneDialogueTypewriterRuntime({
        now: () => context.scene.host.runtime.now(),
        onSound: (sound, visibleCharacters) => {
          void playTypewriterSound({ sound, visibleCharacters }).catch(error => context.reportError(error, {
            message: 'Scene typewriter sound playback failed.',
            phase: 'renderer-scene:dialogue-typewriter-sound',
            pluginName: '@quajs/renderer-scene/dialogue',
          }))
        },
      })
      const renderTask = createSceneProjectionTask<Parameters<typeof renderSceneDialogue>[1]>(context, 'dialogue', (scene, projection) => (options.render || renderSceneDialogue)(scene, projection), { subscribe: false })
      const renderDialogue = (options?: Parameters<typeof renderSceneDialogue>[1]) => {
        void renderTask(options)
      }
      let sync: () => void
      const schedule = () => {
        if (frame !== undefined)
          return
        frame = context.scene.host.scheduler.requestFrame(() => {
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
          context.scene.host.runtime.now(),
          context.getViewState().plugins.dialogue as Record<string, unknown> | undefined,
        )
        const typewriter = typewriterRuntime.project(projectedDialogue)
        renderDialogue({ typewriter })
        if (typewriter.revealing) {
          schedule()
        }
      }

      context.addDisposer(context.scene.registerAdvanceInterceptor(() => {
        if (!viewAllowsDialogueChrome(context.getViewState())) {
          return false
        }
        const revealed = typewriterRuntime.revealNow()
        if (revealed) {
          sync()
        }
        return revealed
      }))
      context.addDisposer(subscribeSceneProjection(context, sync))
      context.addDisposer(context.scene.registerAnimationSync(sync))
      context.addDisposer(() => {
        if (frame !== undefined) {
          context.scene.host.scheduler.cancelFrame(frame)
          frame = undefined
        }
        typewriterRuntime.destroy()
        for (const [key, record] of soundHandles.entries()) {
          void record.handle.stop()
          void record.handle.dispose()
          context.scene.setLayerResource('dialogue-typewriter', key, undefined)
        }
        soundHandles.clear()
      })
      sync()
    },
  })
}

export const dialogueSceneRendererPlugin = createDialogueSceneRendererPlugin()
