import type { EditorPreviewRuntimeOptions } from '@quajs/editor-core/runtime'
import type { QuaEngine } from '@quajs/engine'
import type { DemoStoryPlugin } from './prologue-state'
import { createEditorPreviewRuntime } from '@quajs/editor-core/runtime'
import { getAudioProjection, pauseAudioWithEngine, resumeAudioWithEngine, seekAudioWithEngine, stopAudioWithEngine } from '@quajs/plugin-audio'
import { DEMO_SCENE_ID } from './prologue-state'

export function installDemoEditorPreview(engine: QuaEngine, getResources?: EditorPreviewRuntimeOptions['getResources']) {
  const story = engine.getPluginById<DemoStoryPlugin>('demo-story')!
  return createEditorPreviewRuntime(engine, {
    getResources,
    getAudio: () => {
      const audio = getAudioProjection(engine)
      return [...(audio.bgm ? [audio.bgm] : []), ...audio.bgmOutgoing, ...audio.voices, ...audio.sfx, ...audio.ambients]
    },
    controlAudio: async (request) => {
      if (request.action === 'pause')
        await pauseAudioWithEngine(engine, request.target)
      if (request.action === 'resume')
        await resumeAudioWithEngine(engine, request.target)
      if (request.action === 'stop')
        await stopAudioWithEngine(engine, request.target)
      if (request.action === 'seek')
        await seekAudioWithEngine(engine, request.target, request.positionMs)
    },
    baselinePoint: { sceneId: DEMO_SCENE_ID, stepId: 'editor:baseline' },
    resolveFile: path => story.editorPreviewFile(path),
    enter: () => story.editorPreviewStart(),
  })
}
