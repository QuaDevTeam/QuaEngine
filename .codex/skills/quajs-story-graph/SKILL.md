---
name: quajs-story-graph
description: Use, document, or modify @quajs/story-graph. Covers story metadata decorators, graph registration, lanes/routes/timelines/protagonists, chapter select projection, story events, choice targets, runtime package graph deltas, provenance, and validation.
---

# @quajs/story-graph

Use this skill for `packages/game/story-graph`, story graph metadata, chapter select behavior, graph deltas, jump helpers, or story graph QuaScript decorators.

## Responsibility

`@quajs/story-graph` owns story metadata, graph/lane/route/timeline records, story events, unlock state, and chapter select projection in the logic layer. It does not render chapter select UI.

Chapter select is derived from graph nodes marked with `chapterSelect` plus `unlockedNodes`; do not store a separate authoritative chapter select model.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { StoryGraphPlugin } from '@quajs/story-graph'

const engine = new QuaEngine()
const storyGraph = new StoryGraphPlugin()

engine.use(storyGraph)
await engine.init()
```

## Graph Registration

```ts
await storyGraph.registerGraph({
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

await storyGraph.unlockNode('opening')
await storyGraph.jumpToChapterSelectNode('opening')
```

Runtime graph deltas are registered through `storyGraph.registerDelta()` and removed on package unload by package provenance.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/story-graph/script-compiler`.

```qs
@Chapter('chapter-1', { title: 'Chapter 1' })
@Scene('school')
@Entry('library-entry')
@Node('library', { title: 'Library', summary: 'Night route' })
@Lane('main')
@Route('true-route')
@StoryTimeline('main-route')
@Protagonist('yuki')
@ChapterSelect({
  title: 'Opening',
  summary: 'The first morning.',
  order: 0,
  unlockOnVisit: true,
  lockedTitle: '???',
  lockedSummary: 'Continue to reveal this entry.'
})
Yuki: We are here.
```

Decorators:

- `@Chapter(id, metadata?)`
- `@Scene(id, metadata?)`
- `@Entry(id, metadata?)`
- `@Node(id, metadata?)`
- `@Interaction(id, metadata?)`: aliases node metadata.
- `@Label(id, metadata?)`
- `@Lane(id, metadata?)`
- `@Route(id, metadata?)`
- `@StoryTimeline(id, metadata?)`
- `@Protagonist(id, metadata?)`
- `@EmitStoryEvent(type, payload?)`
- `@ChapterSelect(options?)`

`@ChapterSelect` options commonly include `title`, `summary`, `order`, `thumbnail`, `unlockOnVisit`, `lockedVisibility`, `lockedTitle`, `lockedSummary`, `lockedThumbnail`, and `lockEntryUntilUnlocked`.

## Choice Targets

QuaScript choice targets should use structured helpers when semantics matter:

```qs
@Choice('Open route', node('library', { graphId: 'main' }))
@Choice('Return dorm', scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }))
@Choice('Runtime node', packageNode('runtime.chapter-2', 'opening'))
```

Jump helpers must ensure required runtime packages before entering dynamic targets.

## Runtime Packages

Rules:

- Runtime graph deltas and chapter select assets/metadata must carry package provenance.
- Same-scene continuation across QPKs must preserve scene, lane, route, timeline, protagonist, node, and package context.
- Unloading a runtime package removes package-owned nodes, edges, lanes, routes, timelines, chapter select metadata, and stale unlock entries without deleting unrelated same-scene graph content.
- Save/load and jumps must restore required packages before using dynamic targets.

## Validation

```bash
pnpm --filter @quajs/story-graph test -- --run
pnpm --filter @quajs/story-graph typecheck
pnpm --filter @quajs/story-graph build
```

Run script-compiler/project-inspector tests when story declaration extraction changes.

## Review Checklist

- Is chapter select still derived from graph metadata and unlock state?
- Do story points and graph deltas preserve package provenance?
- Are runtime package dependencies checked before dynamic jumps?
- Are same-scene continuations package-aware?
- If story decorators, graph shape, chapter select, or runtime deltas changed, was this skill updated?
