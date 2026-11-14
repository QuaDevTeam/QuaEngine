# @quajs/scene-runtime

Platform-neutral byte-oriented runtime shared by Godot and Unity script hosts. It selects no target core and imports neither target host. `@quajs/scene-host` remains contracts-only.

`createSceneScriptHost({ bridge, resourcePath, storagePath, onTick, capabilities })` manages transient nodes, resource leases, ordered async input, frame callbacks and pending captures. Destroy rejects captures and removes listeners; unsupported capture APIs are omitted. The active host injects real paths/capabilities.

Subentries `bridge`, `globals`, `assets`, `store`, `security` provide strict relative path contracts, per-realm UTF-8/cancellation/scheduling, exact-byte asset hashing, typed file records/transaction rollback and static-only trust. Godot thin adapters retain their public names and storage format; targets choose format IDs and namespaces. No DOM/network emulation, target activation, QuaScript decorators or loose runtime content belongs here.

Narrative authority stays in engine/store; renderer intents use pipeline. Run package tests/typecheck/build, Godot/Unity host tests and native regressions. Verify ordered cancellation, pinned resources, teardown, dates/bytes and rollback. Fake bridges do not establish SDK drawing or durable file behavior.
