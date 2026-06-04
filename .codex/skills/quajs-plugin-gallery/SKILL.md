---
name: quajs-plugin-gallery
description: Use, document, or modify @quajs/plugin-gallery. Covers gallery catalogs, entries, profile unlock state, reserved gallery scene, renderer intents, QuaScript gallery decorators, settings, runtime package provenance, and validation.
---

# @quajs/plugin-gallery

Use this skill for `packages/plugins/gallery`, gallery catalog/profile behavior, gallery renderer entries, gallery scene shell, or gallery QuaScript decorators.

## Responsibility

`@quajs/plugin-gallery` owns gallery catalog/entry definitions, profile-persistent unlock state, filtering, and the reserved gallery scene shell. Renderer plugins render projection and emit selection/filter/close intents.

Unlock state is profile-level and independent from story save/load and rollback.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { GalleryPlugin } from '@quajs/plugin-gallery'

const engine = new QuaEngine()
const gallery = new GalleryPlugin({ profileId: 'default' })

engine.use(gallery)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/gallery`
- `@quajs/renderer-vue/plugins/gallery`
- `@quajs/renderer-cocos/plugins/gallery`

## Register Content

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

## Runtime API

```ts
await gallery.unlockEntry('cg/unit7-arrival', { source: 'story' })
await gallery.openScene({ catalogId: 'main-cg', entryId: 'cg/unit7-arrival' })

const profile = gallery.getProfile()
const projection = gallery.getProjection()
```

Runtime package unload removes definitions owned by the package and rebuilds projection while preserving profile records.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-gallery/script-compiler`.

```qs
@UnlockGallery('cg/unit7-arrival')
Narrator: The recovered image is added to the archive.

@OpenGalleryScene({ catalogId: 'main-cg' })
Narrator: The gallery opens.
```

Decorators:

- `@UnlockGallery(entryIdOrIds, options?)`
- `@OpenGalleryScene(options?)`

## Renderer Boundary

Renderer components receive `GalleryProjection`, render locked/unlocked entries, and emit selection/filter/close intents. They must not decide unlock state.

## Settings

When `@quajs/plugin-settings` is installed, gallery contributes developer/player settings used by profile and scene projection.

## Validation

```bash
pnpm --filter @quajs/plugin-gallery test -- --run
pnpm --filter @quajs/plugin-gallery typecheck
pnpm --filter @quajs/plugin-gallery build
```

Run achievement tests when gallery reward/condition integration changes.

## Review Checklist

- Are definitions separate from profile unlock records?
- Does save/load avoid restoring profile unlock state?
- Are gallery asset refs package-aware?
- Does renderer emit intents rather than owning unlock/filter authority?
- If gallery API, decorator, settings, or projection behavior changed, was this skill updated?
