# @quajs/renderer-react

Stateless React renderer adapter for QuaEngine. It mounts the shared `@quajs/renderer-web` DOM host, projects engine-owned view snapshots into React context/hooks, and emits user intents through `@quajs/pipeline`.

React code may own refs, portals, hook state, and cleanup handles. It must not own narrative, save/load, inventory, settings, audio, or progression state.

## Basic Usage

```tsx
import { QuaRenderer } from '@quajs/renderer-react'
import { createVisualNovelRendererPlugins } from '@quajs/renderer-react/plugins/preset'

export function App({ engine, assets }) {
  return (
    <QuaRenderer
      pipeline={engine.getPipeline()}
      assets={assets}
      initialView={engine.getViewState()}
      plugins={createVisualNovelRendererPlugins()}
    />
  )
}
```

## Hooks

```tsx
import {
  useQuaRenderer,
  useQuaRendererSnapshot,
  useQuaView,
  useRendererActions,
} from '@quajs/renderer-react'

function Overlay() {
  const view = useQuaView()
  const actions = useRendererActions()
  const snapshot = useQuaRendererSnapshot()
  const context = useQuaRenderer()

  return <button onClick={() => actions?.advance()}>Advance</button>
}
```

Hooks expose readonly projections and renderer intent actions only.

## Children Slot

`QuaRenderer` can portal React children into a Web renderer stage plane. The default plane is `safe`.

```tsx
<QuaRenderer
  pipeline={pipeline}
  assets={assets}
  plugins={createVisualNovelRendererPlugins()}
>
  {({ view, actions }) => (
    <button data-qua-input-ignore onClick={() => actions.requestUiOpen('menu')}>
      Menu
    </button>
  )}
</QuaRenderer>
```

Use `childrenPlane="scene" | "subject" | "plane" | "safe"` when a child must mount into a specific stage plane.

## Feature Plugin Subentries

React feature subentries are thin wrappers over `@quajs/renderer-web/plugins/*`. They rename plugin ids to `@quajs/renderer-react/<feature>` and re-export Web projection model helpers.

Available entries:

- `@quajs/renderer-react/plugins/achievement`
- `@quajs/renderer-react/plugins/audio`
- `@quajs/renderer-react/plugins/background`
- `@quajs/renderer-react/plugins/backlog`
- `@quajs/renderer-react/plugins/character`
- `@quajs/renderer-react/plugins/choices`
- `@quajs/renderer-react/plugins/core`
- `@quajs/renderer-react/plugins/dialogue`
- `@quajs/renderer-react/plugins/effects`
- `@quajs/renderer-react/plugins/fonts`
- `@quajs/renderer-react/plugins/gallery`
- `@quajs/renderer-react/plugins/input`
- `@quajs/renderer-react/plugins/preset`
- `@quajs/renderer-react/plugins/scene`
- `@quajs/renderer-react/plugins/settings`
- `@quajs/renderer-react/plugins/sprite`
- `@quajs/renderer-react/plugins/ui`

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

## Runtime Boundaries

- Shared DOM layout, object URL handling, animation projection, and WebAudio behavior stay in `@quajs/renderer-web`.
- React subentries should not duplicate Web runtime behavior.
- Renderer plugins may manage transient DOM resources but must not become authoritative state owners.
