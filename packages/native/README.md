# Native packages

This directory contains the JavaScriptCore/wgpu target, its platform-neutral UI
authoring tools, and the native host adapters. Package roots remain stable;
implementation files are grouped by responsibility inside each `src` directory.
Consumers should use package exports rather than internal source paths.

| Package | Source organization |
| --- | --- |
| `ui-compiler` | `model/` defines document and surface types; `shared/` contains source-range, asset and intent helpers; `registry/` describes components, directives and QSS properties; `qss/` parses and formats styles, with `validation/` and `style/` for validation and resolved values; `projection/` compiles templates and TSX into logical-stage surfaces; `language/` adapts document operations. |
| `ui-jsx` | A small, flat module set for JSX types, components, intent constructors and the two JSX runtime entries. |
| `contracts` | `host/` defines host capabilities and wire protocols; `target/` selects and isolates target cores; `target-bundle/` validates artifact manifests; `compatibility/` checks renderer requirements; `package-guard/` rejects unsafe runtime package content. |
| `engine-native` | `bootstrap/` validates startup manifests and installs adapters; `runtime/` checks compatibility and loads restricted JSC modules; `bridge/` forwards JSC pipeline and renderer messages; `renderer/` serializes frames, forwards intents and handles preload/save-preview projections. |
| `assets-native` | `storage/` owns cache records, paths, index persistence and the host storage adapter. The root entry creates the QuaAssets adapter. |
| `store-native` | `storage/` owns the native persistence backend, storage keys and record serialization. The root entry exports the public API. |
| `language-server` | `language/` adapts compiler document operations; `project/` indexes documents, assets and references; `lsp/` owns protocol conversion, code actions, session settings and session coordination; `shared/` contains source-range conversion. `server.ts` is the process entry. |
| `vscode` | One extension entry plus language configuration, snippets, grammars and extension packaging. |
| `vite-plugin` | One plugin entry for build-time native UI compilation. |
| `benchmarks` | `authoring/` contains deterministic fixtures and benchmark definitions; `measurement/` contains timing, memory sampling and threshold checks. `bench-smoke.ts` is the CLI entry. |
| `product-smoke` | Integration tests using compiled QuaScript, QPK assets and the real Rust/JSC bridge. |

The Rust workspace already follows domain modules:

- `quajs_native_runtime`: `host/` owns host APIs and metadata; `jsc/` owns the
  evaluator, closed module graph, rooted values and namespace registry.
- `quajs_wgpu_renderer`: projection, layout, render graph, input, resource and
  media modules, with GPU execution under `renderer/backend/wgpu/`.
- `quajs_native_app`: startup and target manifests, product/window coordinators,
  media backends and synchronization, plus separate renderer/window smoke
  modules. Existing child directories contain each module's helpers and tests.

Keep small entry-oriented packages flat. Add a directory when multiple modules
share a responsibility; avoid creating a folder for every file. Tests stay in
their package's `test/` tree, or beside Rust modules using Rust's existing test
layout. Shared resolved-frame fixtures live in `test-fixtures/renderer/`.

`ui-compiler/src/runtime.ts` is the platform-neutral runtime entry. Its dependency
graph must remain free of Sass, native host compatibility and target bootstrap
code. Build-time SCSS compilation lives in `qss/scss.ts`; host compatibility stays
in `compatibility.ts`. Engine/store/plugins retain game-state authority, and
renderer intents continue through the pipeline.

## Window color and refresh rate

Native scene art and CSS colors share an sRGB working space. The PNG, JPEG and
WebP loader converts supported embedded RGB and grayscale ICC profiles before
premultiplication and mip generation. Untagged pixels use sRGB. GPU frame
captures and save previews export straight-alpha PNGs with an sRGB tag, including
when the window presents through an HDR swapchain. The working frame is 8-bit
SDR, so wide-gamut colors are mapped into sRGB and authored HDR highlights are
outside the current asset pipeline.

A standalone window probes its current monitor. On macOS it reads the screen
profile and EDR headroom and labels the Metal layer with its output color
space. On Windows it queries the active DXGI output and the desktop's SDR white
level. An eligible display and backend can present the scene in extended linear
sRGB via an FP16 swapchain. The final pass decodes the scene's sRGB transfer
function and maps white to the system's SDR reference level. Unknown monitor
capabilities, including Linux and an embedded layer without screen information,
use SDR. Window smoke diagnostics report the monitor and the negotiated output
separately.

The player's **Follow Display** setting tracks the current display up to 240 Hz
and uses 60 FPS when the monitor rate is unavailable. Numeric settings cap the
cadence. The native scheduler uses millihertz for fractional display modes and
reports its effective target separately from measured frame throughput.

### Window input

A primary tap activates the hit-tested UI or advances the stage. Dragging scrolls a list, and dragging a slider adjusts its value. Touch cancellation, focus loss and suspension discard the gesture. Mouse and touch use separate pointer identities.

The D-pad moves focus through visible actions and choices. A/Cross activates the focused item, confirms the first visible modal action, or advances dialogue during gameplay, B/Circle cancels, and Start requests the menu. Left/right adjust a focused range or selection. A/Cross toggles a focused switch. The right shoulder and right trigger hold fast-forward and skip. Apple windows use GameController extended gamepads. Windows and Linux use gilrs (Linux builds require the libudev development package). On Android the NativeActivity reads the NDK input source, D-pad HAT axes and right-trigger/GAS axes during the winit callback. Controllers that report both a key and an axis produce one logical press and release. Ordinary keyboard and touchscreen events retain their winit bindings. The embedded C SDK accepts host-forwarded standard button indices and primary touches. See [the SDK input contract](sdk/include/qua_native.h).

## Building a standalone mobile game

Enable `ios` and/or `android` in `targets.native.platforms` and include the
`release` profile. The Demo's `qua.project.yaml` supplies the native app entry,
Quack workspace, icon, bundle ID and Cargo features. Run from the game directory.

| Command | Output |
| --- | --- |
| `pnpm exec quack project build --target native --platform ios-simulator` | Simulator .app for the Mac's architecture |
| `pnpm exec quack project build --target native --platform ios` | Device arm64 .xcarchive, optionally a signed Game.ipa |
| `pnpm exec quack project build --target native --platform android` | arm64-v8a APK, optionally signed |

The iOS deployment target is 15.4. Apple builds require macOS with Xcode and the matching Rust target
(`aarch64-apple-ios`, `aarch64-apple-ios-sim`, or `x86_64-apple-ios`). Install
the simulator bundle with `xcrun simctl install booted <path-to-app>`.

For an installable development or ad-hoc IPA, set `QUA_IOS_SIGNING_IDENTITY`
to the SHA-1 fingerprint of a local signing identity and
`QUA_IOS_PROVISIONING_PROFILE` to its matching Xcode-installed device profile.
The same `--platform ios` build validates the profile and signs the archive,
then exports `Game.ipa` locally. Device installation requires the profile to
include that device. Without these inputs the build produces an unsigned archive.
See the [Quack production build guide](../build/quack/docs/production-build.md).

Android builds use a macOS or Linux build host, JDK 17+, Rust target
`aarch64-linux-android`, SDK platform 35, Build Tools 35.0.0, and NDK
28.2.13676358. Set `ANDROID_HOME` and `JAVA_HOME`, then prepare
JavaScriptCore as described below. Devices require Android 9 (API 28) or
later and Vulkan 1.1.
To emit an installable signed APK, set `QUA_ANDROID_KEYSTORE`,
`QUA_ANDROID_KEY_ALIAS` and `QUA_ANDROID_STORE_PASSWORD` before building.
Set `QUA_ANDROID_KEY_PASSWORD` if the key uses a separate password.
Outputs are staged per platform under the configured native output directory.
Both targets load the project's QPKs through the native resolver and render
the shared QUI with wgpu. The separately exported embedded C SDK targets macOS.

The signed standalone game stores save slots and settings in the application's
private data directory. Slot payloads and indexes are committed together and
survive process termination. On Android the data belongs to the NativeActivity's
internal files directory. On iOS it lives under Application Support in the sandbox.

### Android JavaScriptCore

From the repository root, prepare the arm64 library once per build machine.

```sh
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
export QUA_ANDROID_JSC_LIB_DIR="$PWD/.local/android-jsc"
python3 packages/native/sdk/prepare-android-jsc.py "$QUA_ANDROID_JSC_LIB_DIR"
```

The helper downloads a pinned JSConly archive, verifies the archive hash, and links JavaScriptCore, WTF, bmalloc and ICU into one shared library. The resulting ELF supports both 4 KiB and 16 KiB Android page sizes. Cargo and Quack verify its SHA-256 before linking or packaging. Pass `--archive /path/to/bun-webkit-linux-arm64-android.tar.gz` to rebuild from a local copy. See the [distribution pin](crates/quajs_native_runtime/mobile-jsc.json), [upstream source](https://github.com/oven-sh/WebKit/tree/6ef83cb658722ff1f33f4a4c9335fb094bed4c6b), and [upstream binary distribution](https://github.com/oven-sh/WebKit/releases/tag/autobuild-6ef83cb658722ff1f33f4a4c9335fb094bed4c6b).
