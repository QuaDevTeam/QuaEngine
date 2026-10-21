# @quajs/renderer-godot

Thin adapter over [`@quajs/renderer-scene`](../scene/README.md), exposing `QuaGodotRendererController`, `createVisualNovelGodotRendererPlugins`, feature subentries and `createQuiGodotRendererPlugin`. Use with [`@quajs/godot-host`](../../platform/godot-host/README.md); its README covers project generation. Follow the [Godot project guide](../../../docs/content/docs/platforms/godot.md) for setup, demo launch and current platform limits.

This package belongs in the active godot-core-resolver graph only, never ordinary plugin lists, shared presets or Runtime QPK executable dependencies. Feature plugins project engine-owned state and communicate through pipeline.

The Godot target uses a Rust GDExtension with QuickJS and currently accepts build-time static QPKs only. It is independent of the JavaScriptCore/wgpu Native target. Optional `plugins/*` and `qui` entries reuse shared scene behavior and `context.scene`; they do not add target-specific QuaScript syntax or game state.
