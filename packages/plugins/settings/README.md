# @quajs/plugin-settings

Scoped settings bridge for QuaEngine plugins. It collects developer and player settings scopes, validates player patches, persists profile preferences, applies settings through feature hooks, and projects renderer-safe settings UI data.

The plugin is the shared configuration bridge. Feature plugins should register settings scopes instead of inventing feature-specific renderer state.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { SettingsPlugin } from '@quajs/plugin-settings'

const engine = new QuaEngine()
const settings = new SettingsPlugin({
  profileId: 'default',
  builtin: true,
})

engine.use(settings)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/settings`
- `@quajs/renderer-vue/plugins/settings`

## Developer And Player Settings

- Developer settings seed feature behavior and runtime policy.
- Player settings are profile-level preferences that can be projected to renderer UI.
- Player settings are not restored by story save/load.
- Feature settings apply hooks must update engine-owned projections or plugin state only.

## Register A Scope

```ts
const unregister = settings.registerScope({
  scope: '@example/plugin-camera',
  version: 1,
  title: 'Camera',
  developer: {
    defaults: {
      defaultShakeEnabled: true,
    },
  },
  player: {
    defaults: {
      shakeEnabled: true,
      motionScale: 1,
    },
    schema: {
      type: 'object',
      properties: {
        shakeEnabled: { type: 'boolean', title: 'Camera shake' },
        motionScale: { type: 'number', minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    },
    expose: true,
    ui: {
      label: 'Camera',
      controls: {
        shakeEnabled: { control: 'switch' },
        motionScale: { control: 'slider', step: 0.1 },
      },
    },
  },
  apply: async ({ values, engine }) => {
    await engine.setPluginProjection('camera', { shakeEnabled: values.shakeEnabled })
  },
})
```

## Read And Update Values

```ts
const developer = settings.getDeveloperValues('@example/plugin-camera')
const player = settings.getPlayerValues('@example/plugin-camera')
const projection = settings.getProjection()

await settings.updatePlayerSettings('@example/plugin-camera', {
  motionScale: 0.6,
})

await settings.resetPlayerSettings('@example/plugin-camera')
```

## Schema And UI Hints

Settings schemas are JSON-schema-like object schemas. The projection filters fields according to `player.expose` and UI hints before renderer consumption.

Use UI hints for control preference and layout metadata. Renderer implementations may provide default controls and slots so game developers can replace field, scope, or form rendering.

## Storage

`SettingsPlugin` accepts a storage adapter. If none is provided, it uses in-memory storage. Web projects should provide a persistent storage adapter when settings must survive reloads.

## Runtime Packages

Runtime packages may register settings scopes. Package unload unregisters package-owned scopes and rebuilds projection.

## Renderer Boundary

Renderer settings UI emits update/reset intents. Validation, persistence, apply hooks, and final projection rebuilds happen in the settings bridge.
