# @quajs/renderer-scene

Host-independent scene projection runtime shared by Cocos and Godot adapters. `@quajs/scene-host` supplies node, resource, font, audio, input, capture and storage contracts. Narrative/render state stays in engine/store; the renderer reads projections and emits pipeline intents.

Use `QuaSceneRendererController`, `defineSceneRendererPlugin` (`context.scene`) and optional `plugins/*` or `qui` entries. This package must not import any target bootstrap adapter. Preserve package-aware asset identity and logical stage coordinates.
