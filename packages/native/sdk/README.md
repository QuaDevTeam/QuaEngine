# Qua Native library SDK

Build `quack project build --target native --embedded --all` on macOS. Configure `targets.native.build.embeddedEntry` (a `bootstrap(services)` factory), `cargoManifest` (the QuaEngine Native Cargo workspace), and the normal module icon metadata. Build public TypeScript packages first; the business project needs `@quajs/assets-native`, `@quajs/store-native`, `@quajs/engine-native` and `@quajs/plugin-embedded` from the same source/version set. `embeddedViteConfig` can supply QuaScript/QSS compiler plugins, independently of the standalone application's `viteConfig`.

The output contains `lib/libquajs_native.dylib`, `lib/libquajs_native.a`, `include/qua_native.h`, a bundled native entry, static QPKs, compatibility metadata, target manifest, examples and `module.json` hashes. It contains no parent startup application. Binaries match the current macOS architecture; the deployment target is macOS 11.0, not a claim that 11.0 has been runtime tested. Windows, Linux, iOS, Android and universal binaries are not delivered by this exporter.

CMake parents can include `qua-native.cmake` and link `QuaNative::Dynamic` or `QuaNative::Static`; `cmake -S examples -B build && cmake --build build` builds the independent consumers. Keep runpaths, Frameworks embedding and signing in the parent.

The SDK has one isolated JavaScriptCore VM per opaque integer handle. The parent owns its event loop, navigation, focus and view. Attach a retained `CAMetalLayer` once before opening; use `framebufferOnly=NO`, physical `drawableSize`, and the matching backing scale. The parent must keep the layer alive through close/destroy/abort. All surface calls run on the main thread. There is no hidden window, private compositor SPI, Electron/dev CDP dependency or process-exit API.

1. Link one SDK version into the parent; do not load conflicting dylibs with the same install name. For dynamic linking embed the dylib under the parent Frameworks directory, set its runpath, and sign it as part of the final app. The exported ad-hoc signature is only a local build signature. Review the parent sandbox file access and JavaScriptCore JIT entitlements during distribution.
2. Pin `module.json` SHA-256 in the parent build or another trusted release channel. `qua_native_create` checks this pin and every inventoried file before executing JavaScript. Loading the expected hash from the same untrusted writable module directory does not establish trust. Parent signing/update policy also covers the SDK binary it actually links.
3. Supply an explicit writable `storageDirectory`, then `qua_native_open` with qua-embedded v1 JSON. Use a stable product/account namespace and a unique session ID. Storage uses a hash of module ID and namespace, atomic file replacement and an exclusive namespace lock. Awaited save failures reach the business persistence hook before a successful result. This is a local store, not encryption or a cross-record database transaction.
4. Drive `qua_native_tick` from the parent timer and drain `qua_native_poll`. Poll returns required bytes without consuming when the output buffer is absent/too small; copy exact UTF-8 bytes, no NUL terminator. No SDK callbacks are invoked into the parent.
5. Validate a `completed` result before applying an idempotent parent reward. On navigation call close, continue ticking/polling until `closed`, then destroy and remove the view. Reopen with a new handle. A result is separate from resource release; the `closed` event is exposed after GPU/media teardown.

All calls on a handle belong to its creator thread. Wrong-thread, duplicate-open, stale-handle and overlapping same-namespace operations fail. Use distinct namespaces for concurrent VMs. `destroy` refuses a live session. If shutdown stalls, choose a parent timeout, then `qua_native_abort`: this is forced eviction and promises no business result or final save. A crashed process may leave `session.lock` (contains PID/session diagnostics) or `records.pending`; recover these only after proving the owner no longer exists. Never automatically steal a live namespace lock.

Pointer coordinates are view-local points with a top-left origin; resize uses physical pixels and backing scale. ABI 1 accepts pointer press/release/move, advance, and focus. Keyboard shortcut mapping, IME, wheel and gamepad require future ABI work. The Cocoa example routes Space/Return only while its story view is first responder. Hiding a view is not a full engine/audio pause. Define background, host audio mixing/interruption and teardown behavior in the parent.

Compile/run the independent Cocoa parent from the module root (its command is also in the source):

```sh
clang -fobjc-arc examples/macos-parent.m -Iinclude -Llib -lquajs_native \
  -framework Cocoa -framework QuartzCore -Wl,-rpath,@executable_path/lib -o parent
./parent /absolute/path/to/module PINNED_MODULE_JSON_SHA256 /absolute/writable/storage '{"quest":42}'
```

`examples/protocol.c` is an independently linked headless consumer for CI. It tests actual JSC business results, storage across processes, account isolation, cancellation, advance input, buffers and handle ownership; it does not establish GPU presentation. `macos-parent.m` exercises a real parent-owned Metal view, resize and lifecycle. SDK compilation, headless tests, visible-window checks, media listening, hardened runtime/signing and device/platform acceptance are separate evidence.

Narrative state remains engine-owned and internal notifications/intents use pipeline. Native rendering reuses the existing projection, texture/font/media lifecycle and GPU path. Only verified build-time QPKs are supported here; no arbitrary parent eval, dynamic module loading or loose asset push is exposed. Close old sessions before replacing the complete module. Changing native libraries requires rebuilding/restarting the parent, not hot replacement.
