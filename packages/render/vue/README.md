# @quajs/renderer-vue

Stateless Vue renderer for QuaEngine. The renderer projects view state received from `@quajs/pipeline`; it does not own game state and does not require a browser-local engine.

## Runtime Shape

`QuaRenderer` should be wired with:

- `pipeline`: the only logic/render communication channel.
- `assets`: the browser-side asset runtime used to resolve projected asset names into object URLs.
- `initialView`: optional first-frame projection. Later projection updates should arrive through `LogicToRenderEvents.VIEW_UPDATE`.
- `plugins`: optional renderer feature plugins such as input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, and achievement.

```vue
<template>
  <QuaRenderer
    :pipeline="pipeline"
    :assets="assets"
    :initial-view="initialView"
    :plugins="rendererPlugins"
  />
</template>
```

## Complete Browser Initialization

This example shows the browser renderer talking through a pipeline while loading assets from a CDN or asset server domain.

```ts
// src/main.ts
import type { QuaViewProjection } from '@quajs/render-core'
import { createWebAssetRuntime } from '@quajs/assets-web'
import { Pipeline } from '@quajs/pipeline'
import { createFlowControlProjection } from '@quajs/render-core'
import { QuaRenderer } from '@quajs/renderer-vue'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-vue/plugins/preset'
import { createApp, h } from 'vue'

const ASSET_ORIGIN = import.meta.env.VITE_QUA_ASSET_ORIGIN || 'https://assets.example.com/my-game'
let bootProgress = 0

const assets = await createWebAssetRuntime({
  // loadBundle('main.qpk') resolves to:
  // https://assets.example.com/my-game/bundles/main.qpk
  endpoint: `${ASSET_ORIGIN}/bundles`,
  locale: 'default',
  enableCache: true,
  web: {
    databaseName: 'MyGameAssets',
  },
  initialBundles: ['main.qpk', 'shared.qpk'],
  onProgress: ({ bundleIndex, bundleCount, progress }) => {
    bootProgress = (bundleIndex + progress) / bundleCount
  },
})

const pipeline = new Pipeline({
  // Install your transport plugin here when the engine runs elsewhere,
  // for example a WebSocket/SSE bridge that forwards pipeline events.
  plugins: [],
})

const initialView: QuaViewProjection = {
  characters: [],
  dialogue: { visible: false, text: '' },
  choices: [],
  ui: { visible: true },
  flowControl: createFlowControlProjection(),
  effects: [],
  animations: [],
  plugins: {
    audio: {
      revision: 0,
      unlocked: false,
      buses: {
        master: { gainDb: 0 },
        bgm: { gainDb: 0 },
        voice: { gainDb: 0 },
        sfx: { gainDb: 0 },
        ambient: { gainDb: 0 },
      },
      voices: [],
      sfx: [],
      ambients: [],
    },
  },
}

createApp({
  render: () => h(QuaRenderer, {
    pipeline,
    assets,
    initialView,
    plugins: createVisualNovelRendererPlugins(),
  }),
}).mount('#app')
```

With this setup, projected asset names are looked up from the loaded bundles:

```ts
const projectedView = {
  background: { mode: 'image', assetName: 'classroom.png' },
  characters: [{ id: 'Alice', name: 'Alice', visible: true, sprite: 'alice.png' }]
}
```

The Vue renderer asks `assets.getAsset('images', 'classroom.png')` or `assets.getAsset('characters', 'alice.png')`, creates browser object URLs, and revokes them on cleanup.

## Feature Plugin Subentries

Vue feature subentries adapt the shared `@quajs/renderer-web/plugins/*` projection layers and add Vue component/composable ergonomics where needed.

Available entries:

- `@quajs/renderer-vue/plugins/achievement`
- `@quajs/renderer-vue/plugins/audio`
- `@quajs/renderer-vue/plugins/background`
- `@quajs/renderer-vue/plugins/backlog`
- `@quajs/renderer-vue/plugins/character`
- `@quajs/renderer-vue/plugins/choices`
- `@quajs/renderer-vue/plugins/core`
- `@quajs/renderer-vue/plugins/dialogue`
- `@quajs/renderer-vue/plugins/effects`
- `@quajs/renderer-vue/plugins/fonts`
- `@quajs/renderer-vue/plugins/gallery`
- `@quajs/renderer-vue/plugins/input`
- `@quajs/renderer-vue/plugins/preset`
- `@quajs/renderer-vue/plugins/scene`
- `@quajs/renderer-vue/plugins/settings`
- `@quajs/renderer-vue/plugins/sprite`
- `@quajs/renderer-vue/plugins/ui`

The visual novel preset order is:

`input`, `fonts`, `background`, `sprite`, `character`, `effects`, `dialogue`, `choices`, `audio`, `scene`, `ui`, `settings`, `backlog`, `gallery`, `achievement`.

## Input

The default visual novel preset includes `@quajs/renderer-vue/plugins/input`, which is a thin adapter over `@quajs/renderer-web/plugins/input`. It maps keyboard, pointer, and gamepad input to semantic renderer commands, emits `RenderToLogicEvents.USER_INPUT_COMMAND`, and then calls existing intent actions such as `USER_ADVANCE` or flow-control requests. It does not store game state or decide progression.

Disable or customize it through the preset option:

```ts
const plugins = createVisualNovelRendererPlugins({
  input: {
    gamepad: false,
    bindings: [
      { source: 'keyboard', code: 'KeyN', command: 'advance', preventDefault: true },
    ],
  },
})

const pluginsWithoutInput = createVisualNovelRendererPlugins({ input: false })
```

Pointer advance is filtered for buttons, form controls, choices, overlays, settings, backlog, and elements marked with `data-qua-input-ignore`. Pointer payload metadata is converted into logical stage coordinates by the shared Web renderer helpers.

## Settings Forms

`@quajs/renderer-vue/plugins/settings` renders the `@quajs/plugin-settings` projection as a schema-driven settings panel. It consumes `view.plugins.settings`, uses the projected JSON Schema plus UI hints to create controls, and emits `settings/update_request`, `settings/reset_scope_request`, and `settings/reset_all_request` through the shared pipeline. The default visual novel preset includes this plugin; open the generic `settings` overlay through the UI overlay flow to show it.

The default form uses native browser controls with stable semantic hooks: `.qua-settings-field-main`, `.qua-settings-field-copy`, `.qua-settings-field-control`, `.qua-settings-control`, and `data-settings-control/type/readonly/invalid` attributes on fields. Vue apps can replace individual pieces with slots on `QuaSettingsLayer` or `QuaSettingsForm`: `form-header`, `form-actions`, `scope`, `scope-header`, `group`, `group-header`, `field`, `field-label`, `field-description`, `field-control`, `field-errors`, and `control`. Slot payloads expose projections and intent helpers such as `update`, `resetScope`, `resetAll`, and `close`; renderers still emit intents only and do not own settings state. Framework component libraries such as Reka UI, Radix Vue, or project-local design-system controls should be mounted through these slots or `customControls` instead of becoming hard dependencies of the renderer package.

## Stage And Background Projection

`QuaRenderer` and `QuaStage` include the functional adaptive aspect-interval stage structure. Optional SCSS entrypoints remain visual styling only; they are not required for positioning, scaling, or clipping the stage.

`QuaStage` reuses the Web renderer plane helpers:

- `.qua-stage-scene` wraps camera-transformed scene projection.
- `.qua-stage-scene-content` renders full-bleed background and scene art.
- `.qua-stage-subject` renders foreground subject content such as characters. Default character staging uses the resolved safe-area center, while explicit `x/y` remain logical stage coordinates and explicit percent fields remain percent-based authoring values.
- `.qua-stage-plane` renders full-stage effects and transitions outside camera motion.
- `.qua-stage-safe` renders dialogue, choices, backlog, and UI overlays inside `ResolvedStageLayout.safeArea`.

Default landscape layout adapts from 16:10 to 16:9. Default portrait layout uses a 9:19.5 phone reference and adapts from 9:21 to 9:16 so common mobile screens can fill without black bars.

Background components reuse `@quajs/renderer-web` projection helpers, so image, video, and layered backgrounds share fit, origin, transform, opacity, blend, filter, and mask semantics with the native DOM renderer.

Vue renderer code should reuse `@quajs/renderer-web` layout, coordinate, and viewport environment helpers through `QuaStage` and shared composables instead of duplicating viewport or pointer math.

`QuaStage` also forwards mobile CSS safe-area insets and `devicePixelRatio` into the shared Web layout resolver. These values affect exported safe-area variables and physical-pixel metadata only; DOM projection still uses CSS pixels.

See `docs/design/mobile-rendering-adaptation.md` and `docs/design/background-composition-animation.md` for the full cross-package design.

## Progressive Bundles

The first required bundle(s) can be loaded during startup, and later bundles can arrive on demand with the same `loadBundle()` API:

```ts
let chapterProgress = 0

await assets.loadBundle('chapter-2.qpk', {
  onProgress: (loaded, total) => {
    chapterProgress = total > 0 ? loaded / total : 0
  },
})
```

## Dev Mode With Vite

For local development, prefer the Vite asset VFS helper:

```ts
import { createViteDevAssetRuntime } from '@quajs/assets-web'

const assets = await createViteDevAssetRuntime({
  hmr: import.meta.hot,
  web: {
    databaseName: 'MyGameAssets',
  },
})
```

The Vite plugin at `@quajs/vite-plugin` mounts the dev asset route and forwards file changes as `qua-assets:update`. `QuaRenderer` listens to the local `assets` runtime's `asset:changed` event, so changed images/audio reload without a browser refresh.

## Audio Autoplay

The Vue audio plugin delegates playback to `@quajs/renderer-web/audio`. It attempts WebAudio unlock automatically when `view.plugins.audio` contains a playing BGM, voice, SFX, or ambient projection. If the browser blocks autoplay, playback stays pending without emitting an engine audio error and resumes after the next configured user activation event.

Use `createAudioRendererPlugin({ autoUnlock: false })` to disable the automatic attempt, or pass `unlockEvents` to customize the gesture events.

In `vite.config.ts`:

```ts
import { quaEngine } from '@quajs/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    ...quaEngine({
      assetBundling: {
        source: 'assets',
        devVfs: true,
        devVfsBase: '/@qua-assets',
      },
    }),
  ],
})
```

## Manifest/Loose Asset Domain

If your browser renderer should load loose files from an asset manifest instead of a bundled `.qpk`, configure a provider domain:

```ts
import { createDevVfsProvider, createWebAssetRuntime } from '@quajs/assets-web'

const ASSET_ORIGIN = 'https://assets.example.com/my-game'

const assets = await createWebAssetRuntime({
  provider: createDevVfsProvider({
    // Must return an AssetManifest JSON object.
    manifestUrl: `${ASSET_ORIGIN}/manifest.json`,
    // Relative record.path values in the manifest are resolved under this base URL.
    assetBaseUrl: `${ASSET_ORIGIN}/files/`,
  }),
  locale: 'default',
  web: {
    databaseName: 'MyGameAssets',
  },
})
```

Example manifest:

```json
{
  "version": "1",
  "provider": "cdn",
  "assets": [
    {
      "id": "cdn:default:images:classroom.png",
      "bundleName": "cdn",
      "name": "classroom.png",
      "type": "images",
      "locale": "default",
      "path": "images/classroom.png",
      "mimeType": "image/png"
    },
    {
      "id": "cdn:default:characters:alice.png",
      "bundleName": "cdn",
      "name": "alice.png",
      "type": "characters",
      "locale": "default",
      "path": "characters/alice.png",
      "mimeType": "image/png"
    }
  ]
}
```

Absolute `path` values such as `https://cdn.example.com/assets/bg.png` are used directly. Relative `path` values are resolved against `assetBaseUrl`.

## Low-Level Asset API

If you need manual lifecycle control, bypass `createWebAssetRuntime()` and use the lower-level runtime calls directly:

```ts
import { createWebAssets } from '@quajs/assets-web'

let bootProgress = 0

const assets = createWebAssets({
  endpoint: 'https://assets.example.com/my-game/bundles',
  web: { databaseName: 'MyGameAssets' },
})

await assets.initialize()
await assets.loadBundle('main.qpk', {
  onProgress: (loaded, total) => {
    bootProgress = total > 0 ? loaded / total : 0
  },
})
```

`initialize()` opens browser storage, initializes the active provider, and starts provider watchers. Most app code should use `createWebAssetRuntime()` or `createViteDevAssetRuntime()` instead, so you do not need to manage initialization yourself.

## Remote Engine Flow

When the engine runs on a server, the browser should only host renderer-side services:

```ts
const pipeline = new Pipeline({
  plugins: [
    // Your pipeline transport plugin forwards:
    // - logic -> render events, especially LogicToRenderEvents.VIEW_UPDATE
    // - render -> logic intents, such as RenderToLogicEvents.USER_ADVANCE
  ],
})
```

The browser renderer receives full view projections from pipeline events and never reads or mutates engine/store state directly.

## CORS Notes

Asset domains must allow browser fetches from the renderer origin. At minimum, configure the asset server with an `Access-Control-Allow-Origin` policy that includes your game site. If you use credentials, configure `Access-Control-Allow-Credentials` and a custom `fetcher` in `createWebAssets({ web: { fetcher } })`.

```ts
const assets = createWebAssets({
  endpoint: 'https://assets.example.com/my-game/bundles',
  web: {
    fetcher: (url, init) => fetch(url, { ...init, credentials: 'include' }),
  },
})
```

## Styles

The renderer does not auto-import visual CSS. Import optional styles explicitly:

```ts
import '@quajs/renderer-vue/styles/base.scss'
import '@quajs/renderer-vue/styles/default.scss'
```
