import type { EngineConfig } from '@quajs/engine'
import { QuaEngine, UiOverlayPlugin } from '@quajs/engine'
import { AchievementPlugin } from '@quajs/plugin-achievement'
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
  const achievement = new AchievementPlugin({
    profileId: 'demo',
    notifications: { mode: 'toast', durationMs: 3200 },
  })
  const audio = new AudioPlugin()
  const backlog = new BacklogPlugin()
  const background = new BackgroundPlugin()
  const storyGraph = new StoryGraphPlugin()
  const gallery = new GalleryPlugin({ profileId: 'demo' })
  const fonts = new FontsPlugin()

  engine
    .use(background)
    .use(animation)
    .use(audio)
    .use(backlog)
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
    .use(achievement)
    .use(fonts)
    .use(new UiOverlayPlugin())

  await engine.init()
  await fonts.registerFont('Noto Sans', 'NotoSansCJKsc-Regular.otf', {
    id: 'demo-noto-sans-regular',
    weight: 400,
    style: 'normal',
    display: 'swap',
  })
  await registerDemoGallery(gallery)
  await achievement.registerDefinitions({
    groups: [{
      id: 'demo',
      title: 'Demo',
    }],
    achievements: [{
      id: 'first-signal',
      groupId: 'demo',
      title: 'First Signal',
      summary: 'Recover the first human signal from the blackout.',
      icon: { type: 'images', name: 'cg/blackout.webp' },
      maxProgress: 1,
    }],
  })
  await registerDemoStoryGraph(storyGraph)

  return {
    achievement,
    animation,
    audio,
    backlog,
    background,
    engine,
    fonts,
    gallery,
    storyGraph,
  }
}
