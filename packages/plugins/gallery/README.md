# @quajs/plugin-gallery

Gallery plugin for QuaEngine. It provides gallery catalog/entry definitions, profile-persistent unlock state, filtering, and a reserved gallery scene shell.

The plugin owns unlock state and scene projection. Renderer plugins render the gallery surface and emit selection/filter/close requests through pipeline events.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { GalleryPlugin } from '@quajs/plugin-gallery'

const engine = new QuaEngine()
const gallery = new GalleryPlugin({
  profileId: 'default',
})

engine.use(gallery)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/gallery`
- `@quajs/renderer-vue/plugins/gallery`
- `@quajs/renderer-react/plugins/gallery`
- `@quajs/renderer-svelte/plugins/gallery`
- `@quajs/renderer-cocos/plugins/gallery`

## Register Catalogs And Entries

```ts
await gallery.registerCatalog({
  id: 'main-cg',
  title: 'Main CG',
  summary: 'Story illustrations',
})

await gallery.registerEntry({
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

Locked entries hide title, summary, description, thumbnail, tags, metadata, and contents by default in projection to avoid spoilers. Use `lockedPresentation` only for deliberate non-spoiler placeholders or explicit reveal flags. Renderer projections expose only the resolved entry fields; `lockedPresentation` remains definition-only.

## Unlock And Open

```ts
await gallery.unlockEntry('cg/unit7-arrival', {
  source: 'story',
})

await gallery.openScene({
  catalogId: 'main-cg',
  entryId: 'cg/unit7-arrival',
})

const profile = gallery.getProfile()
const projection = gallery.getProjection()
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

Renderer components do not decide unlock state. They receive `GalleryProjection`, render locked/unlocked entries, and emit selection or filter intents. Lightbox/detail browsing is renderer-local and transient across Web/Vue/React/Svelte/Cocos.
