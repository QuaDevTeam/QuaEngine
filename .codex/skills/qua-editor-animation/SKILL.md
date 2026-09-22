---
name: qua-editor-animation
description: Develop the visual animation editor, numeric character keyframe timelines, scene-aware Web renderer preview, and guarded animation JSON source editing.
---

# QuaEngine Animation Editor

Use with `qua-editor`, `quajs-plugin-animation` and `quaengine-development-guardrails`.

- `packages/editor/animation` is MPL-2.0 editor tooling. Preserve LICENSE/NOTICE. Built-in `qua.animation` contributes the lazy **动画** bottom panel; register its worker indexer separately and reserve its ID in the marketplace.
- Author ordinary `AnimationTimeline` JSON in `*.animation.json`, not a second runtime format. The current visual subset is numeric `self`/`character:<id>` tracks for `position.x`, `position.y`, `position.scale`, `position.rotation`, and `opacity`, with absolute ms times and number/step/discrete interpolation. Do not silently drop unsupported fields; index them as issues and keep source editing available.
- Source indexing uses the shared project worker/read boundary, at most 128 files, 512 KiB per file and 8 MiB total. Validate finite numbers, duration/track/keyframe limits, unique target-property pairs and key times, and easing. Never execute project source.
- The panel owns authoring drafts, selection, history, transport and per-project recovery. Source writes use revision-checked `applyEdit`; new files use optional `createDocument` (exclusive empty file plus undoable Monaco edit). Preserve external changes, dirty buffers and pending visual edits during reindex/save. No direct disk overwrite. Source undo and visual undo are separate.
- Opening or switching to an indexed animation JSON automatically reveals this panel and selects that record through `acceptsSource`/`revealSource`. Preserve local edits and incomplete fields with the existing explicit discard action; replace/cancel pending navigation when the active source changes. Reopening the same animation must not reset its timeline or focused form. Source selection uses saved worker metadata, not execution or a second scanner.
- **Preview context** defaults to automatic association: `scene-index.ts` parses `.qs` files with shared compiler ASTs and matches literal `@PlayAnimation` ids against a unique indexed JSON definition. Preserve actual compiler step indices (including action gaps), source lines and explicit `self=character:<id>` bindings. Multiple calls are selectable. Bound scene indexing to 256 files, 8 MiB and 10000 steps; never execute source during indexing. Dynamic/TypeScript calls are not inferred.
- `AnimationSceneControls` offers automatic, character and scene modes, manual scene/step selection, scene-character `self` rebinding and a dialogue visibility toggle. Unbound animations can use an indexed character image or arbitrary project image.
- Scene mode borrows the existing sandboxed project Web session through `EditorPluginContext.createScenePreview`: save source buffers via the normal save path, seek with engine checkpoint APIs, and reparent the same WebContentsView into the panel. Use the project renderer, complete scene/assets/styles and engine layout. Stop at unresolved choices without inventing branches. The project must expose `createEditorPreviewRuntime`; unsupported hosts report an actionable error.
- Runtime preview commands use the existing `editor/preview/request` pipeline, validated numeric data, a paused `editor:animation-preview` projection and `commit: none`. Engine APIs own projection/dialogue writes. Release removes the temporary projection and restores dialogue only at the same story point; stale traffic cannot overwrite a different scene. Coalesce scrubbing, reject obsolete async opens, and return the Web view when the panel hides.
- `AnimationPreview` creates an isolated pipeline and `QuaWebDomRenderer` with the official character plugin. Publish a readonly authoring view through `VIEW_UPDATE`; use this path only for isolated character/image preview. Keep interpolation in shared render-core/Web helpers. Images use scoped project `assetUrl`; async results check panel/project/resource identity.
- Isolated character preview uses a fixed 1920×1080 stage; scene preview uses the project layout. The stage is scaled by renderer-web layout. Position tracks are logical stage units. The editor provides its own explicitly imported preview CSS; official renderers still auto-import no styles.
- Scrubbing samples authored time; playback honors delay, rate, looping, direction and fill. Stop rAF and unmount preview when hidden, page-hidden, disposed or project-replaced. Reject stale mounts/asset completions and release drag listeners.
- New definitions default `commit: 'none'`, `fill: 'both'`. Users explicitly register/import JSON through AnimationPlugin. This panel adds no QuaScript decorators, game activation or loose runtime resource push; dynamic content still uses QPK/runtime package provenance.
- Validate animation tests/typecheck/build, editor core/Electron tests, editor typechecks/builds/lint, and `node packages/editor/electron/scripts/animation-plugin-smoke.mjs`. Real Electron evidence includes shared midpoint interpolation, image decode, pointer drag, tracks, source draft/save/undo, new-file no-overwrite and lifecycle cleanup. Run `animation-scene-smoke.mjs` for real Demo Web assets/styles, automatic binding, scene scrubbing, dialogue hiding/restoration, manual scene selection and character fallback. It copies Demo into a temporary standalone project and reuses installed workspace builds without package installation or modifying Demo. Neither smoke establishes native parity or pnpm dependency installation acceptance.

Review: preserve focused inputs across watcher refresh; preserve a second local edit while the first source draft saves; reject colliding keys and unsafe property paths; don't claim TS/QS/background/audio/sprite-layer editing or stage object dragging.

General warnings and edit/save feedback use `context.mountStatus` in the workbench
footer. Preserve recovery actions in that same element and retain the local element
for standalone hosts. Footer ownership ends with the panel mount; late callbacks
from old projects must not restore messages.

## Shared form UI

Follow [qua-editor-development-guardrails](../qua-editor-development-guardrails/SKILL.md).
Use `@quajs/editor-controls` native factories, field/group layouts and shared
palette instead of local control skins. Preserve accessible names, source
revisions, focused drafts and existing feature smoke coverage. Run the shared
`controls-smoke.mjs` when changing form presentation.

The inspector spans the stage/transport/timeline height and groups animation,
track and keyframe fields. Unit suffixes preserve precise accessible names;
localized choices preserve serialized enum values. Keep playback disclosure
open across edits. Loop mode is a select with a numeric count when needed.

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
