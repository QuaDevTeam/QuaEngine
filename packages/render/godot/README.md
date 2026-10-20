# @quajs/renderer-godot

Thin adapter over `@quajs/renderer-scene`, exposing `QuaGodotRendererController`, `createVisualNovelGodotRendererPlugins`, feature subentries and `createQuiGodotRendererPlugin`. Use with `@quajs/godot-host`; its README covers project generation.

This package belongs in the active godot-core-resolver graph only, never ordinary plugin lists, shared presets or Runtime QPK executable dependencies. Feature plugins project engine-owned state and communicate through pipeline.
