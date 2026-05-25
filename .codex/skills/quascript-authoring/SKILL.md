---
name: quascript-authoring
description: Write and review QuaScript `.qs` files with the correct language boundary, decorator activation model, and authoring patterns. Use when creating, editing, reviewing, or explaining QuaScript source.
---

# QuaScript Authoring

## Purpose

Use this skill when working on `.qs` files.

QuaScript is a narrative DSL for visual-novel content. It is not a general-purpose scripting language and should not be treated like one.

## What QuaScript Owns

QuaScript is responsible for:

- dialogue lines
- action decorator sequences
- choice blocks and `@Choice(...)`
- story-point metadata decorators such as scene/node/entry/label/timeline/protagonist routing
- light inline expressions through `${...}`
- imported TypeScript bindings used from `<script lang="ts">` and `<script setup lang="ts">`

Keep authored story flow readable in the DSL and move real logic into imported TypeScript helpers.

## What QuaScript Does Not Own

QuaScript should not grow into:

- a custom control-flow language
- a plugin-extensible grammar surface
- a place for large imperative logic blocks
- a place for plugin-specific compiler injection
- a dumping ground for every feature that does not fit current syntax

When a need is stateful, algorithmic, reusable, or complex, implement it in TypeScript and call it from the `.qs` file.

## Authoring Rules

### 1. Keep narrative structure in the DSL

Prefer:

- dialogue in plain `Character: text`
- declarative stage/audio/animation/story metadata in decorators
- branching in choices

Do not hide primary story flow inside large helper calls when a normal dialogue/decorator/choice structure would be clearer.

### 2. Keep logic in TypeScript

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

### 3. Decorators are explicit feature hooks

Feature behavior comes from decorators and imported helpers, not from plugin-defined syntax.

Allowed decorator sources are only:

1. compiler built-ins
2. explicit `decoratorMappings`
3. current-file value imports that activate decorators from imported modules
4. optional automatic decorator collection

Do not assume a plugin decorator is available unless one of those activation paths exists.

### 4. Plugins cannot change QuaScript grammar

Plugins may:

- provide runtime functions
- provide decorator metadata
- provide decorator compilers owned by the feature package

Plugins may not:

- inject custom QuaScript compiler branches
- define new statements or blocks
- redefine core syntax
- make QuaScript parse differently per project

If a feature cannot fit as imported TypeScript plus decorators, stop and design a language change explicitly instead of smuggling it through plugin behavior.

### 5. Use collision-resistant names

Prefer domain-qualified names when a generic term could clash with another feature.

Examples:

- use `AnimationTimeline`
- use `StoryTimeline`
- do not overload a generic `Timeline`

### 6. Keep `.qs` files readable

Prefer:

- short, named setup bindings
- compact decorator groups attached to the statement they affect
- straightforward choice text and targets
- one obvious narrative flow

Avoid:

- deeply nested object literals in-place when a named binding would read better
- long chains of opaque decorators with no clear grouping
- large amounts of business logic in `${...}`

## Recommended Patterns

### Story metadata

Use story decorators to keep routing and provenance visible in the script:

```qs
@Scene('school')
@Entry('library-entry')
@Node('library')
@StoryTimeline('main-route')
Yuki: We are here.
```

### Feature actions

Use feature decorators for stage/audio/animation declarations:

```qs
@SetBackground('bg/library-night.png')
@PlayBGM('bgm/night-theme.ogg')
@AnimationTimeline(360, true)
@Key('position.x', 0, -120)
@Key('position.x', 360, 0)
Yuki: It's quiet tonight.
```

### Imported helpers

Use imported functions when the DSL needs real logic or reusable shaping:

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
- Would this feature be better expressed as an imported helper than as new syntax?
- Are timeline/story decorator names collision-resistant?
- Is any plugin trying to influence QuaScript syntax rather than supplying decorators/functions?

If the answer to the last two questions is yes, push the design back toward explicit helpers and stable decorators.
