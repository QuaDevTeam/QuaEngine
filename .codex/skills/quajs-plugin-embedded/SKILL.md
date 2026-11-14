---
name: quajs-plugin-embedded
description: Develop engine-owned embedded story sessions, bounded JSON protocol, iframe parent/child SDK and generated host integration.
---

# Embedded modules

- @quajs/plugin-embedded root is an optional logic plugin. Engine/store owns parameters and active/settling/terminal projection; renderer owns no business state. Internal actions use pipeline embedded/complete, embedded/cancel, embedded/result.
- protocol and session subentries are platform-neutral. web subentry owns only iframe/message listeners, origin/source checks and lifecycle handles. Do not import DOM into root or turn this into an alternate game eventbus.
- bootstrap receives services.embedding; return initialized engine/destroy and optional onEmbeddedOpen(context), beforeEmbeddedResult(outcome). Complete/cancel/fail have one terminal winner; await persistence before notifying the parent. Save failures become PERSISTENCE_FAILED. Close after teardown, separate from task success/rewards.
- Protocol qua-embedded v1 accepts open/cancel, emits ready/result/error/closed. Validate finite JSON/depth/size/plain objects, safe storageNamespace, session IDs and exact Web origins. No eval, loose resource push, raw store writes or arbitrary jump. No special QuaScript decorators; use initialized plugin/context or pipeline.
- Quack project build --embedded emits four target modules and module.json hashes/entries without parent startup settings. Web needs embeddedEntry and embeddedOrigins; child passes AbortSignal to bootstrap, cancellation during load must survive iframe navigation. Default styles remain explicit business imports and generated HTML links CSS.
- Godot open_story/cancel_story/story_message/story_result; Unity OpenStory/CancelStory/StoryMessage/StoryResult; Creator start with request/input/layout/onMessage and result/cancel/destroy. Deliver native messages outside ticks and closed after native release. One active Creator realm, isolated Godot/Unity VMs.
- Static QPK trust/isolation is unchanged. Shared runtime packages do not gain dynamic activation authority. Root docs/reference/embedded comes from README; guides/exported-module.md covers delivery.

Validation: package test/typecheck/build, Quack embedded-project consumer, renderer-scene visible default bounds, affected hosts/renderer regressions, Unity Rust fmt/test/clippy and protocol-smoke --embedded. Real browser/Godot business smoke and Creator Web module smoke cover complete/cancel/persistence failure and parent ownership. Keep Unity SDK/C# compilation/Player/IL2CPP and native/media/device gates explicit. Review races, startup exceptions, duplicate/stale messages, save failure, cleanup rejection and account isolation.

Private Creator parent fixtures use independent project UUIDs to avoid sharing SDK import identity with old copies; retain failure logs and never accept a build without its scene. Parent SDK ready rejects when initialization ends before readiness; terminal outcomes and cleanup remain separately observable.
