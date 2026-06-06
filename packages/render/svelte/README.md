# @quajs/renderer-svelte

Stateless Svelte renderer adapter for QuaEngine. It mounts the shared `@quajs/renderer-web` DOM host through a Svelte action, exposes Svelte stores for renderer snapshots, and emits user intents through `@quajs/pipeline`.

Svelte code may own DOM actions, stores, component refs, and cleanup handles. It must not own narrative, save/load, inventory, settings, audio, or progression state.

## Basic Usage

```svelte
<script lang="ts">
  import { quaRenderer } from '@quajs/renderer-svelte'
  import { createVisualNovelRendererPlugins } from '@quajs/renderer-svelte/plugins/preset'

  export let engine
  export let assets

  const options = {
    pipeline: engine.getPipeline(),
    assets,
    initialView: engine.getViewState(),
    plugins: createVisualNovelRendererPlugins(),
  }
</script>

<div use:quaRenderer={options}></div>
```

## Host And Stores

```ts
import {
  createQuaRendererHost,
  createQuaRendererStore,
} from '@quajs/renderer-svelte'

const host = createQuaRendererHost(container, {
  pipeline,
  assets,
  plugins: createVisualNovelRendererPlugins(),
})

await host.mount()

const snapshot = createQuaRendererStore(host)
```

The store exposes framework-neutral `@quajs/renderer-web` snapshots. Use it for readonly UI projection and route mutations through renderer actions or pipeline intents.

## Feature Plugin Subentries

Svelte feature subentries are thin wrappers over `@quajs/renderer-web/plugins/*`. They rename plugin ids to `@quajs/renderer-svelte/<feature>` and re-export Web projection model helpers.

Available entries:

- `@quajs/renderer-svelte/plugins/achievement`
- `@quajs/renderer-svelte/plugins/audio`
- `@quajs/renderer-svelte/plugins/background`
- `@quajs/renderer-svelte/plugins/backlog`
- `@quajs/renderer-svelte/plugins/character`
- `@quajs/renderer-svelte/plugins/choices`
- `@quajs/renderer-svelte/plugins/core`
- `@quajs/renderer-svelte/plugins/dialogue`
- `@quajs/renderer-svelte/plugins/effects`
- `@quajs/renderer-svelte/plugins/fonts`
- `@quajs/renderer-svelte/plugins/gallery`
- `@quajs/renderer-svelte/plugins/input`
- `@quajs/renderer-svelte/plugins/shared`
- `@quajs/renderer-svelte/plugins/preset`
- `@quajs/renderer-svelte/plugins/scene`
- `@quajs/renderer-svelte/plugins/settings`
- `@quajs/renderer-svelte/plugins/sprite`
- `@quajs/renderer-svelte/plugins/ui`
- `@quajs/renderer-svelte/save-preview`

`plugins/shared` and `save-preview` re-export the shared Web helper APIs under the Svelte package name. The DOM host already installs Web save-preview capture automatically.

## Preset Order

`createVisualNovelRendererPlugins()` composes the same feature order as Vue and Web:

`input`, `fonts`, `background`, `sprite`, `character`, `effects`, `dialogue`, `choices`, `audio`, `scene`, `ui`, `settings`, `backlog`, `gallery`, `achievement`.

Disable input with:

```ts
const plugins = createVisualNovelRendererPlugins({ input: false })
```

Or customize it:

```ts
const plugins = createVisualNovelRendererPlugins({
  input: {
    gamepad: false,
    bindings: [
      { source: 'keyboard', code: 'KeyN', command: 'advance', preventDefault: true },
    ],
  },
})
```

Render-only UI overlays can register Svelte-style factories through the `ui.renderOnlySurfaces` preset option. The engine opens them with `showUI()` using `renderMode: 'render-only'` and a serializable `surface.key`; the factory receives the root `HTMLElement` plus projection context and can return a `destroy` cleanup.

## Runtime Boundaries

- Shared DOM layout, object URL handling, animation projection, and WebAudio behavior stay in `@quajs/renderer-web`.
- Svelte subentries should not duplicate Web runtime behavior.
- Renderer plugins may manage transient DOM resources but must not become authoritative state owners.
