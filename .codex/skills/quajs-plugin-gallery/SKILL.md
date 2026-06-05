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
- `@quajs/renderer-react/plugins/gallery`
- `@quajs/renderer-svelte/plugins/gallery`
- `@quajs/renderer-cocos/plugins/gallery`

Web, React, and Svelte use the shared `@quajs/renderer-web/plugins/gallery` DOM implementation through thin framework adapters. Vue provides framework components over the same projection helpers. Cocos projects the same gallery intents and transient browsing affordances, including lightbox preview, through native host nodes.

Compiler lowering exports such as `scriptCompiler` and `createGalleryDecoratorCompiler` belong only to `@quajs/plugin-gallery/script-compiler`. Do not re-export or import them from the runtime root, because apps that only need `GalleryPlugin` must not load Babel/compiler dependencies.

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

Locked entries hide title, summary, description, thumbnail, tags, metadata, and contents by default in projection to avoid spoilers. Use `lockedPresentation` only for deliberate non-spoiler placeholders or opt-in reveals. Renderer projections expose only the resolved entry fields; `lockedPresentation` remains definition-only and must not be projected. If `lockedPresentation` projects safe thumbnails or contents, renderers may show detail/lightbox from those projected fields even while `unlocked` is false:

```ts
await gallery.registerEntry({
  id: 'cg/ending',
  catalogId: 'main-cg',
  title: 'True Ending',
  thumbnail: { type: 'images', name: 'cg/true-ending.jpg' },
  contents: [{ id: 'image', kind: 'image', asset: { type: 'images', name: 'cg/true-ending.jpg' } }],
  lockedPresentation: {
    title: 'Locked Record',
    summary: 'Clear the route to unlock.',
    tags: ['locked'],
  },
})
```

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

Renderer components receive `GalleryProjection`, render locked/unlocked entries, and emit selection/filter/close intents. They must not decide unlock state. Lightbox/detail browsing state is renderer-local and transient only across Web/Vue/React/Svelte/Cocos; locked entries should render the projection they receive, including projected safe locked content, and must not reconstruct hidden definition details.

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
- Do locked entries avoid projecting spoiler details unless `lockedPresentation` explicitly reveals them?
- Does save/load avoid restoring profile unlock state?
- Are gallery asset refs package-aware?
- Does renderer emit intents rather than owning unlock/filter authority?
- If gallery API, decorator, settings, or projection behavior changed, was this skill updated?
