# @quajs/unity-host

Experimental Unity **6.3 LTS** host: per-component QuickJS VM, scoped uGUI projection, static QPK assets and namespaced file persistence. `@quajs/renderer-unity` reuses `renderer-scene`; `@quajs/scene-runtime` shares VM adapters, resource leases, ordered input and typed file storage with Godot.

## Build and compatibility

Use Node 22.12+, pnpm 12.3.4, Rust/Cargo and a C compiler. Configure `targets.unity.build.entry` (exports async `bootstrap(services)`), optional `build.viteConfig`, `build.profile`, `layout`, `projectDir` and exact `editorVersion`. Default **6000.3.28f1**; other stable 6000.3 patches are accepted, other series/prereleases rejected.

```sh
pnpm exec quack project build --target unity --all
```

Output includes `ProjectSettings/ProjectVersion.txt`, `Packages/manifest.json`, `qua-host-compatibility.json`, the active-target and retained-module manifests, and `Packages/com.quajs.unity-host`. That UPM package carries C# Runtime/Editor sources, stable script GUIDs, the current-host native plugin, Rust source/notices, static JS/QPK TextAssets and QPK-derived imported media. Unity creates its real `Packages/packages-lock.json` on import; review and retain it. Generation never fabricates SDK import or package resolution evidence.

The Editor helper creates the initial Canvas/scene only under a project with the matching `.qua-generated.json` marker. Open `Assets/QuaEngine/Main.unity` and enter Play Mode after SDK import. Generated directories are disposable and atomically replaced; never use an existing authoring project as projectDir.

## Embed an existing Unity application

Install only the generated `Packages/com.quajs.unity-host` directory through Unity Package Manager's local package entry. Add `QuaEngine.Unity.QuaEngineHost` to a RectTransform under the host's Canvas. Before starting, set `autoStart=false`, the generated `contentPrefix` and a stable account-specific `storageNamespace`:

```csharp
module.autoStart = false;
module.contentPrefix = "QuaContent/<generated-id>";
module.storageNamespace = "account-42";
module.Ready += OnStoryReady;
module.Closed += OnStoryClosed;
module.Failed += OnStoryFailed;
module.StartModule();
// Before leaving/destroying the parent:
module.StopModule();
```

The host owns Canvas/camera, application settings and navigation. The module owns its child projection tree, media handles and VM. Closing never calls Application.Quit; application frame-rate control defaults to disabled. Input focuses after clicking inside the module and blurs outside; coordinates are container-local before shared stage unscaling. Each component has an independent JS realm. Different account/module namespaces isolate storage. Public lifecycle events dispatch outside the native tick; call lifecycle APIs on Unity's main thread.

## Public runtime and state boundary

- `createUnityHost(bridge?)` adapts nodes/resources/audio/input into SceneHost.
- `./globals`: installUnityGlobals/onUnityTick, UTF-8, cancellation, timers and logging without DOM/network emulation.
- `./assets`: createUnityAssetsAdapter/createUnityAssets, exact-byte hashes and static QPKs.
- `./store`: UnityFileStoreBackend/createUnityStoreStorage, typed snapshots/slots and transaction rollback.
- `./security`: static-only trust and explicit dynamic-module rejection.

Engine/store owns narrative and audio intent; pipeline is the only game event channel. The C ABI is native implementation transport. No Unity QuaScript decorators or loose runtime content path exist. Imported fonts/audio/video are content-addressed build copies derived from QPK bytes. Default PNG/WAV/MP4 conversion preserves authored resource identities; native fonts require TTF/OTF. Dynamic Runtime Packages, executable modules and runtime plugins are rejected.

## Capabilities and evidence limits

The initial C# host implements transforms/alpha, fixed logical-stage fitting, text/fonts, image regions, solid boxes/per-edge borders, pointer/keyboard transport, AudioSource buses/volume/loop/seek/rate, VideoPlayer and atomic files. Base uGUI does not implement full effect/capture/text/control parity: letter spacing, masks/blends, gradients/shadows/rounded corners, all text shaping/rich text and editable controls need further work. Unsupported effects warn; captures are not advertised.

Native plugins are current-host desktop builds. Real QuickJS/C ABI tests with a recording drawing bridge verify generated-consumer startup/dialogue/shutdown, not C# compilation or Unity rendering. The current machine has no Unity Editor, so Editor/Player/IL2CPP, actual graphics/input/media and physical audio acceptance remain required. Android/iOS/WebGL and Unity-as-a-Library distribution are not qualified.

```sh
pnpm exec turbo run build typecheck test --filter=@quajs/unity-host --filter=@quajs/renderer-unity --filter=@quajs/scene-runtime --filter=@quajs/native-contracts --filter=@quajs/quack
cargo test --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml
cargo clippy --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml --all-targets -- -D warnings
pnpm --dir demo build:unity
```

In the exact Editor, require import/C# compilation, Play Mode, title/story/choices, save/load across restart, fonts/media and stop/restart. An authoring-project fixture must verify a small parent region, sibling input, account isolation, module quit without app exit, cleanup and Player build. Record exact Editor/OS/CPU/backend and separate those results from contract tests.
