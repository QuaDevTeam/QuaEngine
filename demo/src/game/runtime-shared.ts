import type { EngineConfig } from '@quajs/engine'
import { QuaEngine, UiOverlayPlugin } from '@quajs/engine'
import { AchievementPlugin } from '@quajs/plugin-achievement'
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin } from '@quajs/plugin-audio'
import { BacklogPlugin, getBacklogProjection, type BacklogEntry, type BacklogFilterContext } from '@quajs/plugin-backlog'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { GalleryPlugin } from '@quajs/plugin-gallery'
import { SettingsPlugin, type SettingsStorageAdapter } from '@quajs/plugin-settings'
import { StoryGraphPlugin } from '@quajs/story-graph'
import { DEMO_SUPPORTED_LOCALES } from './config'
import { registerDemoGallery } from './content/gallery'
import { registerDemoCharacters } from './content/characters'
import { registerDemoStoryGraph } from './content/story-tree'
import { DemoStoryPlugin } from './story/prologue-state'
import { shouldRecordDemoBacklog } from './story/backlog-policy'

export interface DemoEngineRuntimeOptions {
  engine: EngineConfig
  systemLocale?: string
  settingsStorage?: SettingsStorageAdapter
}

export async function createDemoEngineRuntime(options: DemoEngineRuntimeOptions) {
  registerDemoCharacters()
  const engine = new QuaEngine(options.engine)
  const animation = new AnimationPlugin()
  const achievement = new AchievementPlugin({
    profileId: 'call-me-tomorrow',
    notifications: { mode: 'toast', durationMs: 3200 },
  })
  const audio = new AudioPlugin()
  const backlog = new BacklogPlugin({
    filter: (entry: BacklogEntry, { engine }: BacklogFilterContext) => shouldRecordDemoBacklog(entry, getBacklogProjection(engine).entries.at(-1)),
  })
  const background = new BackgroundPlugin()
  const storyGraph = new StoryGraphPlugin()
  const gallery = new GalleryPlugin({ profileId: 'call-me-tomorrow' })
  const fonts = new FontsPlugin()

  engine
    .use(new DemoStoryPlugin(engine))
    .use(background)
    .use(animation)
    .use(audio)
    .use(backlog)
    .use(storyGraph)
    .use(gallery)
    .use(new SettingsPlugin({
      profileId: 'call-me-tomorrow',
      storage: options.settingsStorage,
      builtin: {
        developer: {
          defaultLocale: 'zh-cn',
          supportedLocales: DEMO_SUPPORTED_LOCALES,
          systemLocale: options.systemLocale,
        },
        player: {
          textSpeedCps: 36,
          autoAdvanceDelayMs: 2000,
          skipMode: 'read',
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
  // The title plate is set in a serif face. Registering it explicitly keeps Web
  // and native on the same glyphs: the Web font stack would otherwise fall
  // through to whatever serif the host OS happens to ship, and native has no
  // system font fallback at all.
  await fonts.registerFont('Noto Serif', 'NotoSerifSC-Regular.otf', {
    id: 'demo-noto-serif-regular',
    weight: 400,
    style: 'normal',
    display: 'swap',
  })
  await registerDemoGallery(gallery)
  await registerDemoStoryGraph(storyGraph)
  await engine.getPluginById<DemoStoryPlugin>('demo-story')?.refreshLibrary()

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
