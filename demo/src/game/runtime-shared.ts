import type { EditorPreviewRuntimeOptions } from '@quajs/editor-core/runtime'
import type { EngineConfig, EnginePlugin } from '@quajs/engine'
import type { BacklogEntry, BacklogFilterContext } from '@quajs/plugin-backlog'
import type { SettingsStorageAdapter } from '@quajs/plugin-settings'
import { QuaEngine, ScreenshotModePlugin, UiOverlayPlugin } from '@quajs/engine'
import { AchievementPlugin } from '@quajs/plugin-achievement'
import { AnimationPlugin } from '@quajs/plugin-animation'
import { AudioPlugin } from '@quajs/plugin-audio'
import { BackgroundPlugin } from '@quajs/plugin-background'
import { BacklogPlugin, getBacklogProjection } from '@quajs/plugin-backlog'
import { FontsPlugin } from '@quajs/plugin-fonts'
import { GalleryPlugin } from '@quajs/plugin-gallery'
import { SettingsPlugin } from '@quajs/plugin-settings'
import { StoryGraphPlugin } from '@quajs/story-graph'
import { DEMO_SUPPORTED_LOCALES } from './config'
import { registerDemoCharacters } from './content/characters'
import { registerDemoGallery } from './content/gallery'
import { registerDemoStoryGraph } from './content/story-tree'
import { shouldRecordDemoBacklog } from './story/backlog-policy'
import { DemoStoryPlugin } from './story/prologue-state'

export interface DemoEngineRuntimeOptions {
  editorResources?: EditorPreviewRuntimeOptions['getResources']
  engine: EngineConfig
  plugins?: EnginePlugin[]
  prepareAssets?: (engine: QuaEngine) => Promise<void>
  systemLocale?: string
  settingsStorage?: SettingsStorageAdapter
}

export async function createDemoEngineRuntime(options: DemoEngineRuntimeOptions) {
  registerDemoCharacters()
  const engine = new QuaEngine({
    ...options.engine,
    saves: {
      ...options.engine.saves,
      preview: {
        ...options.engine.saves?.preview,
        defaults: {
          // All demo save cards are text-only, including chapter/continue slots.
          // A capture request before the opening step or title navigation would
          // stall native until timeout because this host has no preview provider.
          mode: 'disabled',
          ...options.engine.saves?.preview?.defaults,
        },
      },
    },
  })
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
    .use(new ScreenshotModePlugin())

  for (const plugin of options.plugins || []) engine.use(plugin)
  await engine.init()
  await options.prepareAssets?.(engine)
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

  const editorPreview = (import.meta.env.DEV || import.meta.env.SSR) && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1'
    ? await (await import('./story/editor-preview')).installDemoEditorPreview(engine, options.editorResources)
    : undefined

  return {
    editorPreview,
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
