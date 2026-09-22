# Native JavaScriptCore runtime

The resident native engine and QPK script evaluator use JavaScriptCore. Build
`quajs_native_runtime` or `quajs_native_app` with `--features javascriptcore`.
`pnpm dev:native` and `pnpm native:e2e` select this feature automatically.
Builds without it expose the unsupported evaluator explicitly.

## Platform dependencies

| Target | JavaScriptCore provider |
| --- | --- |
| macOS arm64 / x64 | System JavaScriptCore framework |
| Linux | JavaScriptCoreGTK development package, preferably `libjavascriptcoregtk-4.1-dev` |
| Windows x64 MSVC | `otter-jsc-sys = 0.1.1`, statically linked bun-webkit distribution |

The Windows dependency downloads and caches the pinned distribution
`aaf3f80b1cc701b412f8abfb7c7f413644a229ff` from `oven-sh/WebKit` on its first
build. It links JavaScriptCore, WTF, ICU and the required Windows system
libraries. An intentional `BUN_WEBKIT_VERSION` override is embedded in the
host's runtime identity. Windows runtime and linking tests are configured in
`.github/workflows/native-jsc.yml`; a cross-target `cargo check` alone does not
prove Windows linking, JIT execution or window behavior.

A hardened-runtime macOS release must enable
`com.apple.security.cs.allow-jit` in its signing entitlements for JSC JIT code.

macOS reports the installed framework version; Linux reports the loaded GTK
library version. A target manifest's `nativeRuntime.jscVersion` must exactly
match the signed native host. Changing the engine requires regenerating the
target manifest and the native JS/QPK bundle. There is no QuickJS fallback or
old wire-protocol alias.

## Module execution and ownership

The public JSC C API evaluates scripts, not ESM graphs. Rust parses the verified
module bytes with SWC and lowers ESM to `System.register`. A package-local
loader handles live exports, cyclic dependencies, asynchronous execution and
top-level await. Module definitions compile in the global scope with only a
fixed registration API, so package code cannot reach loader-local graph state.
Registration closes before any module executes. Both static and dynamic imports resolve only inside the
explicit `metadata.nativeJsc.imports` graph or the native host's fixed helper
catalog. Import attributes, filesystem/URL resolution and native payloads are
rejected. SWC is a syntax transform; all application JavaScript runs in JSC.

Each evaluation owns its graph. Retained namespace, GameStep, continuation and
listener values keep their context alive and use JSC GC roots. Package release
removes those roots through the existing host registry and pipeline lifecycle.
There is no process-global cache of package code. Re-evaluation after unload
uses the newly supplied QPK bytes.

JavaScript remains on the resident engine worker. JSC drains Promise jobs when
C API calls return; the worker wakes for renderer intents or the next timer
deadline and otherwise parks. Renderer state authority and communication
remain unchanged: engine/store own game state, and `@quajs/pipeline` carries
projections and intents.

## Limits and bridge

`NativeJscSandboxLimits` contains `maxModuleBytes` (default 4 MiB) and
`maxExecutionTimeMs` (default 1000, accepted range 1–60000). A namespace's budget
also applies to later export, GameStep and listener calls. Timer pumping uses
the smallest active namespace budget. JSC manages heap and stack internally;
the C API does not provide hard per-context heap/stack byte quotas. This
contract does not claim process-level memory isolation.

Immutable engine command names and bridge function handles are cached once
per context. String output uses the JSC UTF-8 conversion API to avoid a Rust
per-character conversion loop on every projection.

The TS/Rust wire API uses `Jsc` / `jsc` names. The JSONL test host is enabled
with `QUA_NATIVE_JSC_BRIDGE=1`; it accepts the existing host request envelope,
including `evaluateJscModule`, JSON-safe exports and GameStep continuation
calls. It does not bypass QPK validation or provide arbitrary filesystem
script execution.

## Validation

```sh
cargo test --locked --manifest-path packages/native/Cargo.toml -p quajs_native_runtime --features javascriptcore
cargo test --locked --manifest-path packages/native/Cargo.toml -p quajs_native_app --features javascriptcore
cargo run --locked --manifest-path packages/native/Cargo.toml -p quajs_native_runtime --features javascriptcore --example jsc_performance
pnpm native:e2e
```

Compare benchmarks using the same Rust profile and fixture. Bridge timings do
not measure overall gameplay speed or FPS. The full Demo gate exercises the
resident engine, compiled QuaScript, QPK assets, UI flows and teardown.
