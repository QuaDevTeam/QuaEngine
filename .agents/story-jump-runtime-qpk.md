# Choice Decorator, Story Targets, Scenes, And Runtime QPKs

## Boundary

Renderer implementations remain stateless projections. They render engine-owned `view.choices`, emit `user/choice_select`, and never resolve targets, load QPKs, decide progression, or own story state.

Authoritative choice jump behavior belongs to `@quajs/engine`. Story graph indexing belongs to `@quajs/story-graph`. Runtime content remains QPK package-based and is activated through `RuntimeContentManager`.

## Canonical Choice Model

`@Choice(text, target, options)` is the canonical QuaScript model. Line syntax is sugar only:

```qs
@Choice('去图书馆', node('library'), {
  when: canEnterLibrary,
  unavailable: { mode: 'disabled', reason: '需要图书馆钥匙' },
  presentation: { thumbnail: image('story/library-thumb.png') }
})

- 回宿舍 -> scene:dorm#nightReturn if canReturnDorm
```

Compiler output must normalize both forms to engine `ChoiceIntent` with:

- `target`: structured `ChoiceTarget`
- `metadata.jumpTarget`: same structured target for projection persistence and plugins
- `metadata.storyGraph.edge`: graph edge metadata
- optional `presentation` and `unavailable`

Engine code must not parse bare target strings at runtime. Bare strings are compiler input only.

## Target Shapes

- `node(id, options?)`: story graph node, current scene by default unless `sceneId` is explicit.
- `label(id, options?)`: QS label marker.
- `scene(sceneId, { entry?, state?, transition? })`: explicit cross-scene transition with serializable initial state.
- `script(moduleId, { nodeId?, labelId?, entryId?, stepId?, packageId?, scope? })`: script module entry.
- `checkpoint(id)`: engine checkpoint.
- `packageNode(packageId, nodeId, options?)`: package-scoped node to remove ambiguity.

Cross-scene choice jumps are allowed only through `scene(...)` or `scene:id#entry` sugar. Scene `state` and script `scope` must be JSON-serializable.

## Resolution Flow

1. `jumpToChoice(choiceId)` reads the selected choice from `engine.view.choices`.
2. Engine reads `choice.metadata.jumpTarget` or the structured `choice.target` extension.
3. Built-in resolution handles `checkpoint`, already-registered `scene`, and direct `script` targets.
4. Registered story target resolvers are queried. `@quajs/story-graph` registers one during plugin setup.
5. If unresolved, `RuntimeContentManager.resolveStoryTargetFromRegistry()` calls `RuntimePackageRegistry.resolveStoryTarget(target, ctx)`.
6. Candidate QPKs are loaded and activated through normal trust/package lifecycle.
7. Engine queries the active resolvers again. Ambiguity is an error.
8. Engine ensures all `requiredRuntimePackages` from target, graph node, script metadata, checkpoint metadata, and active projection dependencies.
9. Engine clears choices and performs the resolved plan: `jumpTo(point/checkpoint)`, `runScriptModuleFrom(...)`, or scene transition.

## Story Graph Index

`@quajs/story-graph` resolves active graph nodes by structured target:

- `node`: matches node id or `point.nodeId`
- `label`: matches node id or `point.labelId`
- `package-node`: matches `nodeId` plus package provenance
- `script`: matches `point.scriptModuleId` plus optional node/label/entry/step

Targets without an explicit package are constrained to current scene when the resolved node has `sceneId`. This keeps normal node/label jumps aligned with rollback scene boundaries. Use `scene(...)` for deliberate scene changes.

Same-scene multi-QPK continuation is valid. Package-scoped graph deltas must carry `contentPackageId` and dependency metadata so save/load, rollback, backlog, and unload protection can restore or reject safely.

## Story Tree And Assets

Story markers are declared with decorators:

```qs
@Scene('library')
@Node('library.enter', {
  title: '图书馆入口',
  summary: '夜晚的旧图书馆',
  thumbnail: image('story/library-enter.png'),
  background: image('backgrounds/library-night.png')
})
Yuki: 我们到了。
```

The compiler extracts a `StoryDeclaration` from `.qs` files containing scenes, nodes, labels, choices, edges, story points, presentation metadata, and asset refs. Asset refs are structural data, not URLs:

```ts
{ type: 'images', name: 'story/library-enter.png', runtimePackageId, alt, focalPoint }
```

Quack writes declaration data into:

- `runtimePackage.scripts[].metadata.story`
- `runtimePackage.storyGraphDeltas[]`

Renderer or story-map UI may transiently resolve asset URLs from engine/assets projections, but it never owns story tree state.

Engine-owned story-map helpers resolve refs as bytes/metadata, not URLs:

```ts
await engine.resolveStoryAssetRef({
  type: 'images',
  name: 'story/library-enter.png',
  runtimePackageId: 'runtime.library'
})
```

The result includes `AssetData`, `contentPackageId`, and `requiredRuntimePackages`. Web renderers can turn `AssetData` into object URLs transiently through Web asset helpers.

## Scene Entry

Scene targets create a rollback scene boundary and call registered scene factories:

```ts
engine.registerScene('dorm', () => new DormScene())
```

Runtime QPKs may declare scene factories in `runtimePackage.scenes[]`:

```ts
{
  id: 'runtime.dorm',
  version: '1.0.0',
  scenes: [{ id: 'dorm', assetName: 'dorm-scene.js', exportName: 'createScene' }]
}
```

If a `scene(...)` target points at an unregistered scene, engine leaves built-in resolution unresolved so `RuntimePackageRegistry.resolveStoryTarget()` can locate and activate a QPK. Activation loads scene modules through the injected `runtimeModuleLoader.loadSceneModule`; unload removes the package-owned scene factory. Duplicate scene IDs across active packages or pre-registered app scenes are rejected.

`Scene.init(ctx)` and `Scene.run(ctx)` receive `SceneEnterContext` with `entry`, serializable `initialState`, transition, source choice, previous scene, previous story point, and required runtime packages. The scene may use engine/store APIs to apply authoritative initial state.

## Tooling Rules

Language tooling should treat `@Choice` as primary:

- completions for `Choice`, `Node`, `Label`, `Scene`, `Entry`
- completions for `node`, `label`, `scene`, `script`, `packageNode`, `checkpoint`, `image`
- indexed target completions from current file, project `.qs` declarations, and runtime package story metadata
- `image()` asset completions from project asset roots
- go-to-definition for node, label, and scene targets when declarations are available
- diagnostics for unresolved/ambiguous targets, cross-scene non-scene targets, non-serializable scene/script state, missing story assets, unknown package IDs, missing package dependencies, and overly complex sugar `if`
- code action to expand sugar into `@Choice(...)`

The current implementation includes the compiler/runtime foundation plus VSCode/LSP syntax, completions, definitions, diagnostics, and sugar-expansion support. Diagnostics remain static authoring checks; final runtime resolution still belongs to the engine resolver pipeline.
