import type { AssetRuntimeAdapter, AssetType } from '@quajs/assets'
import { MemoryAssetStorage } from '@quajs/assets'
import { QuaEngine } from '@quajs/engine'
import { MemoryBackend } from '@quajs/store'
import { StoryGraphPlugin, setStoryMetadataWithEngine } from '@quajs/story-graph'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeGallerySceneWithEngine,
  emitGalleryRenderToLogic,
  GALLERY_PLUGIN_ID,
  GALLERY_PROFILE_STORE_PREFIX,
  GALLERY_SCENE_ID,
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
  })
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
