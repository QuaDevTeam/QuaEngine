---
name: qua-scene-runtime
description: Maintain shared scene script bridge, resource leases, ordered input, UTF-8 scheduling, static assets and typed file-store runtime.
---

# Shared scene script runtime

@quajs/scene-runtime is neutral infrastructure used by Godot and Unity. scene-host remains contracts-only. createSceneScriptHost requires injected bridge/path resolvers/ticks/capabilities. Subentries bridge/globals/assets/store/security share implementation; target packages remain thin. Never import/select target cores here.

Keep resource leases pinned through media teardown, ordered async input, pending-capture rejection and unsupported API omission. Realm primitives supply UTF-8/cancellation/timers without DOM/network emulation. Generic typed file serialization/rollback takes target format IDs/namespaces; verify dates/bytes and unrelated-save preservation. No QuaScript decorators or loose runtime content path; static hosts reject dynamic modules and consume QPK.

Run package test/typecheck/build plus Godot/Unity host regressions. Fake bridges are contracts, not SDK/filesystem evidence. Godot native media/embedding and Unity C ABI consumers cover further tiers; Unity C# Editor/Player remains separate. Update this skill and owning target skills for API/capability changes.

## Embedded module delivery

Host-specific module adapters forward only embedded_open/embedded_event and embedded-command cancel envelopes. Session authority is in @quajs/plugin-embedded, not scene-runtime, renderer or native projection maps. Preserve ordered ticks and cleanup; no eval or arbitrary host command bus.
