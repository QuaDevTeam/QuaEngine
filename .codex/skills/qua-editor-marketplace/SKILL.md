---
name: qua-editor-marketplace
description: Develop QuaEngine Editor plugin catalogs, npm installation, runtime/devtools package metadata, and dynamic editor contributions.
---

# Editor plugin marketplace

Use with `qua-editor` and `quaengine-development-guardrails`. Relevant code is in
`packages/editor/core/src/plugins/marketplace.ts`, `electron/src/plugins`, and
`ui/src/features/extensions/marketplace.ts`. See `docs/design/editor-plugins.md` for the complete
schema, publisher setup, contribution API and lifecycle.

- Default discovery/install authority is `https://registry.quaengine.com`, with
  custom HTTPS JSON discovery and exact npm package-name lookup. Registry supplies
  an approved version + integrity; main rechecks both before installation. Custom
  JSON cannot grant official badges or bypass the selected registry. Read the
  `qua-plugin-registry` skill for service/ownership/review changes.
- Package-owned `quajs.extension` schema version 1 declares runtime, devtools or both.
  Runtime-only and combined packages are production dependencies; devtools-only
  packages are development dependencies. No new QuaScript decorators are introduced.
- Browser entry exports `EditorPlugin` API 1, with optional Node indexer and CSS entry.
  Publish browser ESM with bundled or package-relative dependencies. Never import the
  Node indexer into the UI. Validate paths, IDs and versions without executing source.
- Keep npm/pnpm execution in the main process, exact versions, normal integrity and
  trust policies, disabled lifecycle scripts, bounded output and owned child cleanup.
  Do not bypass package-manager policy, accept renderer CLI strings or publish packages
  during development verification. Product publication uses a separately reviewed
  staged tarball and explicit user action. Cancellation may leave normal package-manager
  writes: refresh discovery and report the result; never roll back user files blindly.
- Installing enables compatible devtools for this project/version; existing deps require
  explicit enable. Changed versions require enable again. Built-in IDs are reserved.
  Disable disposes panels/styles and revokes resource URLs. Game imports do not activate
  editor code; runtime install does not rewrite game bootstrap.
- Built-in animation tooling reserves package `@quajs/editor-animation` and ID `qua.animation`, alongside the character and writing contributions. Its panel/indexer are explicit built-ins, never game runtime plugins or QPK renderer entries.
- Third-party devtools are trusted code, not a sandbox. Node indexers run in disposable
  workers with a timeout/heap budget. Bound responses, canonical package resources and
  project identity; keep errors local. Never imply that the small plugin context removes
  DOM/Node execution privileges or can undo arbitrary module side effects.
- Keep Runtime QPK, renderer pipeline, engine-owned state and target core selection
  separate. The marketplace is dependency/authoring tooling, not dynamic game activation.
- Empty project and detail panes omit passive “open a project” / “select a plugin”
  copy; keep controls, query results and progress. General issues appear in the
  workbench footer only while the marketplace is active; publication confirmations
  and detailed build/install logs stay with their actions.
- Update catalog/schema documentation and this skill with user-facing changes.

Validation: core/character/Electron tests; all four editor typechecks; UI/Electron builds;
editor lint. `marketplace-smoke.mjs` uses real local npm tarballs and an isolated project
for installation, scripts suppression, dynamic ESM/CSS/indexer, disable/reload and native
visibility menus. Unit integration covers runtime-only/combined dependency placement,
metadata validation and symlink/version boundaries. Run `character-plugin-smoke.mjs` if
changing contribution lifecycle. Public npm publication, arbitrary third-party packages,
Windows package-manager behavior and signed distribution need their own evidence.

## Plugin authoring and publication

- Detect explicit `quajs.extension` plugin projects from package.json without requiring
  qua.project.json or executing source. Preserve malformed metadata as visible errors.
- GitHub device login uses the configured Registry origin. Keep session tokens in
  OS-backed Electron safeStorage, never renderer/localStorage; no plaintext fallback.
- A claim becomes an undoable, revision-guarded package.json draft. Authors save/build
  before packing. Ordinary registered versions need no new claim; maintainer changes
  require new published proof. Allow ownership proof to transfer an existing row.
- Stage `npm pack --ignore-scripts` / `pnpm pack --config.ignore-scripts=true`; validate
  tar structure, plugin entries, static rules, package identity and manifest revision.
  Preview exact files/SHA-512 before explicit `npm publish` of that same artifact.
  Force public npm for global and scoped registries. Use local npm authentication;
  optional OTP is ephemeral env only and redacted from output. No lifecycle execution.
- Distinguish publication from registration: a failed registry request must be retryable
  without publishing a second time. Show pending/rejected/suspended reasons. Pre-releases
  use `next`, while registry sync follows `latest`. Cancel is not proof npm rejected a
  release. Clean staged artifacts, cancel/settle owned children on switch/close/crash.
- Keep publication UI concise: account, package/capabilities, source claim, artifact
  file/hash preview, explicit publish and submit controls; no raw pack JSON as success UI.
- Validate real npm and pnpm pack fixtures, stale manifests, missing files and claims;
  run `publishing-smoke.mjs` for standalone plugin recognition and actual Electron preview.
  This does not establish live public publication, OS keychain behavior on every platform,
  or real Jev quality. Update the service README and this skill with workflow changes.

## Built-in writing contribution

`@quajs/editor-novel-writer` reserves `qua.novel-writer` and contributes a full workspace plus a desktop host plugin managed by `EditorHostPlugins`. Activation owns a lazy authenticated service and an isolated preload. Host capabilities are built-in only; npm devtools do not gain host/service activation authority. Its project context shares the existing worker/Story Tree and static character index. QS capture includes unsaved Monaco text; conversion and structure-preserving text replacement reuse script-compiler. New files reject collisions; existing files check both the captured buffer and disk revision, then apply an undoable draft. See the novel-writer skill and `writing-project-smoke.mjs` for integration contracts and validation.

Marketplace and publisher presentation use Lit templates with native controls and
feature SCSS. Action controls inherit the shared editor-controls border, 6px radius,
palette and compact height; feature selectors only arrange them and must not
restore independent button skins. Retain generation guards and publish/install cancellation across
view changes. The external plugin starter bundles Lit with Vite, emits editor CSS
in devtools styles metadata, scopes SCSS by plugin identity and supports scoped npm
names without using them verbatim as custom-element tags. Keep runtime and devtools
entries separate. Novel Writer retains its isolated Svelte app.

The marketplace is a dockable view. Its visibility must not rewrite the workbench
grid or hide the fixed sidebar. Use the dock content's `editor-panel` container
query for narrow list/detail layouts, including source configuration controls.
Refresh the selected plugin's detail from the same accepted snapshot as the list
after enable/disable or watched manifest changes; generation guards must prevent
an older refresh from leaving the action label stale. `marketplace-smoke.mjs`
checks preserved sidebar/workspace bounds, narrow overflow and repeated enabling.
