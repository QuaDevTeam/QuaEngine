---
name: quajs-plugin-settings
description: Use, document, or modify @quajs/plugin-settings. Covers scoped developer/player settings, schemas, UI hints, storage, apply hooks, renderer settings projection, runtime package scopes, plugin integration rules, and validation.
---

# @quajs/plugin-settings

Use this skill for `packages/plugins/settings`, feature plugin settings integration, renderer settings UI projection, settings schemas/forms, or player preference persistence.

## Responsibility

`@quajs/plugin-settings` is the shared configuration bridge for feature plugins. It collects developer and player settings scopes, validates player patches, persists profile preferences, applies settings through feature hooks, and projects renderer-safe settings UI data.

Feature plugins should register settings scopes instead of inventing feature-specific renderer state.

## Setup

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
- `@quajs/renderer-cocos/plugins/settings`
- `@quajs/plugin-settings/native` through `createSettingsNativeRendererFeature()`

## Scope Model

- Developer settings seed runtime behavior and policy.
- Player settings are profile-level preferences that can be projected to renderer UI.
- Player settings are not restored by story save/load.
- Apply hooks must update engine-owned projections or plugin state only.

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

Settings schemas are JSON-schema-like object schemas. Projection filters fields according to `player.expose` and UI hints before renderer consumption.

Use UI hints for preferred controls and layout metadata; renderer implementations can provide default controls and slots while developers replace field/scope/form rendering.

## Storage

`SettingsPlugin` accepts a storage adapter. If none is provided, it uses in-memory storage. Web projects should provide persistent storage when settings must survive reloads.

## Runtime Packages

Runtime packages may register settings scopes. Package unload unregisters package-owned scopes and rebuilds projection.

## Renderer Boundary

Renderer settings UI emits update/reset intents. Validation, persistence, apply hooks, and final projection rebuilds happen in the settings bridge.

Native products explicitly register `createSettingsNativeRendererFeature()` in the same feature-surface list used for frame serialization and `NativeHostPlugin`. It projects exposed form fields in logical safe-area coordinates, cycles switch/select/numeric controls through explicit `settings-update` intents, keeps unsupported text/complex controls read-only, preserves runtime scope provenance, and delegates validation/persistence/apply behavior to the settings bridge.

The official native settings surface uses a compact centered panel, structured label/description/value rows, and structured `boxShadow` / `textShadow` style IR to follow the Web settings hierarchy. These are render-only nodes; the parent field row retains the allowlisted settings intent and the renderer must not persist field values locally.

Settings panel placement comes from the engine-owned generic UI overlay projection, not renderer-local state. `engine.showUI('settings', config)` and `config.scene.overlay` may include `overlayStack`, `stackPriority`, and `zIndex`; official renderers use `overlay` stack with settings zIndex `60` by default when no placement is projected.

## Plugin Integration Rules

- Register `player` scope only for real user-facing persistent preferences.
- Register `developer` scope for tunable defaults and policy.
- Do not force content/catalog/asset/decorator definitions into settings.
- Optional settings integration must be additive; feature plugins should still work without settings installed.
- Constructor options may seed defaults but should not be the only configurable surface for reusable behavior.

## Validation

```bash
pnpm --filter @quajs/plugin-settings test -- --run
pnpm --filter @quajs/plugin-settings typecheck
pnpm --filter @quajs/plugin-settings build
```

Run affected feature plugin tests when their settings scopes change.

## Review Checklist

- Is the setting truly developer policy or player preference?
- Are player settings independent from story save/load?
- Does apply update only engine-owned/plugin state?
- Does renderer only emit intents and read projection?
- Are runtime package scopes unloaded cleanly?
- If settings schema, scope, projection, or renderer intent behavior changed, was this skill updated?
