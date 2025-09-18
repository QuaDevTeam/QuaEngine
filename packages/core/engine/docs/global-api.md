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
import { initEngine } from '@qua-engine/engine'

await initEngine({
  // engine configuration
})
```

## Scene Management

### `loadScene(scene: Scene): Promise<void>`

Loads and activates a new scene in the game.

**Parameters:**

- `scene`: Scene object containing scene data and configuration

**Returns:** Promise that resolves when the scene is loaded

**Example:**

```typescript
import { loadScene } from '@qua-engine/engine'

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
import { dialogue } from '@qua-engine/engine'

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

## Audio System

### `playSound(assetName: string, options?: SoundOptions): Promise<void>`

Plays a sound effect.

**Parameters:**

- `assetName`: Name of the sound asset to play
- `options` (optional): Sound playback options

**Returns:** Promise that resolves when sound starts playing

### `dub(assetName: string, options?: SoundOptions): Promise<void>`

Plays character dubbing audio.

**Parameters:**

- `assetName`: Name of the dubbing asset to play
- `options` (optional): Sound playback options

**Returns:** Promise that resolves when dubbing starts playing

### `playBGM(assetName: string, options?: SoundOptions): Promise<void>`

Plays background music.

**Parameters:**

- `assetName`: Name of the BGM asset to play
- `options` (optional): Sound playback options

**Returns:** Promise that resolves when BGM starts playing

### `setVolume(type: keyof VolumeSettings, value: number): void`

Sets the volume for a specific audio type.

**Parameters:**

- `type`: Audio type ('master', 'bgm', 'se', 'voice', etc.)
- `value`: Volume level (0.0 to 1.0)

**Example:**

```typescript
import { setVolume } from '@qua-engine/engine'

setVolume('bgm', 0.8)
setVolume('voice', 0.9)
```

## Save System

### `saveToSlot(slotId: string, metadata?: SaveMetadata): Promise<void>`

Saves the current game state to a specific save slot.

**Parameters:**

- `slotId`: Unique identifier for the save slot
- `metadata` (optional): Save file metadata including:
  - `name?: string` - Display name for the save
  - `screenshot?: string` - Screenshot data
  - `sceneName?: string` - Current scene name
  - `stepId?: string` - Current step ID
  - `playtime?: number` - Total playtime in milliseconds
  - `[key: string]: unknown` - Additional custom metadata

**Returns:** Promise that resolves when save is complete

**Example:**

```typescript
import { saveToSlot } from '@qua-engine/engine'

await saveToSlot('slot1', {
  name: 'Chapter 1 Complete',
  playtime: 3600000, // 1 hour
  sceneName: 'ending_scene',
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
import { loadFromSlot } from '@qua-engine/engine'

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
import { getAssetMetadata } from '@qua-engine/engine'

const audioMeta = await getAssetMetadata('audio', 'bgm_theme')
const imageMeta = await getAssetMetadata('images', 'character_portrait')
```

## State Management

### `getStore()`

Gets the engine's store instance for direct state access.

**Returns:** Store instance

**Example:**

```typescript
import { getStore } from '@qua-engine/engine'

const store = getStore()
const currentState = store.getState()
```

## Error Handling

All global API functions will throw an error if the engine has not been initialized. Always call `initEngine()` before using any other global API functions.

```typescript
import { initEngine, loadScene } from '@qua-engine/engine'

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
- `SoundOptions`: Audio playback options
- `VolumeSettings`: Volume configuration for different audio types

These types are exported from the core engine types module.
