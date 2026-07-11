import type { EngineConfig } from '@quajs/engine'
import { QuaEngine, UiOverlayPlugin } from '@quajs/engine'
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin } from '@quajs/plugin-audio'
import { BacklogPlugin } from '@quajs/plugin-backlog'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { GalleryPlugin } from '@quajs/plugin-gallery'
import { SettingsPlugin } from '@quajs/plugin-settings'
import { StoryGraphPlugin } from '@quajs/story-graph'
import { DEMO_SUPPORTED_LOCALES } from './config'
import { registerDemoGallery } from './content/gallery'
import { registerDemoStoryGraph } from './content/story-tree'

export interface DemoEngineRuntimeOptions {
  engine: EngineConfig
  systemLocale?: string
}

export async function createDemoEngineRuntime(options: DemoEngineRuntimeOptions) {
  const engine = new QuaEngine(options.engine)
  const animation = new AnimationPlugin()
  const audio = new AudioPlugin()
  const background = new BackgroundPlugin()
  const storyGraph = new StoryGraphPlugin()
  const gallery = new GalleryPlugin({ profileId: 'demo' })

  engine
    .use(background)
    .use(animation)
    .use(audio)
    .use(new BacklogPlugin())
    .use(storyGraph)
    .use(gallery)
    .use(new SettingsPlugin({
      builtin: {
        developer: {
          defaultLocale: 'zh-cn',
          supportedLocales: DEMO_SUPPORTED_LOCALES,
          systemLocale: options.systemLocale,
        },
        player: {
          textSpeedCps: 36,
          autoAdvanceDelayMs: 2000,
          skipMode: 'all',
        },
      },
    }))
    .use(new FontsPlugin())
    .use(new UiOverlayPlugin())

  await engine.init()
  await registerDemoGallery(gallery)
  await registerDemoStoryGraph(storyGraph)

  return {
    animation,
    audio,
    background,
    engine,
    gallery,
    storyGraph,
  }
}
