# @quajs/unity-host

Initial Unity **6.3 LTS** host providing a per-component QuickJS VM, scoped uGUI projection, static QPK assets, and namespaced file persistence. `@quajs/renderer-unity` reuses `@quajs/renderer-scene`, while `@quajs/scene-runtime` shares VM adapters, resource leases, ordered input, and typed file storage with Godot.

## Build and compatibility

Use Node.js 22.12+, pnpm 12.3.4, Rust/Cargo, and a C compiler. Configure `targets.unity.build.entry` (exporting async `bootstrap(services)`), along with optional `build.viteConfig`, `build.profile`, `layout`, `projectDir`, and an exact `editorVersion` (defaults to **6000.3.28f1**; other stable `6000.3` patches are accepted, while other series and prereleases are rejected).

```sh
pnpm exec quack project build --target unity --all
```

The output includes `ProjectSettings/ProjectVersion.txt`, `Packages/manifest.json`, `qua-host-compatibility.json`, active-target and retained-module manifests, and `Packages/com.quajs.unity-host`. The generated UPM package contains C# Runtime/Editor scripts with stable GUIDs, the current-host native plugin, Rust source and license notices, static JS/QPK TextAssets, and QPK-derived imported media. Opening the project in Unity generates the real `Packages/packages-lock.json` on first import, which you should review and commit.

The included Editor helper creates `Assets/QuaEngine/Main.unity` only when a matching `.qua-generated.json` marker is present. Generated project directories are disposable and replaced atomically, so never set `projectDir` to an existing authoring project.

## Embed an existing Unity application

Add only the generated `Packages/com.quajs.unity-host` folder via Unity Package Manager's local package option. Attach `QuaEngine.Unity.QuaEngineHost` to a `RectTransform` under your Canvas, and configure `autoStart = false`, the generated `contentPrefix`, and an account-specific `storageNamespace` before starting:

```csharp
module.autoStart = false;
module.contentPrefix = "QuaContent/<generated-id>";
module.storageNamespace = "account-42";
module.Ready += OnStoryReady;
module.Closed += OnStoryClosed;
module.Failed += OnStoryFailed;
module.StartModule();
// Before navigating away or destroying the parent:
module.StopModule();
```

Your application retains ownership of the Canvas, camera, global settings, and navigation; the module owns only its child projection nodes, media handles, and VM. Stopping the module never calls `Application.Quit`, and application frame-rate control is disabled by default. Keyboard focus activates on click inside the module and clears on outside click or focus loss; pointer coordinates arrive in container-local space before stage unscaling. Each `QuaEngineHost` component runs in an independent JS realm, and separate `storageNamespace` values isolate saves across accounts or modules. Lifecycle events dispatch outside the native tick, and lifecycle APIs must be called on Unity's main thread.

## Public runtime and state boundary

- `createUnityHost(bridge?)` adapts nodes, resources, audio, and input into `SceneHost`.
- `./globals`: `installUnityGlobals` and `onUnityTick` for UTF-8, cancellation, timers, and logging without DOM or network emulation.
- `./assets`: `createUnityAssetsAdapter` and `createUnityAssets` for exact-byte hashes and static QPKs.
- `./store`: `UnityFileStoreBackend` and `createUnityStoreStorage` for typed snapshots, save slots, and transaction rollback.
- `./security`: static-only trust policy that explicitly rejects dynamic runtime modules.

Engine/store owns narrative and audio intent, and `@quajs/pipeline` remains the only game event channel; the C ABI is strictly an implementation transport. No Unity-specific QuaScript decorators or loose runtime content paths are added. Imported fonts, audio, and video are content-addressed build copies derived from QPK bytes (default PNG/WAV/MP4 conversion preserves authored resource IDs, and native fonts require TTF/OTF). Dynamic Runtime Packages, executable modules, and runtime plugins are rejected.

## Capabilities and evidence limits

The initial C# host implements transforms and alpha, fixed logical-stage fitting, text and fonts, image regions, solid boxes and per-edge borders, pointer and keyboard input, `AudioSource` buses/volume/loop/seek/rate, `VideoPlayer`, and atomic file storage. Several features are not yet at parity with other hosts: letter spacing, masks and blend modes, gradients, shadows, rounded corners, full text shaping and rich text, and editable input controls still need further work. Unsupported effects log a warning, and screen capture is not advertised.

Native plugins target the build host's desktop OS/CPU. Current QuickJS/C ABI tests with a recording drawing bridge verify generated-project startup, dialogue projection, and shutdown, but do not exercise C# compilation or Unity rendering. Because this environment does not have Unity Editor installed, Editor/Player/IL2CPP builds, live graphics, input, and physical audio remain pending acceptance. Android, iOS, WebGL, and Unity-as-a-Library are also not yet qualified.

```sh
pnpm exec turbo run build typecheck test --filter=@quajs/unity-host --filter=@quajs/renderer-unity --filter=@quajs/scene-runtime --filter=@quajs/native-contracts --filter=@quajs/quack
cargo test --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml
cargo clippy --locked --manifest-path packages/platform/unity-host/runtime/Cargo.toml --all-targets -- -D warnings
pnpm --dir demo build:unity
```

When validating in the matching Unity Editor, verify package import and C# compilation, Play Mode, title/story/choices, save/load across restarts, fonts and media playback, and stop/restart cycles. In an authoring-project fixture, also check small parent regions, sibling input isolation, account storage separation, module exit without quitting the app, resource cleanup, and Player builds, recording exact Editor, OS, CPU, and backend details.
