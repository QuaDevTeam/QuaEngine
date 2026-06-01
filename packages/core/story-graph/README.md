# @quajs/story-graph

Story graph metadata, route/lane/timeline helpers, story events, jump resolution, unlock state, and chapter select projection for QuaEngine.

The package is an engine feature package. It owns story graph state in the logic layer and exposes projections for tools or renderers to inspect. It does not render a chapter select UI.

## Engine Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { StoryGraphPlugin } from '@quajs/story-graph'

const engine = new QuaEngine()
engine.use(new StoryGraphPlugin())
```

## Graph Registration

```ts
import { registerStoryGraphWithEngine } from '@quajs/story-graph'

await registerStoryGraphWithEngine(engine, {
  id: 'main',
  title: 'Main Route',
  nodes: [{
    id: 'opening',
    point: { sceneId: 'opening', nodeId: 'opening' },
    title: 'Opening',
    chapterSelect: { order: 0, unlockOnVisit: true },
  }],
  edges: [],
})
```

Runtime graph deltas are registered through `registerStoryGraphDeltaWithEngine()` and are package-scoped. Unloading a runtime package removes package-owned nodes, edges, lanes, routes, timelines, chapter select metadata, and stale unlock entries without deleting unrelated same-scene graph content.

## Chapter Select

Chapter select is modeled as a derived projection:

- nodes appear only when a story node has `chapterSelect`;
- unlock state comes from `storyGraph.unlockedNodes`;
- first visit unlocks the node unless `unlockOnVisit: false`;
- sorting is stable by `order`, then graph/node registration order;
- no second profile store or renderer state is created.

```ts
import {
  getStoryChapterSelectProjection,
  jumpToChapterSelectNodeWithEngine,
  lockStoryNodeWithEngine,
  unlockStoryNodeWithEngine,
} from '@quajs/story-graph'

const projection = getStoryChapterSelectProjection(engine)

await unlockStoryNodeWithEngine(engine, 'opening')
await jumpToChapterSelectNodeWithEngine(engine, 'opening')
await lockStoryNodeWithEngine(engine, 'opening')
```

`jumpToChapterSelectNodeWithEngine()` only jumps to selectable, unlocked nodes. `force: true` bypasses the locked check, but does not bypass runtime package dependency checks.

## QuaScript Decorators

The package publishes package-local decorator metadata and lowering through `@quajs/story-graph/script-compiler`.

```qs
@Chapter('chapter-1', { title: 'Chapter 1' })
@Node('opening')
@ChapterSelect({
  title: 'Opening',
  summary: 'The first morning.',
  order: 0,
  unlockOnVisit: true
})
Narrator: Morning arrives.
```

Common decorators:

| Decorator | Purpose |
| --- | --- |
| `@Chapter` | Set chapter metadata on the current story point |
| `@Scene` | Set scene metadata |
| `@Entry` | Mark entry metadata |
| `@Node` | Set story node metadata |
| `@Label` | Set label metadata |
| `@Lane` | Set lane metadata |
| `@Route` | Set route metadata |
| `@StoryTimeline` | Set timeline metadata |
| `@Protagonist` | Set protagonist metadata |
| `@EmitStoryEvent` | Append a story event record |
| `@ChapterSelect` | Mark the current node for chapter select projection |

## Tooling

The script compiler records `chapterSelect` metadata in story declarations. Project inspector and the VS Code story tree expose:

- `chapterSelectable`
- `chapterSelectOrder`

These fields are for read-only inspection and editor tooling. Runtime chapter select behavior still comes from `@quajs/story-graph`.

## Runtime Package Rules

- Story graph deltas must carry package provenance.
- Chapter select thumbnails and metadata that reference runtime package assets must preserve required runtime packages.
- Jump/load helpers ensure package dependencies before entering dynamic targets.
- Default unload removes package-owned graph data and rejects active package dependencies through the engine runtime package lifecycle.
