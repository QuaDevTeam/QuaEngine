# Native JavaScriptCore migration validation

The resident native engine and dynamic QPK evaluator now use JavaScriptCore.
The `rquickjs` dependency and old wire aliases are removed. In-repo callers,
native target metadata, editor launch paths and the complete Demo launcher use
`javascriptcore`, `Jsc` and `jscVersion`. Regenerate native JS/QPK artifacts and
target manifests after upgrading the host.

## Performance

Same Apple M4 macOS host, Rust dev profile, unchanged benchmark workload,
100 warm-up steps and five samples. Each sample runs 2,000 GameSteps and 1,000
32 KiB pipeline projections. Raw samples are in
[`native-jsc-benchmark-2026-09-21.json`](./native-jsc-benchmark-2026-09-21.json).

| Median per operation | rquickjs before | JSC after | Reduction |
| --- | ---: | ---: | ---: |
| GameStep bridge | 31.317 µs | 20.013 µs | 36.1% |
| 32 KiB projection | 91.832 µs | 36.456 µs | 60.3% |

This measures the combined migration and bridge optimizations: rooted cached
function/command handles and JSC UTF-8 string conversion. It is not an isolated
JavaScript engine benchmark, release-build result, or whole-game FPS claim.

## Completed checks

- macOS JSC runtime: 89 Rust tests, including live bindings, cycles, top-level
  await, declared dynamic imports, loader scope isolation, unload/re-evaluation,
  Unicode/NUL values, execution interruption and context recovery.
- Default runtime without JSC: 44 tests.
- Native application with JSC: 191 unit tests and 14 CLI smoke tests.
- TypeScript native contracts: 140 tests; engine-native: 114 tests; Quack
  project configuration: 29 tests. All three package typechecks passed.
- Real Rust/JSC dynamic-QPK product smoke: 5 tests, using the rebuilt
  `image-decode,javascriptcore` app.
- Complete native Demo E2E after the module isolation fix: 253 dialogue
  identities, 15 visual checkpoints, `catalog-first` choice, settings,
  chapters, WGPU 1920×1080 PNG readback and shutdown cleanup.
- Windows x64 MSVC cross-target `cargo check --locked`: runtime, headless
  app, and app with `native-window,native-audio-rodio,javascriptcore` all pass.
  The pinned Windows JSC archive passed gzip integrity validation; its COFF
  index contains all C API symbols used by the wrapper, including the watchdog.
- Focused ESLint for native contract/engine sources, product tests and the new
  module loader passed. `git diff --check` passed for the migration scope.

## Evidence limits

Windows executable linking/JIT execution and Linux runtime tests were not run
on this macOS host. The new `native-jsc.yml` workflow defines native runtime
and app tests for macOS/Linux/Windows, plus a full Windows window/audio build;
that remote workflow has not been executed here.

The Demo reports `OccludedAfterRetry` and `presented=false`. GPU readback and
product assertions pass; this does not establish visible OS-window acceptance
or Web/native pixel parity. The Demo currently has no audio cues.

The pnpm wrapper attempted dependency reconciliation and hit existing supply
chain policy blocks for chokidar/semver. Checks and package builds used the
already installed Node tool entrypoints without changing that policy. The
broader touched-TS lint set has 115 existing errors (119 in the pre-migration
workspace snapshot), with no newly introduced lint diagnostics in that set.

JSC owns its heap and stack; this migration replaces the former heap/stack/tick
fields with a validated per-call time budget. It does not claim hard memory
isolation. See [runtime design](../design/native-jsc-runtime.md) for platform
dependencies, ownership, module resolution and limits.
