# QuaEngine Editor

**English** · [简体中文](README.md)

Standalone Electron authoring workspace for QuaEngine Web / Native development. It does not depend on devframe or a VS Code runtime. Start with the [Editor handbook](../../docs/content/docs/en/editor/index.md); this reference describes integration and implementation boundaries.

## Source setup and project creation

Use Node.js 22.12+ and pnpm 12.3.4 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:editor
```

The command builds editor dependencies, templates, SDK, and the writing tool before launch. macOS source builds require Xcode Command Line Tools and the Electron Node-API headers identified by build errors. Native preview additionally requires Rust/Cargo and system linking tools.

File → New Project (**文件 → 新建项目**) creates a normal Vue/QuaScript game or runtime/devtools plugin package in a newly reserved child directory. Templates include source/configuration and local SDK archives under `vendor/quajs`; new projects are portable outside the checkout. Plugin projects use build operations rather than game preview.

Project opening/preview checks dependencies and managed tools, showing progress, cancellation, and retry. Missing Node/npm/pnpm/Rust tools download into the editor profile's `runtimes`, using official SHA-256 checks. Installation does not modify global shell configuration. System SDKs/linkers still need platform setup.

## Licensing and contribution

First-party code under `packages/editor/`, including core, UI, Electron, character/animation tools, and Novel Writer, uses [MPL-2.0](LICENSE). Other engine packages use their declared licenses. This is directory-specific coverage rather than a choice of MPL or Apache for IDE source.

Commercial use and forks are allowed. Distributed covered files/modifications must remain available as source under MPL, with notices and corresponding-source instructions preserved. Upstream contribution is welcome, not mandatory. See [CONTRIBUTING](CONTRIBUTING.md), [NOTICE](NOTICE), and the repository [LEGAL](../../LEGAL.md). Editor-authored game content is not automatically covered by the editor's license; brand assets and Demo creative content have separate terms.

## Independent releases and networking

Editor stable/beta releases are independent of engine npm publishing. `editor-release.yml` builds platform artifacts; `editor-components.yml` updates compatible boilerplate/runtime components. `release/config.json` declares compatibility ranges. New projects consume the selected component; existing project dependencies are not silently rewritten.

```sh
pnpm --dir packages/editor/release install --frozen-lockfile
pnpm --filter @quajs/editor-electron build:release
```

Release settings include `QUA_EDITOR_CHANNEL`, `QUA_EDITOR_VERSION`, `QUA_EDITOR_TARGET`, and `QUA_EDITOR_ARCH`. Beta versions use prerelease suffixes. Full publication/signing configuration remains in the [release reference (Chinese)](release/README.md). [Get the editor](../../docs/content/docs/en/editor/downloads.md) describes actual artifact availability separately from configured workflows.

Update checks run at startup/every six hours and from Help. HTTPS, size/hash, product/version/channel/platform/architecture, and compatibility validation precede staging. Explicit restart saves drafts and respects close guards. The helper retains the original user-data path and previous application; failed startup acknowledgement rolls back. Development Electron is never replaced by the updater.

macOS distribution requires Developer ID signing, notarization, stapling, and Gatekeeper verification in CI, including the final extracted archive. Windows is currently unsigned; Windows/Linux tests are deferred while builds and integrity checks remain enabled. Local packaging is not CI signing or live release evidence.

Main HTTP uses Chromium's system proxy handling. Owned child tools use the per-destination proxy bridge for system proxy, PAC, bypass, and CA behavior. No global proxy/shell mutation or silent direct retry is introduced. Loopback preview/writer services remain local.

## Package responsibilities

| Package                   | Responsibility                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `core`                    | Portable project/document contracts, preview sessions, cancellation/stop, optional game preview runtime       |
| `ui`                      | Host-neutral Lit/SCSS workbench, Monaco, source drafts, docking, tools                                        |
| `electron`                | Isolated preload, Node workers, revision-checked atomic saving, files, managed processes, Web/Native adapters |
| `controls`                | Shared Lit controls, theme tokens, fields, and disclosures                                                    |
| `character` / `animation` | Built-in authoring tools with guarded source application                                                      |
| `novel-writer`            | Isolated Svelte writing app and lazy local service                                                            |

CPU-intensive indexing, language analysis, and ESLint run in workers. Project diagnostics reuse project-inspector, language-server, and script-compiler, rather than evaluating arbitrary game code.

## Documents, diagnostics, and files

Monaco supports QuaScript/TypeScript diagnostics, completion, hover, F12, formatting, parameter hints, commands, and multi-cursor editing. Speaker colors are stable across project files; narration, comments, choices, and interpolation retain syntax coloring. Completion signatures come from active compiler/decorator metadata rather than guessed runtime signatures.

Project checks inspect saved indexed QS and the actual TS configuration. Dirty open QS/TS/JS buffers supply live diagnostics for their files. If the project installs and configures ESLint, its parser/rules/ignores run in a worker without automatic fixes. Missing lint dependencies/configuration errors are reported; absent configuration skips ESLint.

One Monaco editor retains bounded document models (24 models, 24 MiB text budget). Saved inactive models may be evicted; dirty documents are retained. Multiple tabs preserve drafts/undo/scroll. Clean files follow external changes; dirty files offer read-only comparison, explicit Keep Local and Save, or confirmed Load Disk Version. Saving rechecks the disk revision. Deleted/unreadable files retain buffers and block saving; automatic three-way merge/general crash recovery are not provided.

Bounded watching refreshes files, assets, story, targets, and diagnostics without reopening the project or clearing drafts. Index limits include 20000 files, 1024 directories, and depth 10; symlinks/dependency/hidden/generated trees are excluded. Refresh Project retries a snapshot after warnings.

Explorer supports natural folder-first sorting, fuzzy filtering, keyboard navigation, create/rename/cut/copy/paste/trash, and internal moves. Paths update for open tabs, but imports/asset references do not. Copy reads disk. Filesystem undo, multi-selection, and external file-drop import are not implemented.

Project search uses bundled ripgrep, saved indexed text, Rust regex, and include/exclude globs. Limits include 2 MB per file and 1000 matches. Assets Browser provides folder/type/name filtering, sorting, grid/list, bounded image previews, media playback, and copy/import. Image metadata is read from source headers, including EXIF orientation. Font/QPK/ZIP content previews and reference-aware asset renaming are not provided.

## Workspace, forms, and themes

Explorer/Search/Git/Story form a fixed left navigation area, not draggable dock views. Code, preview, tools, and plugin panels support split/merge/hide/reopen, keyboard alternatives, and locally persisted layout. Moving views preserves Monaco, terminals, and plugin instances. Layout restoration does not restore old shell processes.

Statement Properties (**语句属性**) is a separate bottom view that follows the source cursor. Old code/split/visual modes were removed. Forms edit current dialogue/speaker, literal/nested command fields, and supported background/audio/character actions. They update ordinary undoable Monaco drafts, never the renderer's game state. Complex expressions/arrays/choices use source editing; invalid syntax suspends forms.

Settings support search, categories, modified-only filtering, item/all reset, fonts, indentation, formatting, terminal settings, density, motion, and layout. Qua/Graphite each have light/dark palettes with system mode. Monaco/xterm/plugin controls share semantic tokens while the game and Novel Writer retain their own themes. Apply changes to existing instances without discarding drafts or sessions.

## Preview and source seeking

Web runs project `dev:web` or `dev` with local Vite host/port in a no-Node WebContentsView. Every session uses a temporary isolated Chromium partition. Stopping clears its storage.

Native runs `dev:native`. On macOS, the project's WGPU CAMetalLayer is embedded through CAContext/NSView/CALayerHost; the editor does not read back frames or refresh screenshots. Native embedding currently supports macOS only and pointer input; Windows/Linux embedding and full keyboard/IME/wheel/independent viewport resizing are not implemented. Unsupported hosts report errors rather than fall back to image transport.

Preview adapters do not import target cores or recreate bootstrap. The project owns target resolution, manifests, and QPK verification. Switching targets saves documents, stops the old backend, and starts the chosen entry without migrating live state.

Optional development integration uses `@quajs/editor-core/runtime`:

```ts
const preview = import.meta.env.DEV && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1'
  ? await (await import('@quajs/editor-core/runtime')).createEditorPreviewRuntime(engine, {
      baselinePoint: { sceneId: 'main', stepId: 'editor:baseline' },
      resolveFile: path => registeredScriptFactories[path],
    })
  : undefined
```

Validate registered project-relative paths and return lazy factories with compiler-consistent steps and independent story points. Invoke factories after checkpoint restoration. Web exposes the fixed request function as `globalThis.__QUA_EDITOR_PREVIEW__`; Native maps bounded commands through the existing host bridge/pipeline rather than arbitrary JS evaluation. Dispose subscriptions and Web globals with the session.

To Cursor and Run to This Line save first, resolve compiler step locations, restore the project's baseline, and replay the target file. Unresolved choices pause. This is single-file seeking, not reconstruction of every prior chapter/branch. The project must prepare suitable baseline state.

Saving QS reloads and attempts to restore the current step. Unmatched/deleted steps replay from the file start; absent files/unlocated sessions return to project startup. Web refreshes through CDP; Native rebuilds JSC/QPK, restarts, and restores. Project editor mode must avoid duplicate HMR/watch. Engine/Rust implementation changes still require ordinary rebuilding.

Popout/fullscreen/redocking retain the session. Preview mute persists across stop/restart/target switch within one editor run without changing game volume or audio progress. Errors appear in preview and the debug console and retry after fixing/saving.

## Inspector, storage, performance, and scene tools

Inspector reads actual Web DOM or Native QUI through CDP, with read-only filtering, tree navigation, bounds, and styles. Polling runs only while visible. It is not a full DevTools/style editor.

Storage reads session Local/Session Storage, IndexedDB, Cache Storage, Native saves/Host namespaces, QPKs, and resident resources. Binary data is bounded. Native saves need the development runtime; Web renderer handle estimates need resource-query injection and exclude internal browser/GPU memory. Current Native Demo uses in-memory backends; production persistence is project-specific.

Performance samples 5 times/second over 60 seconds and pauses when hidden. Web FPS is rAF frequency; Native FPS/draw calls are submitted render telemetry. CPU/RSS covers the preview renderer rather than all build/editor services, with 100% per logical core. macOS GPU utilization is system-wide; unavailable OS/allocator metrics show `—`.

Web Scene Debugging records executed dialogue/audio intent and supports stepping, automatic/manual reading, dialogue replay, and guarded source picking. Literal single-line dialogue editing creates normal drafts with undo/save. Source/version/project/session checks reject stale or unsupported edits. Interpolated/rich/multiline content navigates to source. Audio intent intervals are not decoded waveforms, and arbitrary timeline restoration is not available. The devtools entry is imported only for editor-enabled Vite serve; production builds must exclude tool code and source markers.

## Terminal, Git, and extensions

The lazy xterm.js/node-pty terminal runs real shells in the project (home without a project), supports up to six sessions and configurable scrollback, and cleans managed children on project switch/shutdown. Detached daemons are outside cleanup guarantees. Terminal input is not a sandbox; sessions/output do not survive restart.

Git exposes staged/worktree/conflict groups, read-only diff tabs, staging, commits, and normal local branch switching. Keep Drafts retains revision guards; normal `git switch` refuses overwrites. No automatic stash, force checkout, push, or pull is provided. Diff tabs do not replace document tabs.

The marketplace discovers explicit `quajs.extension` runtime/devtools capabilities and installs exact npm/pnpm versions with lifecycle scripts disabled. Devtools enablement does not wire a runtime into game bootstrap. Third-party code runs with user privileges; Registry screening is not a sandbox. See the [marketplace workflow](../../docs/content/docs/en/editor/marketplace.md), [character reference](character/README.md), and [animation reference](animation/README.md).

Novel Writer retains its Svelte app, local data, stage review, project context, and guarded intelligent QS writeback. Hiding it does not cancel generation. Apply creates source drafts with compiler/revision validation; real models still need independent quality review. See the [writing guide](../../docs/content/docs/en/editor/novel-writer.md).

## Production builds

File → Production Build or Ctrl/Cmd+Shift+B saves and stops preview, then calls the project's Quack chain. The dialog supports Web output and macOS Native `.app`, reports real stages/bundle counts/durations, retains background progress, exposes cancellation/artifacts, and opens logs on failure. Closing it does not cancel.

Identity/icons/signing/notarization belong in `qua.project.*`; credentials stay outside source. Skipped notarization is not success. Building a game is separate from Editor release or publication. See [production builds](../../docs/content/docs/en/editor/builds.md).

## Validation and limits of evidence

For documentation-only changes, check/build the independent docs workspace and exercise localized routes/search/navigation; rebuilding the editor is not required. Runtime changes need affected package tests/typechecks/builds and actual Electron smoke. Useful scripts under `packages/editor/electron/scripts/` include `settings-dock-smoke.mjs`, `theme-smoke.mjs`, `visual-authoring-smoke.mjs`, `scene-debugger-smoke.mjs`, `preview-tools-smoke.mjs`, `terminal-smoke.mjs`, `marketplace-smoke.mjs`, and `packaged-update-smoke.mjs` (which requires an archive).

Smoke artifacts use ignored `.codex-tmp/editor-*/` directories. A macOS development result is not Windows/Linux, Native visual parity, physical input coverage, provider quality, or CI signing/publication evidence. See the Chinese source reference for the complete script inventory and historical implementation details.
