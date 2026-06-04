import type { AssetRuntimeAdapter, AssetType } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { getSettingsDeveloperValues, getSettingsProjection, SettingsPlugin } from '@quajs/plugin-settings'
import { MemoryBackend } from '@quajs/store'
import { setStoryMetadataWithEngine, StoryGraphPlugin } from '@quajs/story-graph'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeGallerySceneWithEngine,
  emitGalleryRenderToLogic,
  GALLERY_PLUGIN_ID,
  GALLERY_PROFILE_STORE_PREFIX,
  GALLERY_SCENE_ID,
  GALLERY_SETTINGS_SCOPE,
  GalleryPlugin,
  GalleryRenderToLogicEvents,
  getGalleryProfile,
  getGalleryProjection,
  openGallerySceneWithEngine,
  registerGalleryCatalogWithEngine,
  registerGalleryEntriesWithEngine,
  removeRuntimePackageGalleryContentWithEngine,
  unlockGalleryEntryWithEngine,
} from '../src'

describe('@quajs/plugin-gallery', () => {
  afterEach(async () => {
    QuaEngine.resetInstance()
  })

  it('registers the reserved scene and clears it on plugin unload', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    expect(engine.hasScene(GALLERY_SCENE_ID)).toBe(true)

    await engine.unuse('@quajs/plugin-gallery')

    expect(engine.hasScene(GALLERY_SCENE_ID)).toBe(false)
    expect(engine.getPluginProjection(GALLERY_PLUGIN_ID)).toBeUndefined()
  })

  it('exposes profile defaults as developer settings only', async () => {
    const engine = createEngine()
    engine.use(new SettingsPlugin({ builtin: false }))
    engine.use(new GalleryPlugin({ profileId: 'developer-profile' }))
    await engine.init()

    expect(getSettingsDeveloperValues(engine, GALLERY_SETTINGS_SCOPE)).toEqual({
      defaultProfileId: 'developer-profile',
    })
    expect(getSettingsProjection(engine)?.scopes[GALLERY_SETTINGS_SCOPE]).toBeUndefined()
    expect(getGalleryProjection(engine).profileId).toBe('developer-profile')
  })

  it('persists gallery profiles through the shared quastore storage manager and keeps unlocks out of save/load rollback', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()
    await registerBaseCatalog(engine)

    await unlockGalleryEntryWithEngine(engine, 'cg.sunset')

    const storageManager = await (engine.getStore() as unknown as {
      getStorageManager: () => Promise<{ getSnapshot: (id: string) => Promise<{ storeName: string } | undefined> }>
    }).getStorageManager()
    const snapshot = await storageManager.getSnapshot(`${GALLERY_PROFILE_STORE_PREFIX}default`)
    expect(snapshot?.storeName).toBe(`${GALLERY_PROFILE_STORE_PREFIX}default`)

    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Saved line' })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })

    await unlockGalleryEntryWithEngine(engine, 'cg.night')
    await engine.showDialogue({ text: 'Changed line' })
    await engine.quickLoad()

    expect(engine.getViewState().dialogue.text).toBe('Saved line')
    expect(Object.keys(getGalleryProfile(engine).unlockedEntries).sort()).toEqual(['cg.night', 'cg.sunset'])
  })

  it('keeps gallery profiles usable when profile snapshots fail', async () => {
    const engine = createEngine(FailingGalleryProfileBackend)
    engine.use(new GalleryPlugin())

    await expect(engine.init()).resolves.toBeUndefined()
    await registerBaseCatalog(engine)
    await expect(unlockGalleryEntryWithEngine(engine, 'cg.sunset')).resolves.toEqual(expect.objectContaining({
      unlockedEntries: expect.objectContaining({
        'cg.sunset': expect.any(Object),
      }),
    }))

    expect(getGalleryProfile(engine).unlockedEntries['cg.sunset']).toEqual(expect.objectContaining({
      entryId: 'cg.sunset',
    }))
  })

  it('hides locked entry details by default and allows explicit locked presentation details', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()
    await registerGalleryCatalogWithEngine(engine, {
      id: 'spoiler-cg',
      title: 'Spoiler CG',
      entryIds: ['cg.hidden', 'cg.teaser'],
    })
    await registerGalleryEntriesWithEngine(engine, [
      {
        id: 'cg.hidden',
        catalogId: 'spoiler-cg',
        title: 'Final Decision',
        summary: 'The ending branch reveal.',
        description: 'A hidden ending spoiler.',
        thumbnail: assetRef('cg/final-decision.png'),
        tags: ['ending'],
        contents: [{
          id: 'cg.hidden.image',
          kind: 'image',
          asset: assetRef('cg/final-decision.png'),
        }],
      },
      {
        id: 'cg.teaser',
        catalogId: 'spoiler-cg',
        title: 'Route Betrayal',
        summary: 'The hidden route betrays the team.',
        thumbnail: assetRef('cg/route-betrayal.png'),
        tags: ['route'],
        contents: [{
          id: 'cg.teaser.image',
          kind: 'image',
          asset: assetRef('cg/route-betrayal.png'),
        }],
        lockedPresentation: {
          title: 'Unknown Record',
          summary: 'Classified material',
          tags: ['locked'],
        },
      },
    ])

    await openGallerySceneWithEngine(engine, { catalogId: 'spoiler-cg' })

    const hidden = getGalleryProjection(engine).entries.find(entry => entry.id === 'cg.hidden')
    expect(hidden).toEqual(expect.objectContaining({
      unlocked: false,
      title: 'Locked',
      summary: undefined,
      description: undefined,
      thumbnail: undefined,
      tags: undefined,
      contents: [],
    }))

    const teaser = getGalleryProjection(engine).entries.find(entry => entry.id === 'cg.teaser')
    expect(teaser).toEqual(expect.objectContaining({
      unlocked: false,
      title: 'Unknown Record',
      summary: 'Classified material',
      tags: ['locked'],
      contents: [],
    }))

    await unlockGalleryEntryWithEngine(engine, 'cg.hidden')
    const unlocked = getGalleryProjection(engine).entries.find(entry => entry.id === 'cg.hidden')
    expect(unlocked).toEqual(expect.objectContaining({
      unlocked: true,
      title: 'Final Decision',
      summary: 'The ending branch reveal.',
      thumbnail: assetRef('cg/final-decision.png'),
      tags: ['ending'],
      contents: [expect.objectContaining({ id: 'cg.hidden.image' })],
    }))
  })

  it('rejects unknown entry unlocks without writing profile progress', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    await expect(unlockGalleryEntryWithEngine(engine, 'missing.cg')).rejects.toThrow('Gallery entry "missing.cg" is not registered.')
    expect(getGalleryProfile(engine).unlockedEntries).toEqual({})
  })

  it('creates a return checkpoint when opening the gallery scene and jumps back on close', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()
    await registerBaseCatalog(engine)
    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Before gallery' })

    await openGallerySceneWithEngine(engine, {
      catalogId: 'cg',
      entryId: 'cg.sunset',
    })

    const projection = getGalleryProjection(engine)
    expect(engine.getCurrentSceneName()).toBe(GALLERY_SCENE_ID)
    expect(projection.sceneActive).toBe(true)
    expect(projection.returnCheckpointId).toBeTruthy()
    expect(engine.getCheckpoint(projection.returnCheckpointId!)).toBeTruthy()

    await closeGallerySceneWithEngine(engine)

    expect(getGalleryProjection(engine).sceneActive).toBe(false)
    expect(engine.getCurrentSceneName()).toBeUndefined()
    expect(engine.getViewState().dialogue.text).toBe('Before gallery')
  })

  it('keeps gallery interaction working after saving and loading back into the gallery scene', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()
    await registerBaseCatalog(engine)
    await engine.setStoryPoint({ sceneId: 'intro', stepId: 'line-1' })
    await engine.showDialogue({ text: 'Return here' })

    await openGallerySceneWithEngine(engine, {
      catalogId: 'cg',
      entryId: 'cg.sunset',
    })
    await engine.quickSave({}, { preview: { mode: 'disabled' } })

    await engine.quickLoad()
    expect(engine.getCurrentSceneName()).toBe(GALLERY_SCENE_ID)
    expect(getGalleryProjection(engine).sceneActive).toBe(true)

    await emitGalleryRenderToLogic(engine.getPipeline(), GalleryRenderToLogicEvents.SELECT_ENTRY_REQUEST, {
      entryId: 'cg.night',
    })
    expect(getGalleryProjection(engine).selectedEntryId).toBe('cg.night')

    await emitGalleryRenderToLogic(engine.getPipeline(), GalleryRenderToLogicEvents.CLOSE_REQUEST, {})
    expect(getGalleryProjection(engine).sceneActive).toBe(false)
    expect(engine.getViewState().dialogue.text).toBe('Return here')
  })

  it('unlocks gallery entries from story-graph metadata on step completion', async () => {
    const engine = createEngine()
    engine.use(new StoryGraphPlugin())
    engine.use(new GalleryPlugin())
    await engine.init()
    await registerBaseCatalog(engine)
    await engine.setStoryPoint({
      storyId: 'default',
      sceneId: 'beach',
      stepId: 'beach.step',
      contentPackageId: 'runtime.story',
      requiredRuntimePackages: ['runtime.story', 'runtime.gallery-delta'],
    })

    await engine.dialogue([{
      uuid: 'metadata-step',
      run: async ({ engine: runtimeEngine }) => {
        await setStoryMetadataWithEngine(runtimeEngine, {
          storyId: 'default',
          sceneId: 'beach',
          stepId: 'beach.step',
          metadata: {
            gallery: {
              unlock: ['cg.sunset'],
            },
          },
        })
      },
    }])

    expect(getGalleryProfile(engine).unlockedEntries['cg.sunset']).toEqual(expect.objectContaining({
      entryId: 'cg.sunset',
      source: 'metadata',
      contentPackageId: 'runtime.story',
      requiredRuntimePackages: ['runtime.story', 'runtime.gallery-delta'],
    }))
  })

  it('tags runtime-package gallery content, keeps unlock records, and only blocks package unload while the gallery scene is active', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.gallery', async (runtimeEngine) => {
      await registerGalleryCatalogWithEngine(runtimeEngine, {
        id: 'runtime-cg',
        title: 'Runtime CG',
      })
      await registerGalleryEntriesWithEngine(runtimeEngine, [{
        id: 'runtime-cg.sunset',
        catalogId: 'runtime-cg',
        title: 'Runtime Sunset',
        contents: [{
          id: 'sunset-image',
          kind: 'image',
          asset: assetRef('cg/runtime-sunset.png'),
        }],
      }])
    })

    expect(getGalleryProjection(engine).entries).toEqual([])
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual([])

    await openGallerySceneWithEngine(engine, {
      catalogId: 'runtime-cg',
      entryId: 'runtime-cg.sunset',
    })
    await unlockGalleryEntryWithEngine(engine, 'runtime-cg.sunset')
    const registered = getGalleryProjection(engine).entries.find(entry => entry.id === 'runtime-cg.sunset')
    expect(registered).toEqual(expect.objectContaining({
      contentPackageId: 'runtime.gallery',
      requiredRuntimePackages: ['runtime.gallery'],
      contents: [
        expect.objectContaining({
          requiredRuntimePackages: ['runtime.gallery'],
          asset: expect.objectContaining({
            runtimePackageId: 'runtime.gallery',
          }),
        }),
      ],
    }))
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual(['runtime.gallery'])

    await unlockGalleryEntryWithEngine(engine, 'runtime-cg.sunset')
    await closeGallerySceneWithEngine(engine)
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual([])

    await removeRuntimePackageGalleryContentWithEngine(engine, 'runtime.gallery')

    expect(getGalleryProjection(engine).catalogs).toEqual([])
    expect(getGalleryProjection(engine).entries).toEqual([])
    expect(getGalleryProfile(engine).unlockedEntries['runtime-cg.sunset']).toEqual(expect.objectContaining({
      entryId: 'runtime-cg.sunset',
    }))
  })

  it('declares required packages for every active gallery projection item', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    await registerGalleryCatalogWithEngine(engine, {
      id: 'base-cg',
      title: 'Base CG',
      contentPackageId: 'runtime.gallery-base',
    })
    await registerGalleryCatalogWithEngine(engine, {
      id: 'bonus-cg',
      title: 'Bonus CG',
      contentPackageId: 'runtime.gallery-bonus',
    })
    await registerGalleryEntriesWithEngine(engine, [{
      id: 'base-cg.sunrise',
      catalogId: 'base-cg',
      title: 'Base Sunrise',
      contentPackageId: 'runtime.gallery-base',
      contents: [{
        id: 'base-cg.sunrise.image',
        kind: 'image',
        asset: assetRef('cg/base-sunrise.png'),
      }],
    }, {
      id: 'bonus-cg.moon',
      catalogId: 'bonus-cg',
      title: 'Bonus Moon',
      contentPackageId: 'runtime.gallery-bonus',
      contents: [{
        id: 'bonus-cg.moon.image',
        kind: 'image',
        asset: assetRef('cg/bonus-moon.png'),
      }],
    }])

    await openGallerySceneWithEngine(engine, {
      catalogId: 'base-cg',
      entryId: 'base-cg.sunrise',
    })

    const projection = getGalleryProjection(engine)
    expect(projection.filteredEntryIds).toEqual(['base-cg.sunrise'])
    expect(projection.catalogs.map(catalog => catalog.id)).toEqual(['base-cg', 'bonus-cg'])
    expect(projection.entries.map(entry => entry.id)).toEqual(['base-cg.sunrise', 'bonus-cg.moon'])
    expect(projection.requiredRuntimePackages).toEqual([
      'runtime.gallery-base',
      'runtime.gallery-bonus',
    ])
  })

  it('removes gallery content that requires an unloaded runtime package', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    await registerGalleryCatalogWithEngine(engine, {
      id: 'dependent-cg',
      title: 'Dependent CG',
      contentPackageId: 'base.gallery',
      requiredRuntimePackages: ['runtime.gallery-assets'],
    })
    await registerGalleryCatalogWithEngine(engine, {
      id: 'base-cg',
      title: 'Base CG',
      contentPackageId: 'base.gallery',
    })
    await registerGalleryEntriesWithEngine(engine, [{
      id: 'dependent-cg.sunset',
      catalogId: 'dependent-cg',
      title: 'Dependent Sunset',
      contentPackageId: 'base.gallery',
      requiredRuntimePackages: ['runtime.gallery-assets'],
      contents: [{
        id: 'dependent-cg.sunset.image',
        kind: 'image',
        contentPackageId: 'base.gallery',
        requiredRuntimePackages: ['runtime.gallery-assets'],
        asset: assetRef('cg/dependent-sunset.png'),
      }],
    }, {
      id: 'base-cg.sunrise',
      catalogId: 'base-cg',
      title: 'Base Sunrise',
      contentPackageId: 'base.gallery',
      contents: [{
        id: 'base-cg.sunrise.image',
        kind: 'image',
        asset: assetRef('cg/base-sunrise.png'),
      }],
    }])

    await openGallerySceneWithEngine(engine)
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual(expect.arrayContaining(['base.gallery', 'runtime.gallery-assets']))
    expect(getGalleryProjection(engine).requiredRuntimePackages).toHaveLength(2)

    await removeRuntimePackageGalleryContentWithEngine(engine, 'runtime.gallery-assets')

    expect(getGalleryProjection(engine).catalogs).toEqual([
      expect.objectContaining({ id: 'base-cg' }),
    ])
    expect(getGalleryProjection(engine).entries).toEqual([
      expect.objectContaining({ id: 'base-cg.sunrise' }),
    ])
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual(['base.gallery'])
  })

  it('merges current runtime package dependencies for metadata-owned gallery content', async () => {
    const engine = createEngine()
    engine.use(new GalleryPlugin())
    await engine.init()

    await engine.withRuntimePackageContext('runtime.gallery-delta', async (runtimeEngine) => {
      await registerGalleryCatalogWithEngine(runtimeEngine, {
        id: 'base-delta',
        title: 'Base Delta',
        metadata: { contentPackageId: 'base.gallery' },
      })
      await registerGalleryEntriesWithEngine(runtimeEngine, [{
        id: 'base-delta.sunset',
        catalogId: 'base-delta',
        title: 'Base Delta Sunset',
        metadata: { contentPackageId: 'base.gallery' },
        contents: [{
          id: 'base-delta.sunset.image',
          kind: 'image',
          asset: assetRef('cg/base-delta-sunset.png'),
        }],
      }])
    })

    await openGallerySceneWithEngine(engine)
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual(['base.gallery', 'runtime.gallery-delta'])

    await removeRuntimePackageGalleryContentWithEngine(engine, 'runtime.gallery-delta')

    expect(getGalleryProjection(engine).catalogs).toEqual([])
    expect(getGalleryProjection(engine).entries).toEqual([])
    expect(getGalleryProjection(engine).requiredRuntimePackages).toEqual([])
  })
})

async function registerBaseCatalog(engine: QuaEngine): Promise<void> {
  await registerGalleryCatalogWithEngine(engine, {
    id: 'cg',
    title: 'CG',
    entryIds: ['cg.sunset', 'cg.night'],
  })
  await registerGalleryEntriesWithEngine(engine, [
    {
      id: 'cg.sunset',
      catalogId: 'cg',
      title: 'Sunset',
      tags: ['day'],
      contents: [{
        id: 'cg.sunset.image',
        kind: 'image',
        asset: assetRef('cg/sunset.png'),
      }],
    },
    {
      id: 'cg.night',
      catalogId: 'cg',
      title: 'Night',
      tags: ['night'],
      contents: [{
        id: 'cg.night.image',
        kind: 'image',
        asset: assetRef('cg/night.png'),
      }],
    },
  ])
}

function assetRef(name: string): { type: AssetType, name: string } {
  return {
    type: 'images',
    name,
  }
}

function createEngine(backend: typeof MemoryBackend = MemoryBackend): QuaEngine {
  return new QuaEngine({
    assets: {
      adapter: createMemoryAdapter(),
    },
    store: {
      storage: {
        backend,
      },
    },
  })
}

class FailingGalleryProfileBackend extends MemoryBackend {
  override async getSnapshot(id: string) {
    if (id.startsWith(GALLERY_PROFILE_STORE_PREFIX)) {
      throw new Error('gallery profile snapshot unavailable')
    }
    return await super.getSnapshot(id)
  }

  override async saveSnapshot(snapshot: Parameters<MemoryBackend['saveSnapshot']>[0]): Promise<void> {
    if (snapshot.id.startsWith(GALLERY_PROFILE_STORE_PREFIX)) {
      throw new Error('gallery profile snapshot save failed')
    }
    await super.saveSnapshot(snapshot)
  }
}

function createMemoryAdapter(): AssetRuntimeAdapter {
  return {
    name: 'gallery-plugin-test-memory',
    storage: new MemoryAssetStorage(),
    crypto: {
      async sha256() {
        return ''
      },
    },
  }
}
