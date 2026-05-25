# QuaScript Authoring Reference

## Minimal Valid `.qs` Shape

```qs
<script lang="ts">
export interface Scope {
  playerName: string
  canContinue: boolean
}
</script>

<script setup lang="ts">
const displayName = scope.playerName.trim()
</script>

@Scene('dorm')
@Entry('night')
Yuki: Welcome back, ${displayName}.

- Continue -> next if scope.canContinue
```

Use the module script for imports, exported types, and declarations. Use the setup script for per-factory local bindings derived from `scope`.

## Script Block Rules

- Only `lang="ts"` is valid.
- At most one module `<script lang="ts">` block.
- At most one `<script setup lang="ts">` block.
- The module script is the right place for imports and `export interface Scope`.
- The setup script is the right place for local derived values such as `const displayName = format(scope.playerName)`.
- The formatter preserves script block contents byte-for-byte, so keep them clean yourself.

## Decorator Resolution And Imports

QuaScript syntax is fixed by `@quajs/script-compiler`. Plugins cannot inject custom compiler passes or extend the DSL grammar.

Decorator names are resolved from:

1. built-in/default mappings
2. explicit `decoratorMappings`
3. value imports in the current file
4. auto-collected plugin metadata, when enabled

When auto-collection is disabled, activate plugin decorators from the current file itself.

Standalone `.qs` example:

```qs
<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground('backgrounds/classroom.png')
Yuki: Ready.
```

Host TypeScript example:

```ts
import { decorators } from '@quajs/plugin-background'

const scene = qs`
  @SetBackground('backgrounds/classroom.png')
  Yuki: Ready.
`
```

If a decorator is not discovered, imported, or explicitly registered, compilation fails with an unknown decorator error. Do not invent fallback syntax.

## Dialogue Lines

Basic form:

```qs
Alice: Hello.
Bob: Welcome back, ${scope.playerName}.
```

Rules:

- A dialogue line is `Speaker: text`.
- Speaker names may be non-ASCII.
- `${...}` interpolation must be valid TypeScript.
- Invalid or unterminated TypeScript expressions fail compilation.
- Use `scope.` explicitly for caller inputs unless the value was first assigned in `<script setup lang="ts">`.

## Decorator Attachment

Decorators attach to the next statement when there is no blank line:

```qs
@PlayVoice('voice/intro.ogg')
@SetSprite('alice/smile.png')
Alice: Hi.
```

A blank line turns them into a separate action step:

```qs
@SetSprite('alice/smile.png')

Alice: Hi.
```

That distinction matters. Action-only character decorators without an attached speaker usually need an explicit character argument:

```qs
@SetSprite('alice/smile.png', 'Alice')

Alice: Hi.
```

`@Choice(...)` blocks are special: do not mix `@Choice` with non-choice decorators in the same action block.

## Action-Only Decorators

A decorator block can be its own step:

```qs
@SetBackground('backgrounds/classroom.png')
@PlayBGM('bgm/school.ogg')

Alice: Class is starting.
```

This is useful when the action should happen before the next line and should not depend on the dialogue speaker.

## Choice Sugar

Simple branching can use sugar lines:

```qs
- Continue -> next
- Check the library -> library.enter if scope.hasKey
- Ask again -> #retry
- Return to the dorm -> scene:dorm#nightReturn
- Load side story -> script:story.side#library.enter
- Jump into runtime package content -> package:runtime.story#library.enter
```

Supported target shapes in sugar form:

- `next` or `library.enter`: node target
- `#retry`: label target
- `scene:dorm#nightReturn`: scene target with optional entry
- `script:story.side#library.enter`: script-module target with optional node fragment
- `package:runtime.story#library.enter`: runtime package node target

If the line omits `-> target`, the compiler falls back to an ID derived from the text. Use explicit targets for real branching.

## Canonical `@Choice(...)`

Use canonical choice decorators when you need helper targets, thumbnails, disabled states, custom IDs, or metadata:

```qs
@Choice('Go library', node('library.enter'), {
  when: scope.hasKey,
  unavailable: { mode: 'disabled', reason: 'Need key' },
  presentation: { thumbnail: image('story/library.png') },
  metadata: { source: 'opening' }
})
@Choice('Return to dorm', scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }))
```

Helper calls that the compiler understands in decorator arguments:

- `node(id, options?)`
- `label(id, options?)`
- `scene(sceneId, options?)`
- `script(moduleId, options?)`
- `checkpoint(id)`
- `packageNode(packageId, nodeId, options?)`
- `image(name, options?)`

Prefer canonical `@Choice(...)` over sugar when any option needs `when`, `unavailable`, `presentation`, `metadata`, or a non-string target shape.

## TypeScript Expressions And Localization

Interpolation inside dialogue and choice text is TypeScript:

```qs
Yuki: ${$t('intro.greeting', { name: scope.playerName })}!
- ${Promise.resolve('Continue')} -> next
```

Rules:

- `$t(...)` is available in runtime text resolution.
- `t` aliases `$t`.
- Async expressions are allowed in text resolution.
- Keep expressions readable. Move heavy logic into `<script setup lang="ts">` or imported helpers.

## Story Metadata Decorators

QuaScript can declare story metadata directly in the DSL:

```qs
@Chapter('chapter-1')
@Scene('library')
@Entry('main')
@Node('library.enter', {
  title: 'Library',
  thumbnail: image('story/library.png')
})
Yuki: We arrived.
```

Use this when the `.qs` file participates in story graph extraction, runtime packages, or richer navigation metadata.

## Common Pitfalls

- `@SetSprite()` without an asset is invalid.
- `@SetSprite('sprite.png')` in an action-only block is invalid unless the character is explicit.
- `@PlayVoice()` without an asset only works when `@AudioChapter(...)` plus a matching `voiceMap` entry can resolve the line ID.
- `@Choice` cannot share the same decorator action block with unrelated decorators.
- Use `@AnimationTimeline` for animation playback and `@StoryTimeline` for story metadata. Do not generate the old ambiguous `@Timeline`.
- Coordinates in character/background/animation options are logical stage coordinates owned by the engine projection, not DOM pixels.
- Do not use browser-only concepts such as CSS transforms, `vh`, `vw`, or measured element sizes as script-level coordinates.

## Validation Commands

```bash
qua-script lint "src/**/*.qs"
qua-script lint "src/**/*.qs" --fix
qua-script format "src/**/*.qs" --check
qua-script format "src/**/*.qs" --write
```

Use `qua-script compile scene.qs` or the package API when you need to inspect generated TypeScript.
