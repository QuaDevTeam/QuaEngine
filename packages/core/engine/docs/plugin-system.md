# QuaEngine Plugin System

QuaEngine uses package-local feature plugins plus metadata-driven discovery. Feature behavior lives in the package that owns it; the engine provides lifecycle, state access, API registration, and runtime package hooks.

## Layers

| layer              | owner                                                              | purpose                                                                 |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Engine plugins     | `@quajs/engine` contracts and `packages/plugins/*` implementations | Authoritative feature state, APIs, decorators, runtime package cleanup  |
| Plugin discovery   | `@quajs/plugin-discovery`                                          | Reads `package.json#quajs`, `qua.plugins.json`, and custom registries   |
| QuaScript compiler | `@quajs/script-compiler`                                           | Resolves decorator metadata and calls package-local compiler lowering   |
| Renderer plugins   | `@quajs/render-core`, `@quajs/renderer-web`, framework adapters    | Stateless projection layers and renderer-local resources                |
| Pipeline plugins   | `@quajs/pipeline`                                                  | Transport/interception of events without becoming a second renderer bus |

## Package Metadata

A package is discoverable only when it declares explicit `quajs` metadata. The package name is a convention, not the discovery source of truth.

```json
{
  "name": "@quajs/plugin-inventory",
  "quajs": {
    "type": "plugin",
    "category": "data",
    "description": "Persistent profile inventory item catalog and quantities",
    "decorators": {
      "GrantInventoryItem": {
        "function": "grantInventoryItemWithEngine",
        "module": "@quajs/plugin-inventory"
      }
    },
    "language": {
      "decorators": {
        "GrantInventoryItem": {
          "description": "Grant an inventory item quantity to the active profile",
          "args": [
            { "name": "itemId", "detail": "Inventory item id" },
            { "name": "options", "detail": "Optional quantity, profileId, source, or metadata" }
          ]
        }
      }
    }
  }
}
```

Renderer-capable packages can also declare renderer entries:

```json
{
  "quajs": {
    "renderer": {
      "web": "@quajs/renderer-web/plugins/gallery",
      "vue": "@quajs/renderer-vue/plugins/gallery"
    }
  }
}
```

React and Svelte renderer packages expose matching framework subentries for the Web feature plugin set. Shared DOM behavior should still live in `@quajs/renderer-web`.

## Engine Plugin Implementation

```ts
import { BaseEnginePlugin } from '@quajs/engine'

export class MyFeaturePlugin extends BaseEnginePlugin {
  readonly name = '@quajs/plugin-my-feature'

  myFeature(payload) {
    return myFeatureWithEngine(this.getEngine(), payload)
  }

  protected override async setup(ctx) {
    // Initialize engine-owned feature state.
  }

  override async onRuntimePackageUnload(ctx) {
    const packageId = ctx.runtimePackage?.package.id
    if (packageId) {
      // Remove definitions/projections owned by or dependent on this package.
    }
  }

  registerAPIs() {
    return {
      pluginName: this.name,
      apis: [
        { name: 'myFeature', fn: this.myFeature.bind(this), module: this.name },
      ],
      decorators: {
        MyFeature: {
          function: 'myFeatureWithEngine',
          module: this.name,
        },
      },
    }
  }
}
```

Rules:

- Store authoritative state through engine/store APIs.
- Register developer-facing JS APIs as initialized plugin instance methods. QuaScript decorators may still lower to explicit `*WithEngine` runtime helpers imported from the owning package.
- Keep player/profile state out of story save/load when the feature is profile-level, such as gallery, achievements, settings, or inventory.
- Runtime package definitions/projections must carry provenance and clean up on unload.
- Decorators and compiler lowering belong in the feature package, commonly under `./script-compiler`.
- Renderers may project feature state but must not mutate authoritative game state.

## Custom Plugin Registry

Projects can define non-package plugin metadata in `qua.plugins.json`:

```json
{
  "version": "1.0",
  "plugins": [
    {
      "name": "custom-plugin",
      "entry": "./plugins/custom-plugin.js",
      "enabled": true,
      "decorators": {
        "CustomDecorator": {
          "function": "customFunction",
          "module": "custom-plugin"
        }
      }
    }
  ]
}
```

This is for discovery metadata. Runtime plugin instances still need to be installed into the engine explicitly or provided by the runtime package lifecycle.

## QuaScript Integration

Plugin discovery contributes decorator metadata only. Plugins do not extend the QuaScript grammar or inject custom compiler modules into the core compiler.

```ts
import { createPluginAwareTransformerAsync } from '@quajs/script-compiler'

const transformer = await createPluginAwareTransformerAsync(
  {},
  { projectRoot: process.cwd() },
)

const compiled = transformer.transformSource(source)
```

Decorator resolution is shared by CLI, Vite, language server, and VS Code extension:

1. built-in decorators
2. explicit mappings
3. value imports in the current file
4. auto-collected package metadata

## Runtime Packages

Runtime packages may activate engine plugins, story graph deltas, renderer plugin manifests, script modules, scene modules, and store migrations through `RuntimeContentManager`.

Feature plugins that own package-scoped definitions or projections should implement runtime lifecycle hooks:

- `onRuntimePackageActivate`
- `onRuntimePackageUnload`
- `onRuntimePackageMigrate`

Unload must remove only state that belongs to or depends on the package. Long-lived profile records, such as gallery unlocks or inventory quantities, should remain and become unavailable in derived projections if their active definitions are removed.

## Current Workspace Plugins

- `@quajs/plugin-achievement`
- `@quajs/plugin-animation`
- `@quajs/plugin-audio`
- `@quajs/plugin-background`
- `@quajs/plugin-backlog`
- `@quajs/plugin-fonts`
- `@quajs/plugin-gallery`
- `@quajs/plugin-inventory`
- `@quajs/plugin-settings`
- `@quajs/plugin-sprite`
- `@quajs/story-graph`

Engine core still includes only generic infrastructure such as `BaseEnginePlugin`, `PluginFramework`, API registration, and the generic `UiOverlayPlugin`. Product-level UI behavior should remain in feature packages or renderer plugin subentries.
