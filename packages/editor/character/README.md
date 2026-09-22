# Character editor plugin

`@quajs/editor-character` is the authoring counterpart of `@quajs/character` and
`@quajs/plugin-sprite`. It contributes a **角色浏览器** bottom panel to QuaEngine
Editor. It does not import or initialize the game runtime.

Opening or switching to an indexed character definition or sprite manifest opens
the browser and selects its character. Source navigation uses the line/column
when a file contains multiple characters. Unapplied form edits remain in place
until you explicitly discard them to follow another character; unrelated files
do not change the current panel. Recognition uses the saved project index.

The panel searches registered character definitions, navigates to source, previews
sprite assets in a compact difference grid, edits literal names/IDs/asset paths, and adds/removes literal array
profiles and manifest expressions. Changes become undoable Monaco drafts. Save
normally to update the project index and preview. ID changes and removal do not
rewrite story references. Existing unsaved or externally changed source is never
overwritten by an indexed edit.

The Node-only `@quajs/editor-character/indexer` entry statically reads direct
`registerCharacter`, `registerCharacters` and `createCharacter` imports from
`@quajs/character`. Named import aliases, namespace imports, project-relative
constant imports, object/array literals, shorthand, spreads, `as`/`satisfies`,
template strings and finite expression-bodied array `.map()` with destructured
parameters are supported. This includes Demo's authored character list. Arbitrary
function calls, runtime mutations, computed property keys, factories, package
barrels, tsconfig aliases and runtime-generated definitions are not evaluated.
Dynamic registrations and partial definitions have source-linked warnings. This
is a source catalog, not the set of active runtime characters.

Version-1 JSON sprite manifests resolve from the existing indexed
`assets/characters` directory (or an explicit project-relative path). Resource
previews reuse bounded host image URLs. Multilayer expressions show individual
layer images, not a renderer-accurate composite; atlas crops/masks/transforms and
QPK-only assets should be inspected in game preview/source. The panel never
pushes loose assets to a running game.

Indexing is bounded to 512 TS/JS source files / 16 MiB, 2000 profiles, 128 manifests
/ 16 MiB and 1000 expressions per manifest. Static evaluation also has depth and
operation limits. The panel shows 100 filtered characters, 60 filtered expressions
per page and eight layers per expression at once, with four thumbnail requests in
flight. A sticky search header shows the result count and previous/next controls
when multiple pages are available. Search resets to the first page; panel hiding
and index refresh retain the current character's query and page. Browsing does
not reset the expression inspector's draft. Hidden panels cancel pending display
work and release images.

See [editor-plugins.md](../../../docs/design/editor-plugins.md) for plugin
registration and host contracts. Validation:

```sh
pnpm --filter @quajs/editor-character test
pnpm --filter @quajs/editor-character typecheck
pnpm --filter @quajs/editor-character build
node packages/editor/electron/scripts/character-plugin-smoke.mjs
```

Select a difference card to edit its paths in the property inspector; double-click
opens the definition. The package declares a devtools-only `quajs.extension` with
separate browser/indexer/style entries. It currently ships built into the editor,
with its ID reserved; publishing and replacing the bundled copy is a separate
release workflow. `@quajs/character` declares the independent runtime capability.
