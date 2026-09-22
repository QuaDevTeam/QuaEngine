---
name: qua-editor-development-guardrails
description: Develop or review QuaEngine Editor workbench and plugin UI under packages/editor. Use for shared atomic controls, forms, inspector layout, styling, accessibility, draft editing, asynchronous panel lifecycle, and actual Electron validation. Pair with qua-editor and the affected feature skill.
---

# Editor development guardrails

Use with `qua-editor` for `packages/editor/{controls,ui,animation,character,electron,core}`.
For the isolated Svelte Novel Writer, use `novel-writer` and its development
guardrails; keep its shadcn components and document boundary.

## Read the right implementation

- Shared Lit views and native form adapters: `packages/editor/controls/src/index.ts`.
- Form dimensions and states: `packages/editor/controls/src/styles.scss`; shared light/dark palettes: `packages/editor/controls/src/themes.scss`.
- Usage/API: `packages/editor/controls/README.md`.
- Workbench layout: `packages/editor/ui/src/workbench/styles/index.scss`.
- Representative property forms: `animation/src/editor/views.ts`,
  `character/src/editor/forms.ts`, `ui/src/features/properties/controller.ts`.
- Document/host contracts and preview sessions: `packages/editor/core/src`;
  host implementation stays in `packages/editor/electron`.

Paths above are repository-relative. Read the affected feature skill before
changing its indexing, source editing, preview or host behavior.

## One set of form controls

1. Import `button`, `input`, `select`, `checkbox`, `textarea`, `field`, and
   `section` from `@quajs/editor-controls`. Input/button factories return native controls; field/section/empty-state wrappers
   are Web Components rendered with Lit. Keep native properties and events.
2. Import `@quajs/editor-controls/styles.scss` explicitly once at the host entry.
   Use `.editor-ui` for the workbench document or `.editor-controls` for a
   standalone plugin panel. Existing native markup inherits the same baseline.
   Never inject it into a game preview or Novel Writer. Preserve exclusions for
   Monaco, xterm and `.qua-stage` descendants.
3. Use the shared `--editor-*` tokens: 26px compact control height, 32px comfortable dialog actions, 6px control radius,
   4/8/12/16px spacing, one input surface, border, focus and invalid palette.
   Feature CSS owns arrangement, widths, overflow and specialized visuals such
   as timeline keys. Do not redefine a panel-wide button/input/select skin.
4. Add missing reusable variants to `editor-controls` and migrate the affected
   consumers together. Do not import `editor-ui` from editor plugins, put DOM
   widgets into host-independent core, or create a second token set per feature.
5. Prefer `field(label, control, { layout: 'row' | 'stack' | 'inline', unit })`.
   Use aligned rows in inspectors, stacked fields in narrow forms and inline
   fields in toolbars. Put units in suffixes; include units/context in
   `accessibleName` when needed. Position units remain logical stage pixels.
6. Keep interface text concrete and brief. Display understandable option names
   while preserving serialized enum values. Reserve primary style for the main
   apply/create action; use danger style for deletion. Use existing workbench
   icons, with labels/tooltips, for familiar toolbar actions.
   Use the shared `.icon-button` square, non-shrinking hit area. Compact variants
   set only `--editor-icon-button-size`; do not vary width/height independently.
   Constrained activity bars scroll internally instead of shrinking square
   buttons or letting them overlap the bottom panel. The titlebar view picker uses
   a 26px square layout icon with an accessible name and tooltip; preserve Enter
   activation and Escape dismissal.
   Preserve native select chevrons and reserved text padding; local surfaces use
   `background-color` so hover/focus does not reset the shared arrow image.
   Use shared `emptyState` for dedicated empty surfaces: icon, concise title,
   useful context and an available next action. Distinguish no project, no results
   and waiting states. Omit repetitive one-line onboarding rows in populated
   panels. Keep loading, results, validation and actionable errors visible. Route general one-line warnings and operation feedback to the
   workbench context status area, scoped to the active panel/sidebar/workspace;
   empty status containers must not reserve a row. Keep field-specific validation
   and confirmations with the affected control. Plugin panels use optional
   `context.mountStatus(element)`; the host owns visibility and disposal.

```ts
import { button, field, input, section, html, render } from '@quajs/editor-controls'

const duration = input(draft.duration, value => changeDraft(Number(value)), {
  type: 'number', min: 1, max: 60000,
})
render(html`${section('动画',
  field('时长', duration, { unit: 'ms', accessibleName: '时长 ms' }),
  button('应用到源文件', applyDraft, 'primary'),
)}`, inspector)
```

## Native interaction and usable layout

- Reactive action buttons use `buttonView(label, action?, options?)` or `iconButtonView(label, icon, action?, options?)` from `editor-controls`; imperative `button()` uses the same markup. Reuse default/primary/quiet/danger variants, compact/comfortable sizes, icons and busy/disabled semantics. Busy means a shared spinner, native disabled and `aria-busy`; preserve native node identity across updates. A `className` is for arrangement, never a local skin. Keep primary actions clear and icon-only names explicit. Use `data-control-size="comfortable"` to align dialog fields with 32px actions. Scope workbench footer styling to `.workbench-statusbar`; global `footer` / `footer button` rules must not override settings/build/dialog controls. Buttons, inputs/selects and search-field shells share the 6px radius; structural tree/tab rows retain their layout semantics.

- Workbench dialogs and popovers use the shared `--editor-dialog-radius` (12px). Keep compact control radii separate. Constrained dialogs scroll their body while retaining the header/actions; progress dialogs show actual stages with explicit success/failure/skip/cancel states, elapsed time and optional log disclosure. Never fabricate percentages or infer build completion from human log strings.
- Reuse `disclosure(summary, content, { open?, onToggle?, transition?, className? })` from `editor-controls` for expandable sections. It keeps native details/summary keyboard and accessibility behavior, retained child DOM/drafts, and interruptible intrinsic-height/chevron CSS transitions. Omit `open` for native state; pass `open` and `onToggle` together for controlled state. Keep nested toggles scoped. `transition` defaults on; `--editor-disclosure-duration` defaults to 180ms and respects OS/editor reduced motion. Unsupported hosts retain native instantaneous behavior. Do not rebuild child forms or add JS height timers. Production logs and search advanced options are reference consumers.

- Associate every field with a real label; placeholder text is not a label.
  Keep stable accessible names used by tests. `field` preserves an existing
  name, generates a unique ID and binds `label.htmlFor`. Actions are siblings,
  never interactive children inside a label.
- Retain Tab/Shift+Tab, Space checkbox activation, native select keyboard
  behavior, Escape dialogs and visible keyboard focus. Do not replace selects
  with custom popup lists just for styling. Use `type=button` except form submit.
- Distinguish disabled, readonly, invalid and empty states. Readonly values
  remain selectable. Use actual `disabled`, not opacity alone. Validation
  belongs to the owning feature; shared input guards native bounds/steps and
  prevents empty/nonfinite numbers from silently becoming zero.
- For live input, preserve IME composition and the caret. Never rebuild a
  focused field on watcher/poll updates. Keep unfinished form values, selection,
  scroll and disclosure state across unrelated refreshes.
- Use `minmax(0, 1fr)`/`min-width:0`/`min-height:0` at grid/flex boundaries;
  scroll the content pane, not the entire workbench. Toolbars may wrap but their
  labels must remain intact. Verify both ordinary and compact desktop windows.
- Animation inspectors span the stage and timeline height. Keep preview bounds
  attached to the real stage element; changing form layout must not leave a
  WebContentsView covering transport, inspector, dialogs or another panel.

## State, source and lifecycle

- Controls contain presentation and transient input state only. Callbacks go to
  the owning editor feature. Game state stays in engine/store; preview intents
  use the existing session transport and pipeline. No widget owns a game model.
- Source edits go through the existing document/Monaco lifecycle: validate
  project identity, source revision and expected slice; apply undoable drafts;
  save through existing commands. Do not bypass dirty-buffer conflicts or write
  directly from a form to disk. New paths must reject collisions.
- Reuse worker indexes and host asset APIs. Do not execute project code to
  populate a form, rescan independently, or expose arbitrary filesystem URLs.
- Own and dispose listeners, observers, timers, image URLs and preview handles.
  Invalidate asynchronous results on project/session replacement. Suspend work
  while a panel/document is hidden; keep retained data and DOM bounded.
- Preserve existing workspace changes. New editor packages carry MPL-2.0
  metadata, LICENSE and NOTICE; no engine/runtime dependency is needed for
   generic UI controls.

## Validation and handoff

1. Run affected package typechecks/builds and scoped lint. Build controls before
   their consumers. Run existing source/model tests when editing their behavior.
2. For control semantics, run `pnpm --filter @quajs/editor-controls test`.
   Cover meaningful boundaries such as invalid numeric drafts, source-safe
   callbacks and labels; do not assert every CSS declaration in unit tests.
3. Rebuild UI/Electron and run
   `node packages/editor/electron/scripts/controls-smoke.mjs`. It checks real
   control geometry/palette across five forms, units, validation, label/keyboard
   interaction, persistent disclosure and compact layout. Inspect screenshots
   in `.codex-tmp/editor-controls-smoke/`.
4. Run affected feature smoke scripts (animation-plugin, animation-scene,
   character-plugin, visual-authoring, workbench). Preserve draft/undo/save,
   source conflict and real preview checks after restyling.
5. If workspace dependency policy blocks pnpm installation, use already
   installed binaries to validate; do not weaken trust policy. Report that limit
   separately from actual test results. UI build success is not visual QA.
6. Update this skill when shared conventions change; update the feature skill
   and package docs for new behavior. Report what was tested and any remaining
   limits; a macOS Electron smoke is not Windows/Linux visual acceptance.

## Lit, Sass and movable views

- The editor workbench uses Lit light-DOM components with SCSS. `ui/src/shared/components/element.ts` is the component base; shell components live under `app/shell`, settings under `features/settings`, and docking under `workbench/layout` and `workbench/components`. Use Lit templates for new reusable presentation. Never interpolate project text through `unsafeHTML`; it is reserved for bundled icon markup.
- Fixed navigation (Explorer/Search/Git/Story) stays outside the dock tree, has no group tabs and cannot be dragged, split or merged. Activity buttons switch retained sidebar hosts; independent width resizing preserves keyboard and embedded-preview bounds handling. Restore old layout data by removing only fixed navigation entries, never by discarding unrelated panel positions.
- Keep native inputs/selects, labels, keyboard semantics and IME. Reparent a view's existing host and retain Monaco, xterm, forms and plugin instances; do not rebuild them when tabs move. Native preview/writer bounds must follow actual hosts and suspend while dragging, resizing or showing a modal. Route writer commands by focused WebContents when source and writer are visible together.
- Feature controllers and SCSS belong together under `ui/src/features/<feature>`. `app` owns document/project/authoring coordination; `workbench` owns layout and contribution lifecycle; `shared` owns reusable presentation. Electron main IPC is grouped under `electron/src/main/ipc`, behind the same validated sender handler. Animation and character packages separate indexing, model/source edits, editor forms and preview.
- Settings definitions, validation, local persistence, Lit view and Monaco application are separate modules. Every exposed setting must change actual behavior. Validate saved values independently; preserve current drafts on rejected numeric input. Theme tokens, settings, layout and terminal options are editor-local, never game state.
- Avoid decorative middot/bullet text joins. Use a complete short sentence, labeled metadata, parentheses for shortcuts or separate layout elements. Keep dirty indicators and genuine lists semantically distinct from text separators.
- Run `settings-dock-smoke.mjs`, `visual-authoring-smoke.mjs`, `controls-smoke.mjs` and source/panel regressions after layout or component changes. Inspect ordinary and compact settings screenshots. Test split/merge/close/reopen, persistence, native bounds and retained terminal/form drafts.

## Presentation ownership

- All workbench and official plugin presentation uses Lit templates and SCSS. The isolated Novel Writer remains Svelte and is excluded from this migration. Shared exports in `editor-controls/src/view.ts` include `EditorElement`, `html`, `render`, `repeat`, `live`, `ref` and `styleMap`. External plugin starters bundle Lit and Sass with Vite, declare the emitted stylesheet in devtools metadata and never depend on the host resolving bare browser imports.
- Prefer declarative `LitElement` components for new feature views and `repeat` with stable identity for lists. Existing source/lifecycle controllers can call `render(template, host)`. `element(template)` creates one owned root only for native integration refs, virtual rows or the native form adapters; do not build a second generic tag/string DOM factory.
- Give each render root one owner. Never call `replaceChildren` or assign `textContent` on a root after calling Lit `render`; clear with `render(nothing, host)`. First render does not remove pre-existing manual content. Initialize empty hosts or hand them over explicitly once. Do not mix a parent template's child part with a second render owner.
- DOM movement remains intentional at integration boundaries: dock hosts, Monaco/xterm, browser/native previews, lazy plugin mounts and bounded virtualization retain their original elements and resource owners. Avoid a fresh component or editor instance on each data refresh. Model edits, validation, async generation checks and cleanup remain controller responsibilities.


## Theme-aware presentation

Use shared semantic `--editor-*` colors for every workbench/plugin surface, border,
text, selection, focus and status. `primary` pairs with `on-primary`; `accent` is
for links and focus. Avoid literal white labels or dark field backgrounds. The
root resolves the profile's Qua/Graphite palette and system/light/dark preference;
plugins inherit it without defining their own `color-scheme` or fixed palette.
Asset previews and rendered game content retain their actual pixels. Keep native
platform traffic-light semantics. Resolve tokens for Monaco/xterm/canvas through
the theme integration and dispose subscriptions with their owner. Theme changes
must preserve focused fields, source drafts and terminal sessions. Run the real
Electron `theme-smoke.mjs`, inspect light/dark and compact screenshots, and check
text contrast as well as shared form/feature regressions.

## Regression fixtures

Use fresh temporary Electron profiles for smoke tests; `electron/scripts/smoke-profile.mjs`
provides cleanup for scripts that do not own a profile. Use `demo-fixture.mjs` for
Web/Native preview checks against installed builds, with isolated source/assets and
normal preview adapters. Do not modify the live Demo or change dependency trust
policy. Native fixtures can reuse built workspace packages while still bundling
their own JSC/QPK and exercising the actual renderer. Match source rows by
`data-path` or their label instead of whitespace-sensitive whole-row text. Compare
focus colors against resolved theme tokens. Keep geometry, real user interactions,
retained resources and source safety assertions when updating old tests.
