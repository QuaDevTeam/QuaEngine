# __PROJECT_TITLE__

QuaEngine plugin with independent runtime and editor entries. Open this folder in
QuaEngine Editor to edit, build from the integrated terminal, and review the package
in Plugins → Publish. Plugin projects do not show a game preview.

The editor panel uses Lit with light DOM and scoped SCSS. Vite bundles Lit into the
browser entry and emits `dist/editor.css`; the devtools manifest loads that stylesheet.
Keep feature views in separate components, use native form controls and editor tokens,
and release subscriptions/resources in the panel lifecycle. Never render project
strings with `unsafeHTML`. The isolated Novel Writer app keeps its own Svelte framework.

```sh
npm install
npm run typecheck
npm run build
npm pack --ignore-scripts
```

Use `engine.use(createPlugin())` in a consuming game's bootstrap. Install and enable
the package's devtools in that game's editor to use the example panel. For a runtime-only
plugin, remove `quajs.extension.devtools`, the `./editor` export, editor build entry, `src/editor.ts` and `src/editor.scss`.
For an editor-only plugin, remove the runtime entry, engine peer/development dependency,
root export, runtime build entry and `src/index.ts`.

Game state stays in engine/store and communication uses pipeline. Editor source edits
must use `context.applyEdit` and normal document saving. Do not import browser APIs in
the runtime entry, or engine runtime code into the editor entry. Generated game content
is delivered through QPK Runtime Packages, separately from npm plugin installation.

Build explicitly before packing/publishing; the editor suppresses dependency lifecycle
scripts and never publishes automatically. Update package metadata before release.
