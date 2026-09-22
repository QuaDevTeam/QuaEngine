---
name: qua-editor-character
description: Develop the character editor plugin, static character/profile and sprite-manifest indexing, contributed bottom panel, and guarded source edits.
---

# Character editor plugin

Use with `qua-editor`, `quajs-character`, and `quajs-plugin-sprite` for
`packages/editor/character`. This package is the editor counterpart, not an engine
or renderer plugin. It adds no QuaScript syntax or decorators.

- Browser entry exports `characterEditorPlugin`; worker-only `./indexer` exports
  `characterEditorIndexer`. This built-in is explicitly registered in both hosts;
  `quajs.extension.devtools` also documents its entrypoints.
  Never import TypeScript/Node indexers into the UI or game runtime into the editor.
- Use TypeScript AST/symbols for bounded static discovery of direct character API
  imports and local constants. Preserve source locations/revisions. Support Demo's
  tuple `.map()` declarations without executing any project function. Dynamic or
  incomplete declarations need visible warnings and source navigation.
- Reuse host-indexed canonical files and image URLs. No independent scan/watch,
  arbitrary filesystem URL, source execution or QPK unpacking path.
- Opening/switching indexed character source or its sprite manifest reveals the
  browser and selects the corresponding character. Use source line/column for
  files containing several definitions; preserve an applicable existing choice
  at a file header or shared manifest. Pending form edits require an explicit
  discard before automatic selection, and unrelated/newer navigation cancels
  stale switch actions. Match only existing worker metadata via `acceptsSource`
  and receive locations through `revealSource`; do not execute project source.
- Literal names/IDs, profile array insertion/removal and JSON manifest
  expression/path changes become undoable Monaco drafts through `applyEdit`.
  Preserve comments/unrelated properties; reject stale revisions and dirty files.
  ID/reference refactoring is not implemented. Dynamic/shared fields open source.
- Keep UI state local. Preserve typed form inputs during watcher refresh. Dispose
  across project switches, cancel late thumbnails and release hidden images.
  Multiple layers are separate source-image previews, not exact game composition.
- Authoring assets remain source; runtime updates use the normal build/QPK path.
  No live loose-resource injection or authoritative character state is introduced.
- Keep limits documented and visible (source count/bytes, evaluation budget,
  manifests, profiles, expressions, displayed rows/layers and thumbnail concurrency).

Validate character/core/Electron tests, editor typechecks, UI/Electron builds and
lint. Run `node packages/editor/electron/scripts/character-plugin-smoke.mjs` for
actual Demo image decoding, keyboard panels, draft/undo/save/conflict protection,
CRUD, watching and project cleanup. Artifacts live under
`.codex-tmp/editor-character-plugin-smoke/`.

Review: no project code execution; no renderer/game state ownership; provenance
and dynamic limitations are explicit; source edits use the existing document
lifecycle; asynchronous work cannot paint stale project data. See
`docs/design/editor-plugins.md` and package README for registration and limits.

The panel starts without an “open a project” instruction row. Mount index issues,
validation and edit feedback through `context.mountStatus` in the workbench footer;
the host scopes visibility to this panel and removes it on project replacement.
Standalone hosts without the capability retain the local status element.

The browser uses compact character identity rows, a difference thumbnail grid and
one selected-expression inspector. Keep card selection separate from source editing;
double-click navigates to source. Preserve forms/revisions across refresh and hidden
panels, and keep independent layers visibly identified rather than pretending they
are a composited sprite. The built-in plugin ID is reserved and cannot be replaced
by a project package. Runtime and editor package metadata are separate capabilities;
see `qua-editor-marketplace` for external package installation.

Difference browsing keeps counts and optional previous/next pagination in the
sticky search header, outside the thumbnail grid. Show 60 expressions per page;
do not strand later entries behind a truncation warning or require searching to
reach them. Search resets the page, while hiding or refreshing the same character
retains its query/page (clamped to available results). Changing character/project
resets browsing. Paging/filtering must not rebuild the expression inspector or
discard its draft. Use a full-width shared empty state for no results. Validate
64-entry paging, search reset, draft retention and compact geometry in the actual
Electron character smoke.

## Shared form UI

Follow [qua-editor-development-guardrails](../qua-editor-development-guardrails/SKILL.md).
Use `@quajs/editor-controls` native factories, field/group layouts and shared
palette instead of local control skins. Preserve accessible names, source
revisions, focused drafts and existing feature smoke coverage. Run the shared
`controls-smoke.mjs` when changing form presentation.

Editor forms use shared Lit Web Components and SCSS. Sources are organized under `indexing`, `model`, `editor` and, for animation, `preview`. Build Sass into `dist/styles.css` for browser-loaded plugin metadata; Vite workbench imports the SCSS source. Panel hosts may move between dock groups without disposal; multiple panels can remain visible.

Presentation is now rendered through Lit templates from `@quajs/editor-controls`.
Keep controller draft/revision and async lifecycle guards independent from the view.
Render status recovery actions and later status text through the same Lit root;
do not remove its marker nodes with `textContent` or `replaceChildren`.


Plugin styling inherits the workbench's `--editor-*` semantic theme tokens from
`editor-controls/src/themes.scss`. Support Qua and Graphite in both light and dark
modes without resetting a local palette or remounting forms. Asset/game preview
pixels retain their original colors. Include `theme-smoke.mjs` alongside the
feature smoke after theme changes; verify focused or unsaved drafts survive.
