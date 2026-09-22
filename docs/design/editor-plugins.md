# Editor plugin contributions

Editor plugins extend the authoring workbench. They are independent of game
plugins, renderer plugins and executable Runtime QPK modules. `editor-core`
defines versioned contracts without loading any game runtime.

## Package metadata and marketplace

The default marketplace is `https://registry.quaengine.com`, backed by Cloudflare
Workers + D1. It accepts only already-published npm packages explicitly declaring
QuaEngine plugin capabilities; npm distributes the tarballs. System review is the
default, with optional TypeSafe Jev screening. First-time authors publish a one-time
ownership claim, register once, then Cron synchronizes future `latest` versions.
Official badges come from the registry's exact package-name allowlist. See
[Registry setup and policy](../../services/plugin-registry/README.md).

**插件 → 发布** recognizes standalone plugin package directories without a game
manifest. It supports GitHub login, a guarded claim draft, staged npm/pnpm packing,
file/integrity preview, explicit publication using local npm credentials/OTP, and
registration/status reasons. The editor never uploads npm credentials to Registry.

The bundled JSON directory at `packages/editor/electron/src/plugins/catalog.json`
and custom HTTPS JSON directories remain available for discovery. Configure sources
in **插件 → 目录源**. With Registry enabled, installations require its approved version
and matching integrity even when discovered through JSON or an exact npm name.
A custom catalog cannot grant official status. JSON entries look like:

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "name": "@example/characters",
      "title": "Characters",
      "description": "Character authoring tools",
      "tags": ["角色"]
    }
  ]
}
```

Directory entries provide discovery text only. They cannot supply executable URLs,
install commands or authoritative capabilities. Selecting an entry reads the npm
manifest, validates plugin metadata and API compatibility, and resolves a concrete
version. Exact npm package-name lookup locates packages outside a custom directory;
they must still be listed by the selected Registry before installation.
Requests use HTTPS, bounded response size/time, and no redirects. A private registry
can be configured by the host's `QUA_EDITOR_NPM_REGISTRY` environment variable;
HTTP is permitted only for loopback fixture registries. Credentials are not stored
in the catalog. Package-manager credentials continue to use the existing npm setup.

A package declares **runtime**, **devtools**, or both in `package.json`:

```json
{
  "name": "@example/characters",
  "version": "1.0.0",
  "type": "module",
  "quajs": {
    "extension": {
      "schemaVersion": 1,
      "id": "example.characters",
      "title": "Characters",
      "runtime": { "entry": "." },
      "devtools": {
        "apiVersion": 1,
        "entry": "./dist/editor.js",
        "export": "myEditorPlugin",
        "indexer": "./dist/indexer.js",
        "indexerExport": "myIndexer",
        "style": "./dist/editor.css"
      }
    }
  }
}
```

Omit either capability to ship only the other. `indexer`, `style` and export names
are optional. Defaults are `editorPlugin` / `editorIndexer`, then default exports.
Devtools entrypoints use package-relative `.js`/`.mjs` paths with no traversal;
styles use `.css`. Browser devtools must be native browser ESM with dependencies
bundled or relative imports inside the package; bare imports are not resolved in
the editor. Keep indexer/Node imports out of that browser graph. Publish all entry,
chunk and stylesheet files in the npm tarball. Legacy `quajs.type: feature` or `plugin` metadata remains discoverable locally as
runtime-only; Registry registration requires explicit `quajs.extension`. Official
feature packages now declare this metadata. Target core
packages are not ordinary marketplace extensions.

**项目内** lists installed direct project dependencies and the built-in character
tool. Discovery reads package manifests without importing game/project code. npm
and pnpm are supported, including inherited pnpm workspace configuration. Install
pins the selected version and retains normal lockfile/integrity/trust checks.
Devtools-only packages go to `devDependencies`; runtime or combined packages go
to `dependencies`. Lifecycle scripts are disabled. Only one install runs at once;
progress, errors and cancellation are visible. Cancel/error can leave package-manager
changes in place, so the editor refreshes discovery instead of overwriting a user's
manifest or lockfile to roll back. Save dirty source before installation.

Installing compatible devtools enables that exact version in the current project.
Pre-existing project dependencies need an explicit **启用 Devtools** action. External
version changes require enabling again. Disable releases panels/styles and revokes
resource URLs; it does not remove the project dependency. Runtime installation does
not rewrite game bootstrap or activate an engine plugin: configure the runtime
entry in the project's normal engine/plugin setup. Runtime QPK delivery and target
core selection remain unchanged.

The built-in character UI/indexer remain registered explicitly in
`ui/src/plugins.ts` and `electron/src/project-service/plugins.ts`. External devtools
are loaded through versioned descriptors without rebuilding the IDE. Session URLs
serve canonical files from enabled packages only, with path/size checks and stale
project rejection. Indexers run in disposable Node workers (10-second timeout,
128 MiB heap budget); browser panels use the existing lifecycle. The current cap is
16 enabled external devtools plugins per project.

Installed devtools are **trusted executable code, not a security sandbox**. The
small plugin context is an API boundary, not protection against hostile browser
code or Node indexers. Enabling executes code with the editor/user's permissions.
Authors must clean up transient resources in `dispose()`; disabling cannot undo
arbitrary side effects from a misbehaving package. No game source is executed merely
to discover a plugin. No automatic update, uninstall UI or signed-app distribution
is claimed by this first version.

As of the implementation check, the public npm registry returned 404 for
`@quajs/character` and `@quajs/plugin-sprite`; listing a catalog entry does not imply
that it is already published. The UI surfaces unavailable npm versions and leaves
installation disabled. Use the publication workflow before public installations.
Local-registry tests prove the complete installation path without publishing.

## Contribution API

```ts
import type { EditorPlugin, EditorProjectIndexer } from "@quajs/editor-core";

export const myEditorPlugin: EditorPlugin = {
  id: "example.catalog",
  apiVersion: 1,
  panels: [
    {
      id: "browser",
      title: "Catalog",
      mount: async (element, context) => {
        const { CatalogPanel } = await import("./panel.js");
        return new CatalogPanel(element, context);
      },
    },
  ],
};

// Separate worker entry, never imported by the browser entry.
export const myIndexer: EditorProjectIndexer = {
  id: "example.catalog",
  apiVersion: 1,
  index: async ({ entries, readDocument }) => {
    // Read only indexed documents through the host. Bound work and result size.
    return { paths: entries.map((entry) => entry.path) };
  },
};
```

## Lifecycle and ownership

The workbench validates API versions/IDs, creates accessible bottom tabs, includes
contributions in keyboard navigation and restores panel selection. Mounting is
lazy. Instances receive `update(project)`, `setVisible(boolean)` and `dispose()`.
Project replacement and workbench teardown dispose all mounted contributions;
late asynchronous mounts are disposed without access to the replacement panel.
Plugin exceptions produce a local error surface while other panels continue.
The host runs indexers within the existing project refresh/watch lifecycle;
index failures and non-cloneable results are isolated in each plugin's data slot.

Panels may declare `acceptsSource(project, location)` over their indexed metadata.
Opening/switching a source tab or navigating to a source location reveals the
first matching panel without moving keyboard focus out of the editor. The mounted
instance receives `revealSource(location)`; `undefined` cancels pending selection
when the active source no longer matches. Lazy mounts receive only the latest
location. Routine refreshes do not reopen a dismissed panel, but a newly indexed
active source can be recognized. Instances retain unapplied drafts and guard any
destructive selection; callbacks from older navigation must not discard them.

`EditorProject.plugins[id]` carries structured-cloneable authoring data or an
error. Source files remain the truth. Selection, search, draft form input and pane
state remain editor-local; none enters engine/store or a save file. Indexers reuse
the existing canonical bounded project file list. They must not start a second
scanner/watcher or execute game source to discover definitions.

UI plugins receive only source navigation, an undoable source-edit capability,
bounded image URLs and error reporting. They receive no generic IPC, filesystem,
terminal or preview evaluation API. A source edit includes the project root,
document revision, UTF-16 offsets and expected text. The workbench checks disk
revision, current model, project identity and bounds, then applies one Monaco undo
transaction. Dirty/conflicting buffers are preserved; saving uses the existing
optimistic and atomic save path. Changing code can affect references, so plugins
must not advertise automatic cross-file refactoring unless they implement it.

## Character contribution

`@quajs/editor-character` supplies the first panel and worker indexer. It provides
static TS/JS character discovery, manifest differences and source editing, using
the existing asset preview boundary. Its README documents static-analysis limits,
supported authoring operations and non-composited layer previews.

Run core/character/Electron tests, all four editor package typechecks, UI/Electron
builds, editor lint, `character-plugin-smoke.mjs`, `marketplace-smoke.mjs` and
`publishing-smoke.mjs`. Run registry tests and the real workerd smoke for service changes. The smoke uses real Demo
characters plus isolated fixtures for draft/undo/save protection, CRUD, image
decoding, watcher refresh, panel hiding and project replacement. It does not
establish Web/Native runtime sprite composition parity or signed distribution.

`marketplace-smoke.mjs` uses real local npm tarballs in a temporary project and
profile. It verifies exact-version installation with scripts suppressed, dynamic
ESM relative imports, stylesheet and indexer loading, enable/disable/reload, and
both native navigation menus. Unit integration also installs runtime-only and
combined packages and checks dependency placement, stale-version activation,
symlink escapes and invalid metadata. These fixtures do not establish public npm
publication, Windows installation, arbitrary third-party compatibility, or production
runtime-package trust.

## Navigation visibility

Right-click the bottom tab strip or left activity switcher (also Shift+F10) to
choose visible entries. Preferences use stable tab IDs in the editor profile's
local storage, including dynamically contributed panels. Hiding the active entry
selects a visible fallback; one available entry remains visible. Temporary panel
availability (such as Inspector without a running preview) is separate from user
visibility. Keyboard navigation skips hidden entries. Explicit feature shortcuts
reveal their destination. Novel Writer has its own writing icon; Story Outline
retains the tree icon.

## Built-in writing contribution

`@quajs/editor-novel-writer` reserves `qua.novel-writer` and contributes a full workspace plus a desktop host plugin managed by `EditorHostPlugins`. Activation owns a lazy authenticated service and an isolated preload. Host capabilities are built-in only; npm devtools do not gain host/service activation authority. Its project context shares the existing worker/Story Tree and static character index. QS capture includes unsaved Monaco text; conversion and structure-preserving text replacement reuse script-compiler. New files reject collisions; existing files check both the captured buffer and disk revision, then apply an undoable draft. See the novel-writer skill and `writing-project-smoke.mjs` for integration contracts and validation.
