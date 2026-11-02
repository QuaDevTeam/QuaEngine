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
