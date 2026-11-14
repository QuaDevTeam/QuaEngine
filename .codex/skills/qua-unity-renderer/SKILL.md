---
name: qua-unity-renderer
description: Maintain Unity desktop QuickJS host, shared renderer adapter, generated project and scoped UPM embedding package.
---

# Unity target

Pair with quaengine-development-guardrails, qua-project-configuration and quack-configuration. Unity is a fifth mutually exclusive unity-core family, selected only by unity-core-resolver.

- Source: platform/unity-host C# Runtime/Editor and Rust C ABI; render/unity thin scene adapter; platform/scene-runtime neutral bridge/storage; Quack project-unity and project-scene helpers.
- Configure targets.unity build.entry exporting bootstrap(services), optional Vite config/profile, layout, projectDir and exact stable editorVersion. Initial series 6.3 LTS; default 6000.3.28f1. Reject other series/prereleases. Public guide is docs/content/docs/platforms/unity.md.
- Build with quack project build --target unity --all. Keep exact ProjectVersion, UPM dependencies, compatibility JSON, target and retained-module manifests. Do not fabricate Unity packages-lock or SDK test results. Atomic output protects authored projects and aliases.
- Existing applications install only Packages/com.quajs.unity-host. Parent Canvas/RectTransform is host-owned. Set autoStart=false, generated contentPrefix/account storageNamespace before StartModule. StopModule/Ready/Closed/Failed are main-thread APIs. No Application.Quit, global camera/settings mutation or implicit frame-rate override. Editor scene setup requires matching generated-project marker.
- Each component owns an independent QuickJS realm. C ABI uses opaque thread-bound handles, copied borrowed callback replies, bounded promise draining and exception containment. Never free callback/VM resources reentrantly. Dispatch public lifecycle events after native ticks.
- Engine/store owns game/audio state; C# holds transient projections only; pipeline is the only game event channel. Static QPK/imported-media identity and hash must survive. PNG/WAV/MP4 conversion preserves authored names; fonts require TTF/OTF. No Unity decorators, loose generated resources or dynamic runtime JS/packages/plugins.
- Keep capabilities honest: initial uGUI lacks effect/capture/text/control parity, captures are absent, unsupported effects warn. Rust/recording-bridge tests do not prove SDK/Player/IL2CPP, mobile/WebGL or Unity-as-a-Library.

Validation: package build/typecheck/test for scene-runtime, unity-host, renderer-unity, native-contracts, Quack; Rust fmt/test/clippy --locked; demo build:unity. Quack's consumer fixture runs real QuickJS/C ABI with a recording drawing bridge. Separately require Unity 6000.3 Editor import/C# compilation, Play Mode, Player build and authoring-project embedding. Never label unavailable SDK gates passed. Run Godot native/embedding and Cocos regressions after shared changes. Keep plugin mappings, docs and symmetric five-target rejection tests aligned.

Creator embedding regression: demo test:cocos:embedding builds a private Creator 3.8.8 Web fixture and verifies scoped container, parent-node survival, no application exit, serial restart and input cleanup. This does not qualify Creator native embedding or OS input automation.

## Embedded module delivery

Business modules: --embedded emits only scoped UPM content (no automatic Editor scene helper), module.json and compatibility. OpenStory(sessionId,parametersJson)/CancelStory and StoryMessage/StoryResult forward the bounded protocol. Queue responses across reverse P/Invoke; deliver closed after VM/media cleanup. services.embedding/onEmbeddedOpen/beforeEmbeddedResult belong to the shared logic plugin. The native protocol-smoke --embedded case checks real QPK/parameters/result/shutdown; it remains distinct from unrun C# Editor/Player gates.

Parent lifecycle subscribers are isolated per delegate: a throw cannot suppress result/closed delivery or native cleanup. Keep stopping=true through result flushing, permit restart from Closed only, and abandon the old Update after a callback replaces its VM. These source guards do not replace the pending real Editor/C# acceptance gate.

Managed C# sources live in lowercase runtime/ beside the Rust manifest; copy their four explicit files to the generated UPM Runtime/ and ship matching lowercase files globs. Do not rely on macOS case folding: Ubuntu packaging consumers must resolve the same source paths.
