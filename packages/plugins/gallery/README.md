# @quajs/plugin-gallery

Gallery plugin for QuaEngine. It provides gallery catalog/entry definitions, profile-persistent unlock state, filtering, and a reserved gallery scene shell.

The plugin owns unlock state and scene projection. Renderer plugins render the gallery surface and emit selection/filter/close requests through pipeline events.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { GalleryPlugin } from '@quajs/plugin-gallery'

const engine = new QuaEngine()

engine.use(new GalleryPlugin({
  profileId: 'default',
}))
```

Renderer entries:

- `@quajs/renderer-web/plugins/gallery`
- `@quajs/renderer-vue/plugins/gallery`

## Register Catalogs And Entries

```ts
import {
  registerGalleryCatalogWithEngine,
  registerGalleryEntryWithEngine,
} from '@quajs/plugin-gallery'

await registerGalleryCatalogWithEngine(engine, {
  id: 'main-cg',
  title: 'Main CG',
  summary: 'Story illustrations',
})

await registerGalleryEntryWithEngine(engine, {
  id: 'cg/unit7-arrival',
  catalogId: 'main-cg',
  title: 'Unit-7 Arrival',
  thumbnail: { type: 'images', name: 'cg/unit7-arrival-thumb.jpg' },
  contents: [{
    id: 'image',
    kind: 'image',
    asset: { type: 'images', name: 'cg/unit7-arrival.jpg' },
  }],
})
```

Content blocks can be `image`, `video`, `audio`, `text`, or custom kinds with serializable data.

## Unlock And Open

```ts
import {
  getGalleryProfile,
  getGalleryProjection,
  openGallerySceneWithEngine,
  unlockGalleryEntryWithEngine,
} from '@quajs/plugin-gallery'

await unlockGalleryEntryWithEngine(engine, 'cg/unit7-arrival', {
  source: 'story',
})

await openGallerySceneWithEngine(engine, {
  catalogId: 'main-cg',
  entryId: 'cg/unit7-arrival',
})

const profile = getGalleryProfile(engine)
const projection = getGalleryProjection(engine)
```

## State Model

- Definitions live in plugin runtime state.
- Unlock state lives in `QuaStore` profile snapshots using `@quajs/plugin-gallery:profile:<profileId>`.
- Profile unlocks are independent from story save/load and rollback.
- Runtime package unload removes definitions owned by the package and rebuilds projection.

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-gallery/script-compiler`.

```qs
@UnlockGallery('cg/unit7-arrival')
Narrator: The recovered image is added to the archive.

@OpenGalleryScene({ catalogId: 'main-cg' })
Narrator: The gallery opens.
```

## Settings

When `@quajs/plugin-settings` is installed, gallery contributes developer/player settings used by its profile and scene projection.

## Renderer Boundary

Renderer components do not decide unlock state. They receive `GalleryProjection`, render locked/unlocked entries, and emit selection or filter intents.
