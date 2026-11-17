# @quajs/scene-runtime

Platform-neutral, byte-oriented runtime shared by Godot and Unity script hosts. It selects no target core and imports neither target host, while `@quajs/scene-host` remains contracts-only.

`createSceneScriptHost({ bridge, resourcePath, storagePath, onTick, capabilities })` manages transient nodes, resource leases, ordered async input, frame callbacks, and pending captures. Calling `destroy()` rejects pending captures and removes listeners; unsupported capture APIs are omitted automatically based on host capabilities.

Subentries `./bridge`, `./globals`, `./assets`, `./store`, and `./security` provide strict relative path validation, per-realm UTF-8/cancellation/timer scheduling, exact-byte asset hashing, typed file records with transaction rollback, and static-only trust enforcement. Godot thin adapters retain their public names and storage layout, while each target chooses its own format IDs and namespaces. No DOM/network emulation, target bootstrap, QuaScript decorators, or loose runtime content paths belong in this package.

Narrative authority remains in engine/store and renderer intents flow through `@quajs/pipeline`. Validate changes with package tests, typecheck, and build alongside Godot/Unity host tests and native regressions. Fake bridges verify scheduling, cancellation, pinned leases, and rollback logic, not SDK rendering or physical disk durability.
