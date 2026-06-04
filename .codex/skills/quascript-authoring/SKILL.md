---
name: quascript-authoring
description: Write, review, explain, or update QuaScript `.qs` files and `qs` template literals. Covers the full QuaScript language surface, standalone module structure, dialogue, decorators, choices, interpolation, built-in helpers, decorator activation, plugin decorators, compiler/tooling config, and authoring boundaries.
---

# QuaScript Authoring

## Purpose

Use this skill whenever writing, reviewing, explaining, or changing QuaScript source, compiler behavior, decorator metadata, examples, or docs.

QuaScript is a TypeScript-first narrative DSL for visual-novel content. It deliberately owns a small syntax surface: dialogue, action decorators, choices, metadata decorators, interpolation, and TypeScript integration. It is not a general-purpose scripting language.

## Source Forms

QuaScript appears in two forms:

- Standalone `.qs` modules compiled to a default `createQuaScript(scope?)` factory returning `GameStep[]`.
- `qs` tagged template literals inside TypeScript host modules.

Standalone `.qs` files may contain one module script and one setup script:

```qs
<script lang="ts">
import { formatName } from './story-helpers'

export interface Scope {
  playerName: string
  hasKey: boolean
}
</script>

<script setup lang="ts">
const displayName = formatName(scope.playerName)
</script>

Heroine: Hello ${displayName}.
```

Rules:

- `<script>` blocks must use `lang="ts"`.
- Only one non-setup script and one setup script are allowed.
- The module script is for imports, exported `Scope`, exported helpers, and declarations.
- The setup script is evaluated inside the generated factory and can reference `scope`.
- In standalone modules, use `scope.foo` unless a setup binding gives the value a local name.

In TypeScript host files, use `qs` template literals:

```ts
const steps = qs`
Heroine: The door is open.
- Enter -> library
- Leave -> #outside
`
```

## Core Syntax

### Dialogue

Dialogue is one line with a top-level colon:

```qs
Character: Text
Yukino: Hello ${scope.playerName}.
Narrator: A colon inside ${format({ label: 'x:y' })} is safe.
```

The speaker name is everything before the top-level `:` after trimming. Speaker names may be non-ASCII. Dialogue text is everything after the colon after leading whitespace is removed.

### Interpolation

Use `${...}` inside dialogue text and choice text for normal TypeScript expressions:

```qs
Narrator: ${scope.playerName} has ${scope.coins} coins.
- Buy ${itemName} -> shop-buy if scope.coins >= price
```

Interpolation must be non-empty and balanced. The compiler exposes `$t` and `t` aliases for `ctx.t(...)` inside interpolated text, and uses `resolveQuaText` for mixed text/expression output.

### Decorators

Decorators start with `@Name` or `@Name(...)`. Arguments are parsed as TypeScript expressions:

```qs
@SetBackground('images/bg/station.jpg', { transition: { type: 'fade', duration: 400 } })
@PlayBGM('audio/bgm/night.ogg', { loop: true })
Narrator: Rain folds over the station roof.
```

Supported argument values include strings, numbers, booleans, `null`, arrays, objects, unary negative numbers, and arbitrary TypeScript expressions such as helper calls.

Decorator placement:

- Consecutive decorators immediately before a dialogue line attach to that dialogue and run before `speakWithEngine`.
- A blank line between decorators and the next dialogue makes the decorators an action-only step.
- Decorators without a following dialogue are action-only steps.
- Multi-line decorator calls are allowed as long as parentheses are balanced.

### Choice Sugar

Choice sugar lines start with `- `:

```qs
- Choice text
- Choice text -> target
- Choice text -> target if condition
- Choice text if condition
```

Sugar target strings are normalized as:

- `target` -> `{ kind: 'node', id: 'target' }`
- `#label` -> `{ kind: 'label', id: 'label' }`
- `scene:sceneId#entryId` -> scene target with optional `entry`
- `script:moduleId#nodeId` -> script target with optional `nodeId`
- `package:packageId#nodeId` -> runtime package node target

When a choice has a target, the generated step shows choices, waits for `user/choice_select`, stores the selected payload on `ctx.choice`, then calls `ctx.engine.jumpToChoice(...)`. If no target is present, it clears choices after selection.

### `@Choice(...)`

Use `@Choice(text, target?, options?)` for structured targets, metadata, presentation, unavailable policy, and helper calls:

```qs
@Choice('Go library', node('library'), {
  id: 'go-library',
  when: scope.hasKey,
  unavailable: { mode: 'disabled', reason: 'Need key' },
  presentation: { thumbnail: image('story/library-thumb.jpg') },
  metadata: { route: 'night' }
})
@Choice('Return dorm', scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }))
```

Do not mix `@Choice` with non-choice decorators in the same decorator block. Multiple consecutive `@Choice` decorators become one choice step.

## Built-In Helpers

QuaScript expressions may call engine helper functions; the compiler imports them when used:

- `node(id, options?)`
- `label(id, options?)`
- `scene(sceneId, options?)`
- `script(moduleId, options?)`
- `checkpoint(id)`
- `packageNode(packageId, nodeId, options?)`
- `image(name, options?)`

Use these helpers in `@Choice` targets, choice presentation, story metadata, and similar TypeScript expression positions.

## Built-In Decorators

Engine/save decorators:

- `@SaveToSlot(slotId, metadata?, options?)`
- `@LoadFromSlot(slotId, options?)`
- `@QuickSave(metadata?, options?)`
- `@QuickLoad()`
- `@AutoSave(metadata?, options?)`

Load decorators such as `@LoadFromSlot` and `@QuickLoad` terminate the current generated step after loading so later dialogue in the same step does not overwrite restored state.

Flow-control decorators:

- `@FlowControl(policy)` / `@FlowControlPolicy(policy)`
- `@ResetFlowControlPolicy`
- `@Skippable(value = true)` / `@NoSkip`
- `@Forwardable(value = true)` / `@NoForward`
- `@AutoAdvanceable(value = true)` / `@NoAutoAdvance`

Rollback decorators:

- `@RollbackAnchor(reason?, options?)`
- `@RollbackBoundary(reason?, options?)`
- `@FixRollback(options?)`
- `@NoRollback`

Choice decorator:

- `@Choice(text, target?, options?)`

## Feature Decorators

Decorator availability is explicit. A plugin decorator is usable only if it is a built-in, registered through tooling config, activated by a current-file value import, or auto-collected from package metadata.

Common package decorators:

- `@quajs/character`: `SetSprite`, `ShowCharacter`, `HideCharacter`, `MoveCharacter`, `SetExpression`, `CharacterFade`, `CharacterEnter`, `CharacterExit`
- `@quajs/story-graph`: `Chapter`, `Scene`, `Entry`, `Node`, `Label`, `Lane`, `Route`, `StoryTimeline`, `Protagonist`, `Interaction`, `EmitStoryEvent`, `ChapterSelect`
- `@quajs/plugin-background`: `SetBackground`, `ClearBackground`, `VideoBackground`, `SetLayeredBackground`, `BackgroundLayer`, `RemoveBackgroundLayer`, `ClearBackgroundLayers`, `BackgroundTransition`, `BackgroundLayerTransition`, `ShowCgOverlay`, `HideCgOverlay`
- `@quajs/plugin-audio`: `AudioChapter`, `LineId`, `PlayVoice`, `PlayBGM`, `PlaySFX`, `PlayAmbient`, `SetAudioGain`, `SetAudioEq`, `SetAudioAutomation`, `StopAudio`, `PauseAudio`, `ResumeAudio`, `SeekAudio`, `StopVoice`, `StopBGM`, `StopSFX`, `StopAmbient`
- `@quajs/plugin-animation`: `DefineAnimation`, `AnimationTimeline`, `Key`, `PlayAnimation`
- `@quajs/plugin-backlog`: `Backlog`, `NoBacklog`
- `@quajs/plugin-gallery`: `UnlockGallery`, `OpenGalleryScene`
- `@quajs/plugin-achievement`: `UnlockAchievement`, `OpenAchievementBoard`
- `@quajs/plugin-inventory`: `GrantInventoryItem`, `ConsumeInventoryItem`, `SetInventoryItemQuantity`

For detailed package usage, load the matching project skill such as `quajs-plugin-audio`, `quajs-plugin-background`, `quajs-character`, or `quajs-story-graph`.

## Decorator Activation

Resolution order:

1. Built-in engine decorators.
2. Explicit `decoratorMappings`.
3. Value imports in the current `.qs`/host module.
4. Auto-collected plugin decorators discovered from package metadata.

Local explicit activation example:

```qs
<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground('images/bg/station.jpg')
Narrator: The station returns.
```

Tooling config can disable auto-collection:

```json
{
  "decorators": {
    "autoCollect": false,
    "mappings": {
      "SetBackground": {
        "function": "setBackgroundWithEngine",
        "module": "@quajs/plugin-background"
      }
    }
  }
}
```

The same config shape is read from `quascript.config.json`, `qua.config.json#quascript`, and `package.json#quascript`.

## Story Metadata

Use story decorators to make routing and graph/tooling metadata visible:

```qs
@Chapter('chapter-1', { title: 'Chapter 1' })
@Scene('school')
@Entry('library-entry')
@Node('library', { title: 'Library', summary: 'Night route' })
@StoryTimeline('main-route')
@Protagonist('yuki')
@ChapterSelect({
  title: 'Opening',
  summary: 'The first morning.',
  order: 0,
  unlockOnVisit: true,
  lockedTitle: '???'
})
Yuki: We are here.
```

Story-point metadata becomes generated step metadata. Runtime package builds must preserve `contentPackageId` and required runtime package provenance.

## Audio Chapter Pattern

`@AudioChapter` can establish chapter defaults and a voice map. Dialogue without explicit `@PlayVoice` may resolve an implicit voice from the current chapter:

```qs
@AudioChapter('ch01', {
  bgm: 'audio/bgm/ch01.ogg',
  voiceMap: {
    'ch01:1': 'voice/ch01/yuki-001.ogg',
    'line-custom': 'voice/ch01/yuki-custom.ogg'
  }
})
@PlayBGM('audio/bgm/ch01.ogg', { loop: true })
Yuki: First mapped line.

@LineId('line-custom')
Yuki: Custom mapped line.
```

`@PlayVoice()` may omit the asset only when a current chapter voice map contains the resolved line id.

## Animation Pattern

Use `@AnimationTimeline(duration, wait?)` followed by `@Key(...)` for inline timelines. On dialogue lines, omitted key targets default to `character:<speaker>`.

```qs
@AnimationTimeline(600, true)
@Key('opacity', 0, 0)
@Key('opacity', 600, 1)
Unit7: I am here.

@AnimationTimeline(1200)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 1200, 1.08, 'easeOutCubic')
Narrator: The room breathes.
```

Use `@DefineAnimation(id, duration)` plus `@PlayAnimation(id, ...bindings, wait?)` for reusable timelines.

## Boundaries

QuaScript should not grow into:

- a custom control-flow language;
- a plugin-extensible grammar surface;
- large imperative logic blocks;
- plugin-specific compiler branches;
- hidden syntax changed by installed plugins.

Plugins may provide runtime functions and decorator compilers owned by their package. They must not alter the QuaScript grammar or redefine core syntax.

When a need is stateful, algorithmic, reusable, or complex, implement it in TypeScript and call it from the `.qs` file.

## Authoring Rules

Prefer:

- dialogue in plain `Character: text`
- declarative stage/audio/animation/story metadata in decorators
- branching in choices
- short, named setup bindings
- compact decorator groups attached to their target

Do not hide primary story flow inside large helper calls when a normal dialogue/decorator/choice structure would be clearer.

Use `<script lang="ts">` for imports, exported `Scope`, shared constants, and helper declarations.

Use `<script setup lang="ts">` for local computed bindings consumed by dialogue text, decorator args, or choice conditions.

Prefer:

```qs
<script setup lang="ts">
const canEnterLibrary = scope.flags.libraryUnlocked && scope.time === 'night'
</script>

@Choice('Enter library', node('library'), { when: canEnterLibrary })
```

Over:

```qs
@Choice('Enter library', node('library'), { when: scope.flags.libraryUnlocked && scope.time === 'night' && complexCall(scope) })
```

If the condition is getting busy, name it in setup code.

Feature behavior comes from decorators and imported helpers, not from plugin-defined syntax.

Prefer domain-qualified names when a generic term could clash with another feature.

Examples:

- use `AnimationTimeline`
- use `StoryTimeline`
- do not overload a generic `Timeline`

Avoid:

- deeply nested object literals in-place when a named binding would read better
- long chains of opaque decorators with no clear grouping
- large amounts of business logic in `${...}`
- adding syntax where an imported TypeScript helper would work

## Recommended Patterns

Feature actions:

```qs
@SetBackground('bg/library-night.png')
@PlayBGM('bgm/night-theme.ogg')
@AnimationTimeline(360, true)
@Key('position.x', 0, -120)
@Key('position.x', 360, 0)
Yuki: It's quiet tonight.
```

Imported helpers:

```qs
<script lang="ts">
import { buildLibraryThumbnail } from './story-helpers'
</script>

<script setup lang="ts">
const thumbnail = buildLibraryThumbnail(scope.chapter)
</script>

@Choice('Inspect library', node('library'), {
  presentation: { thumbnail }
})
```

## Review Checklist

When reviewing a `.qs` file, ask:

- Is the primary story flow readable directly from the DSL?
- Is complex logic kept in TypeScript instead of growing the DSL?
- Are decorators actually activated by built-ins, explicit mappings, local imports, or auto-collect?
- Are plugin decorators handled by package-owned compiler entries instead of custom grammar?
- Are choice targets structured when runtime package, scene, script, or checkpoint semantics matter?
- Do story metadata and runtime package content preserve provenance?
- Would this feature be better expressed as an imported helper than as new syntax?
- Are timeline/story decorator names collision-resistant?
- If syntax, decorator behavior, or plugin usage changes, was the relevant project skill updated in the same change?
