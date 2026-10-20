# @quajs/scene-host

Platform-neutral native scene host interfaces for `@quajs/renderer-scene`. Hosts implement transient nodes/resources, logical projection, input, audio, fonts, storage and optional capture. This package contains types only, with no bootstrap or game state.

`@quajs/cocos-host` re-exports the same interfaces with Cocos names. `@quajs/godot-host` implements them using native Godot nodes. Declare optional capabilities truthfully so shared feature plugins can warn or fall back.
