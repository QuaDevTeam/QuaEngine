import type { AssetRuntimeAdapter, AssetType } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import {
  getUiOverlayHostProjection,
  QuaEngine,
  UiOverlayPlugin,
} from '@quajs/engine'
import { GalleryPlugin, getGalleryProfile, registerGalleryCatalogWithEngine, registerGalleryEntriesWithEngine } from '@quajs/plugin-gallery'
import { getSettingsDeveloperValues, getSettingsPlayerValues, getSettingsProjection, SettingsPlugin, updatePlayerSettingsWithEngine } from '@quajs/plugin-settings'
import { MemoryBackend } from '@quajs/store'
import { setStoryMetadataWithEngine, StoryGraphPlugin } from '@quajs/story-graph'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_PLUGIN_ID,
  ACHIEVEMENT_PROFILE_STORE_PREFIX,
  ACHIEVEMENT_SCENE_ID,
  ACHIEVEMENT_SETTINGS_SCOPE,
  ACHIEVEMENT_TOAST_HOST_SOURCE,
  achievementCondition,
  AchievementPlugin,
  AchievementRenderToLogicEvents,
  closeAchievementBoardWithEngine,
  emitAchievementRenderToLogic,
  evaluateAchievementConditionWithEngine,
  getAchievementProfile,
  getAchievementProjection,
  onAchievementUnlocked,
  openAchievementBoardWithEngine,
  registerAchievementDefinitionsWithEngine,
  removeRuntimePackageAchievementContentWithEngine,
  resetAchievementProfileWithEngine,
  setAchievementNotificationModeWithEngine,
  unlockAchievementWithEngine,
} from '../src'

describe('@quajs/plugin-achievement', () => {
  afterEach(() => {
    QuaEngine.resetInstance()
  })

  it('registers the reserved achievement scene and clears projection on unload', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()

    expect(engine.hasScene(ACHIEVEMENT_SCENE_ID)).toBe(true)

    await engine.unuse('@quajs/plugin-achievement')

    expect(engine.hasScene(ACHIEVEMENT_SCENE_ID)).toBe(false)
    expect(engine.getPluginProjection(ACHIEVEMENT_PLUGIN_ID)).toBeUndefined()
  })

  it('persists profile progress through the shared quastore and keeps it out of save/load rollback', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)

    await unlockAchievementWithEngine(engine, 'story.first-step', {
      source: 'test',
      notification: { mode: 'none' },
    })

    const storageManager = await (engine.getStore() as unknown as {
      getStorageManager: () => Promise<{ getSnapshot: (id: string) => Promise<{ storeName: string } | undefined> }>
    }).getStorageManager()
    const snapshot = await storageManager.getSnapshot(`${ACHIEVEMENT_PROFILE_STORE_PREFIX}default`)
    expect(snapshot?.storeName).toBe(`${ACHIEVEMENT_PROFILE_STORE_PREFIX}default`)

    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Saved line' })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })

    await unlockAchievementWithEngine(engine, 'cg.master', {
      source: 'test',
      notification: { mode: 'none' },
    })
    await engine.showDialogue({ text: 'Changed line' })
    await engine.quickLoad()

    expect(engine.getViewState().dialogue.text).toBe('Saved line')
    expect(Object.keys(getAchievementProfile(engine).unlockedAchievements).sort()).toEqual(['cg.master', 'story.first-step'])
  })

  it('rejects unknown achievement unlocks without writing profile progress', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()

    await expect(unlockAchievementWithEngine(engine, 'missing.achievement', {
      notification: { mode: 'none' },
    })).rejects.toThrow('Achievement "missing.achievement" is not registered.')
    expect(getAchievementProfile(engine).unlockedAchievements).toEqual({})
  })

  it('supports none, toast, and board notification modes', async () => {
    const engine = createEngine()
    engine.use(new UiOverlayPlugin())
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)

    await setAchievementNotificationModeWithEngine(engine, 'none')
    await unlockAchievementWithEngine(engine, 'story.first-step', { source: 'none' })

    expect(getAchievementProjection(engine).notifications).toEqual([])
    expect(getUiOverlayHostProjection(engine)).toBeUndefined()

    await resetAchievementProfileWithEngine(engine)
    await setAchievementNotificationModeWithEngine(engine, 'toast')
    await unlockAchievementWithEngine(engine, 'story.first-step', { source: 'toast' })

    expect(getAchievementProjection(engine).notifications).toEqual([
      expect.objectContaining({
        achievementId: 'story.first-step',
        mode: 'toast',
      }),
    ])
    expect(getUiOverlayHostProjection(engine)).toEqual(expect.objectContaining({
      sceneActive: true,
      sources: [ACHIEVEMENT_TOAST_HOST_SOURCE],
    }))

    await emitAchievementRenderToLogic(engine.getPipeline(), AchievementRenderToLogicEvents.DISMISS_NOTIFICATION_REQUEST, {})
    expect(getAchievementProjection(engine).notifications).toEqual([])

    await resetAchievementProfileWithEngine(engine)
    await unlockAchievementWithEngine(engine, 'cg.master', { source: 'board' })

    expect(engine.getCurrentSceneName()).toBe(ACHIEVEMENT_SCENE_ID)
    expect(getAchievementProjection(engine)).toEqual(expect.objectContaining({
      sceneActive: true,
      selectedAchievementId: 'cg.master',
    }))
  })

  it('exposes notification configuration through settings when settings is installed', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin({ builtin: false }))
    engine.use(new AchievementPlugin({
      profileId: 'developer-profile',
      notifications: {
        mode: 'toast',
        durationMs: 2400,
      },
    }))
    await engine.init()

    expect(getSettingsDeveloperValues(engine, ACHIEVEMENT_SETTINGS_SCOPE)).toEqual({
      defaultProfileId: 'developer-profile',
      defaultNotificationMode: 'toast',
      defaultToastDurationMs: 2400,
    })
    expect(getSettingsPlayerValues(engine, ACHIEVEMENT_SETTINGS_SCOPE)).toEqual({
      notificationMode: 'toast',
      toastDurationMs: 2400,
    })
    expect(getSettingsProjection(engine)?.scopes[ACHIEVEMENT_SETTINGS_SCOPE]).toEqual(expect.objectContaining({
      title: 'Achievements',
      values: {
        notificationMode: 'toast',
        toastDurationMs: 2400,
      },
    }))

    const result = await updatePlayerSettingsWithEngine(engine, ACHIEVEMENT_SETTINGS_SCOPE, {
      notificationMode: 'none',
      toastDurationMs: 1200,
    })

    expect(result.ok).toBe(true)
    expect(getAchievementProjection(engine).notificationMode).toBe('none')
    expect(getSettingsPlayerValues(engine, ACHIEVEMENT_SETTINGS_SCOPE)).toEqual({
      notificationMode: 'none',
      toastDurationMs: 1200,
    })
  })

  it('creates a return checkpoint when opening the board and jumps back on close', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)
    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Before board' })

    await openAchievementBoardWithEngine(engine, {
      groupId: 'main',
      achievementId: 'story.first-step',
    })

    const projection = getAchievementProjection(engine)
    expect(engine.getCurrentSceneName()).toBe(ACHIEVEMENT_SCENE_ID)
    expect(projection.sceneActive).toBe(true)
    expect(projection.returnCheckpointId).toBeTruthy()
    expect(engine.getCheckpoint(projection.returnCheckpointId!)).toBeTruthy()

    await closeAchievementBoardWithEngine(engine)

    expect(getAchievementProjection(engine).sceneActive).toBe(false)
    expect(engine.getCurrentSceneName()).toBeUndefined()
    expect(engine.getViewState().dialogue.text).toBe('Before board')
  })

  it('does not expose achievement catalog assets in inactive projection', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)

    const inactive = getAchievementProjection(engine)
    expect(inactive.sceneActive).toBe(false)
    expect(inactive.groups).toEqual([])
    expect(inactive.achievements).toEqual([])
    expect(inactive.filteredAchievementIds).toEqual([])

    await openAchievementBoardWithEngine(engine)
    const active = getAchievementProjection(engine)
    expect(active.sceneActive).toBe(true)
    expect(active.achievements.map(achievement => achievement.id)).toEqual(['cg.master', 'story.first-step'])
  })

  it('declares required packages for every active achievement projection item', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()

    await registerAchievementDefinitionsWithEngine(engine, {
      groups: [{
        id: 'base',
        title: 'Base',
        contentPackageId: 'runtime.achievement-base',
      }, {
        id: 'bonus',
        title: 'Bonus',
        contentPackageId: 'runtime.achievement-bonus',
      }],
      achievements: [{
        id: 'base.first',
        groupId: 'base',
        title: 'Base First',
        contentPackageId: 'runtime.achievement-base',
      }, {
        id: 'bonus.first',
        groupId: 'bonus',
        title: 'Bonus First',
        contentPackageId: 'runtime.achievement-bonus',
      }],
    })

    await openAchievementBoardWithEngine(engine, {
      groupId: 'base',
      achievementId: 'base.first',
    })

    const projection = getAchievementProjection(engine)
    expect(projection.filteredAchievementIds).toEqual(['base.first'])
    expect(projection.groups.map(group => group.id)).toEqual(['base', 'bonus'])
    expect(projection.achievements.map(achievement => achievement.id)).toEqual(['base.first', 'bonus.first'])
    expect(projection.requiredRuntimePackages).toEqual([
      'runtime.achievement-base',
      'runtime.achievement-bonus',
    ])
  })

  it('keeps board interaction working after saving and loading back into the achievement scene', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)
    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Return here' })

    await openAchievementBoardWithEngine(engine, {
      groupId: 'main',
      achievementId: 'story.first-step',
    })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })
    await engine.quickLoad()

    expect(engine.getCurrentSceneName()).toBe(ACHIEVEMENT_SCENE_ID)
    expect(getAchievementProjection(engine).sceneActive).toBe(true)

    await emitAchievementRenderToLogic(engine.getPipeline(), AchievementRenderToLogicEvents.SELECT_ACHIEVEMENT_REQUEST, {
      achievementId: 'cg.master',
    })
    expect(getAchievementProjection(engine).selectedAchievementId).toBe('cg.master')

    await emitAchievementRenderToLogic(engine.getPipeline(), AchievementRenderToLogicEvents.CLOSE_BOARD_REQUEST, {})
    expect(getAchievementProjection(engine).sceneActive).toBe(false)
    expect(engine.getViewState().dialogue.text).toBe('Return here')
  })

  it('applies metadata unlocks and reward-driven gallery unlocks idempotently', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    engine.use(new GalleryPlugin())
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseGallery(engine)
    await registerBaseAchievements(engine)
    await engine.setStoryPoint({
      storyId: 'default',
      sceneId: 'beach',
      stepId: 'beach.step',
      contentPackageId: 'runtime.story',
      requiredRuntimePackages: ['runtime.story', 'runtime.achievement-delta'],
    })

    await engine.dialogue([{
      uuid: 'metadata-step',
      run: async ({ engine: runtimeEngine }) => {
        await setStoryMetadataWithEngine(runtimeEngine, {
          storyId: 'default',
          sceneId: 'beach',
          stepId: 'beach.step',
          metadata: {
            achievement: {
              unlock: ['story.first-step'],
            },
          },
        })
      },
    }])

    expect(getAchievementProfile(engine).unlockedAchievements['story.first-step']).toEqual(expect.objectContaining({
      achievementId: 'story.first-step',
      source: 'metadata',
      contentPackageId: 'runtime.story',
      requiredRuntimePackages: ['runtime.story', 'runtime.achievement-delta'],
    }))

    await unlockAchievementWithEngine(engine, 'cg.master', {
      source: 'reward',
      notification: { mode: 'none' },
    })
    await unlockAchievementWithEngine(engine, 'cg.master', {
      source: 'reward-repeat',
      notification: { mode: 'none' },
    })

    expect(getGalleryProfile(engine).unlockedEntries['cg.sunset']).toEqual(expect.objectContaining({
      entryId: 'cg.sunset',
      source: 'achievement:cg.master',
    }))
  })

  it('evaluates story-point conditions against an explicit point when provided', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()
    await engine.setStoryPoint({ sceneId: 'current', stepId: 'current-step' })

    await expect(evaluateAchievementConditionWithEngine(
      engine,
      achievementCondition.storyPoint({ sceneId: 'future', stepId: 'future-step' }),
      { point: { sceneId: 'future', stepId: 'future-step' } },
    )).resolves.toBe(true)

    await expect(evaluateAchievementConditionWithEngine(
      engine,
      achievementCondition.storyPoint({ sceneId: 'future', stepId: 'future-step' }),
    )).resolves.toBe(false)
  })

  it('settles gallery rewards on the current profile before unlock listeners run', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseGallery(engine)
    await registerBaseAchievements(engine)

    const listenerObservations: boolean[] = []
    const dispose = onAchievementUnlocked(engine, (listenerEngine, achievement, _unlock, profileId) => {
      if (achievement.id !== 'cg.master') {
        return
      }
      expect(profileId).toBe('player-a')
      listenerObservations.push(Boolean(
        getGalleryProfile(listenerEngine, 'player-a').unlockedEntries['cg.sunset'],
      ))
    })

    await unlockAchievementWithEngine(engine, 'cg.master', {
      profileId: 'player-a',
      source: 'reward',
      notification: { mode: 'none' },
    })

    dispose()
    expect(listenerObservations).toEqual([true])
    expect(getGalleryProfile(engine, 'player-a').unlockedEntries['cg.sunset']).toEqual(expect.objectContaining({
      entryId: 'cg.sunset',
      source: 'achievement:cg.master',
    }))
    expect(getGalleryProfile(engine, 'default').unlockedEntries['cg.sunset']).toBeUndefined()
  })

  it('surfaces installed gallery reward failures instead of swallowing them', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    engine.use(new AchievementPlugin())
    await engine.init()
    await registerBaseAchievements(engine)

    await expect(unlockAchievementWithEngine(engine, 'cg.master', {
      notification: { mode: 'none' },
    })).rejects.toThrow('Gallery entry "cg.sunset" is not registered.')
  })

  it('removes achievement content and notifications that require an unloaded runtime package', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()

    await registerAchievementDefinitionsWithEngine(engine, {
      groups: [{
        id: 'base',
        title: 'Base',
        contentPackageId: 'base.achievement',
      }],
      achievements: [{
        id: 'dependent.achievement',
        groupId: 'base',
        title: 'Dependent Achievement',
        contentPackageId: 'base.achievement',
        requiredRuntimePackages: ['runtime.achievement-assets'],
      }, {
        id: 'base.achievement',
        groupId: 'base',
        title: 'Base Achievement',
        contentPackageId: 'base.achievement',
      }],
    })
    await setAchievementNotificationModeWithEngine(engine, 'toast')
    await unlockAchievementWithEngine(engine, 'dependent.achievement')
    await openAchievementBoardWithEngine(engine)

    expect(getAchievementProjection(engine).requiredRuntimePackages).toEqual(expect.arrayContaining(['base.achievement', 'runtime.achievement-assets']))
    expect(getAchievementProjection(engine).requiredRuntimePackages).toHaveLength(2)
    expect(getAchievementProjection(engine).notifications).toEqual([
      expect.objectContaining({ achievementId: 'dependent.achievement' }),
    ])

    await removeRuntimePackageAchievementContentWithEngine(engine, 'runtime.achievement-assets')

    expect(getAchievementProjection(engine).achievements).toEqual([
      expect.objectContaining({ id: 'base.achievement' }),
    ])
    expect(getAchievementProjection(engine).notifications).toEqual([])
    expect(getAchievementProjection(engine).requiredRuntimePackages).toEqual(['base.achievement'])
    expect(getAchievementProfile(engine).unlockedAchievements['dependent.achievement']).toEqual(expect.objectContaining({
      achievementId: 'dependent.achievement',
    }))
  })

  it('merges current runtime package dependencies for metadata-owned achievement content', async () => {
    const engine = createEngine()
    engine.use(new AchievementPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.achievement-delta', async (runtimeEngine) => {
      await registerAchievementDefinitionsWithEngine(runtimeEngine, {
        groups: [{
          id: 'base-delta',
          title: 'Base Delta',
          metadata: { contentPackageId: 'base.achievement' },
        }],
        achievements: [{
          id: 'base-delta.first',
          groupId: 'base-delta',
          title: 'Base Delta First',
          metadata: { contentPackageId: 'base.achievement' },
        }],
      })
    })

    await openAchievementBoardWithEngine(engine)
    expect(getAchievementProjection(engine).requiredRuntimePackages).toEqual(['base.achievement', 'runtime.achievement-delta'])

    await removeRuntimePackageAchievementContentWithEngine(engine, 'runtime.achievement-delta')

    expect(getAchievementProjection(engine).groups).toEqual([])
    expect(getAchievementProjection(engine).achievements).toEqual([])
    expect(getAchievementProjection(engine).requiredRuntimePackages).toEqual([])
  })
})

async function registerBaseAchievements(engine: QuaEngine): Promise<void> {
  await registerAchievementDefinitionsWithEngine(engine, {
    groups: [{
      id: 'main',
      title: 'Main',
    }],
    achievements: [
      {
        id: 'story.first-step',
        groupId: 'main',
        title: 'First Step',
        summary: 'Reach the first story milestone.',
      },
      {
        id: 'cg.master',
        groupId: 'main',
        title: 'CG Master',
        summary: 'Unlock the gallery reward.',
        notification: { mode: 'board' },
        rewards: [{
          kind: 'unlock-gallery-entries',
          entryIds: ['cg.sunset'],
        }],
      },
    ],
  })
}

async function registerBaseGallery(engine: QuaEngine): Promise<void> {
  await registerGalleryCatalogWithEngine(engine, {
    id: 'cg',
    title: 'CG',
    entryIds: ['cg.sunset'],
  })
  await registerGalleryEntriesWithEngine(engine, [{
    id: 'cg.sunset',
    catalogId: 'cg',
    title: 'Sunset',
    contents: [{
      id: 'cg.sunset.image',
      kind: 'image',
      asset: assetRef('cg/sunset.png'),
    }],
  }])
}

function assetRef(name: string): { type: AssetType, name: string } {
  return {
    type: 'images',
    name,
  }
}

function createEngine(): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend: MemoryBackend,
      },
    },
    saves: {
      preview: {
        defaults: {
          mode: 'disabled',
        },
      },
    },
  })
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'achievement-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
