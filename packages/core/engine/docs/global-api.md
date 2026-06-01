# Global API Reference

The global API provides a convenient way to interact with the QuaEngine without directly managing engine instances. All functions operate on a singleton engine instance that must be initialized before use.

## Initialization

### `initEngine(config?: any): Promise<void>`

Initializes the global QuaEngine instance with optional configuration.

**Parameters:**

- `config` (optional): Configuration object for the engine

**Returns:** Promise that resolves when initialization is complete

**Example:**

```typescript
import { initEngine } from '@quajs/engine'

await initEngine({
  // engine configuration
})
```

## Scene Management

### `loadScene(scene: Scene, transition?: SceneTransitionOptions): Promise<void>`

Loads and activates a new scene in the game.

**Parameters:**

- `scene`: Scene object containing scene data and configuration
- `transition` (optional): Scene transition intent. Set `waitForRenderer: true` to wait for a renderer `scene/ready` acknowledgement before running the scene.

**Returns:** Promise that resolves when the scene is loaded

**Example:**

```typescript
import { loadScene } from '@quajs/engine'

await loadScene({
  id: 'scene1',
  name: 'Opening Scene',
  // scene configuration
})
```

### `getCurrentSceneName(): string | undefined`

Gets the name of the currently active scene.

**Returns:** Current scene name or undefined if no scene is loaded

## Dialogue System

### `dialogue(steps: GameStep[]): Promise<void>`

Executes a sequence of dialogue steps.

**Parameters:**

- `steps`: Array of GameStep objects representing the dialogue sequence

**Returns:** Promise that resolves when the dialogue sequence completes

**Example:**

```typescript
import { dialogue } from '@quajs/engine'

await dialogue([
  {
    type: 'dialogue',
    character: 'protagonist',
    text: 'Hello world!',
  },
])
```

### `rewind(stepUUID: string): Promise<void>`

Rewinds the game state to a specific step.

**Parameters:**

- `stepUUID`: Unique identifier of the step to rewind to

**Returns:** Promise that resolves when rewind is complete

### `getCurrentStepId(): string | undefined`

Gets the ID of the current dialogue step.

**Returns:** Current step ID or undefined if no step is active

## Flow Control

Flow control is engine-owned narrative execution behavior. Renderers may request modes through `@quajs/pipeline`, but skip, fast-forward, and auto-advance decisions are resolved by engine state.

### `setFlowControlMode(mode: 'normal' | 'auto' | 'skip' | 'fast-forward'): Promise<void>`

Sets the active flow mode. `skip`, `fast-forward`, and `auto` synthesize `user/advance` only when the current flow policy allows it.

### `setFlowControlPolicy(policy: FlowControlPolicy): Promise<void>`

Sets per-segment flow policy.

```typescript
await setFlowControlPolicy({
  skippable: false,
  fastForwardable: false,
})
```

### `setFlowControlOptions(options: FlowControlRuntimeOptions): Promise<void>`

Sets engine-level flow control options such as `skipMode` and auto-advance timing. `skipMode: 'read'` only skips previously advanced story points; `skipMode: 'all'` skips any skippable segment.

QuaScript supports flow control decorators:

```typescript
qs`
@Skippable(false)
@NoSkip
@Forwardable(false)
@NoForward
Alice: This line cannot be skipped or fast-forwarded.

@ResetFlowControlPolicy
Alice: Flow control policy resets here.
`
```

## Audio Plugin

Audio playback is no longer an engine-core API. Engine state only carries the plugin projection lane under `view.plugins.audio`, while real Web decoding and playback live in `@quajs/renderer-web/audio` and framework adapters such as `@quajs/renderer-vue/plugins/audio`, `@quajs/renderer-react/plugins/audio`, and `@quajs/renderer-svelte/plugins/audio`.

For chapter-aware BGM, voice playback, SFX, and ambient audio, use `@quajs/plugin-audio` decorators and helpers such as `@AudioChapter`, `@PlayVoice`, `@PlayBGM`, `@PlaySFX`, `@PlayAmbient`, `@SetAudioGain`, and `@SetAudioAutomation`.

**Example:**

```typescript
import { setPluginProjection } from '@quajs/engine'

await setPluginProjection('audio', {
  revision: 1,
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
})
```

## Story Graph And Chapter Select

Story graph behavior is provided by `@quajs/story-graph`, not engine core. Use it for route/lane/timeline metadata, story events, jump resolution, node unlock state, and chapter select projection.

```typescript
import {
  StoryGraphPlugin,
  getStoryChapterSelectProjection,
  jumpToChapterSelectNodeWithEngine,
} from '@quajs/story-graph'

engine.use(new StoryGraphPlugin())

const chapterSelect = getStoryChapterSelectProjection(engine)
await jumpToChapterSelectNodeWithEngine(engine, 'opening')
```

Chapter select is derived from graph nodes marked with `chapterSelect` plus `unlockedNodes`; it is not an engine-core UI.

## Inventory Plugin

Inventory behavior is provided by `@quajs/plugin-inventory`, not engine core. It stores item definitions in plugin runtime state and profile quantities in `QuaStore` profile snapshots that do not roll back with story saves.

```typescript
import {
  InventoryPlugin,
  grantInventoryItemWithEngine,
  registerInventoryItemWithEngine,
} from '@quajs/plugin-inventory'

engine.use(new InventoryPlugin())

await registerInventoryItemWithEngine(engine, { id: 'old-key', title: 'Old Key' })
await grantInventoryItemWithEngine(engine, 'old-key')
```

## Save System

### `saveToSlot(slotId: string, metadata?: SaveMetadata, options?: SaveToSlotOptions): Promise<void>`

Saves the current game state to a specific save slot.

**Parameters:**

- `slotId`: Unique identifier for the save slot
- `metadata` (optional): Save file metadata including:
  - `name?: string` - Display name for the save
  - `sceneName?: string` - Current scene name
  - `stepId?: string` - Current step ID
  - `playtime?: number` - Total playtime in milliseconds
  - `[key: string]: unknown` - Additional custom metadata
- `options` (optional): Save behavior overrides including:
  - `reason?: 'save' | 'quickSave' | 'autoSave'`
  - `preview?: { mode?: 'disabled' | 'provided' | 'renderer-capture'; transaction?: 'sync' | 'async-clone'; policy?: { uiMode?: 'full' | 'hide-overlays' | 'scene-only' | 'custom'; format?: 'image/webp' | 'image/png' | 'image/jpeg'; quality?: number; maxWidth?: number; maxHeight?: number; pixelRatio?: number; background?: string | null; timeoutMs?: number }; image?: { kind: 'bytes' | 'data-url'; ... } }`

**Returns:** Promise that resolves when save is complete

**Example:**

```typescript
import { saveToSlot } from '@quajs/engine'

await saveToSlot('slot1', {
  name: 'Chapter 1 Complete',
  playtime: 3600000, // 1 hour
  sceneName: 'ending_scene',
}, {
  preview: {
    mode: 'renderer-capture',
    transaction: 'sync',
    policy: {
      uiMode: 'hide-overlays',
      format: 'image/webp',
      maxWidth: 480,
    },
  },
})
```

### `loadFromSlot(slotId: string, options?: LoadOptions): Promise<void>`

Loads a game state from a save slot.

**Parameters:**

- `slotId`: Unique identifier for the save slot to load
- `options` (optional): Loading options
  - `force?: boolean` - Force load even if validation fails

**Returns:** Promise that resolves when load is complete

**Example:**

```typescript
import { loadFromSlot } from '@quajs/engine'

await loadFromSlot('slot1', { force: false })
```

## Asset Management

### `getAssetMetadata(type: AssetType, assetName: string): Promise<any>`

Retrieves metadata for a specific asset.

**Parameters:**

- `type`: Asset type ('audio', 'images', 'characters', 'scripts', 'data')
- `assetName`: Name of the asset

**Returns:** Promise that resolves with the asset metadata

**Example:**

```typescript
import { getAssetMetadata } from '@quajs/engine'

const audioMeta = await getAssetMetadata('audio', 'bgm_theme')
const imageMeta = await getAssetMetadata('images', 'character_portrait')
```

## State Management

### `getStore()`

Gets the engine's store instance for direct state access.

**Returns:** Store instance

**Example:**

```typescript
import { getStore } from '@quajs/engine'

const store = getStore()
const currentState = store.getState()
```

## Error Handling

All global API functions will throw an error if the engine has not been initialized. Always call `initEngine()` before using any other global API functions.

```typescript
import { initEngine, loadScene } from '@quajs/engine'

try {
  await initEngine()
  await loadScene(myScene)
}
catch (error) {
  console.error('Engine error:', error)
}
```

## Type Definitions

The global API uses several TypeScript interfaces:

- `Scene`: Scene configuration object
- `GameStep`: Individual dialogue/game step
- `ViewPluginProjectionMap`: Plugin-owned view projection map
- `Audio` behavior: use `@quajs/plugin-audio` and `setPluginProjection('audio', ...)`
- `Story graph` behavior: use `@quajs/story-graph`
- `Inventory` behavior: use `@quajs/plugin-inventory`

These types are exported from the core engine types module.
