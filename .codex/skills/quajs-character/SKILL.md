---
name: quajs-character
description: Use, document, or modify @quajs/character. Covers character/dialogue APIs, sprite/expression/move/show/hide projections, character animation decorators, QuaScript character decorators, renderer boundary, logical stage coordinates, and validation.
---

# @quajs/character

Use this skill for `packages/game/character`, character projection APIs, dialogue helper behavior, character renderer entries, or character QuaScript decorators.

## Responsibility

`@quajs/character` provides game-facing character, sprite, expression, movement, and dialogue helpers that update engine-owned state and emit pipeline events. It must not hold renderer state.

Renderer entries project character state:

- `@quajs/renderer-web/plugins/character`
- `@quajs/renderer-vue/plugins/character`
- `@quajs/renderer-cocos/plugins/character`

Dialogue renderer entries project dialogue state and must keep default chrome presence semantics aligned:

- `@quajs/renderer-web/plugins/dialogue`
- `@quajs/renderer-vue/plugins/dialogue`
- `@quajs/renderer-react/plugins/dialogue`
- `@quajs/renderer-svelte/plugins/dialogue`

## Runtime API

Prefer package helpers or plugin-facing APIs that update engine-owned projections:

```ts
await showWithEngine(engine, 'Yuki', {
  sprite: 'characters/yuki/base.png',
  expression: 'smile',
  position: { x: 960, y: 640, scale: 1 },
})

await expressionWithEngine(engine, 'Yuki', 'surprised')
await moveWithEngine(engine, 'Yuki', { x: 1100, y: 640, scale: 1.05 })
await hideWithEngine(engine, 'Yuki')

await stageCharactersWithEngine(engine, ['Yuki', 'Mara', 'Unit-7'], {
  y: 650,
  spacing: 340,
  autoScale: false,
})
```

Character positions and motion values are logical stage units.

Use `stageCharactersWithEngine` when changing the visible cast and you want engine-owned standing positions. It defaults to position-only staging and does not write scale. Set `autoScale: true` only when the story intentionally wants count-based scale, or pass explicit `positions`/`scaleByCount` values.

Character identity can be registered with `registerCharacter(s)` profiles. String refs resolve by `id` first, then by a unique `displayName`/`name`/`alias`; ambiguous display names must use an explicit id, typically through `@Speaker(id)` in QuaScript. Profiles may provide `speaker`, `speakerStyle`, `spriteBase`, `spriteManifest`, `sprites`, and `expressions` so sprite short keys such as `sad` can resolve before renderer projection.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/character/script-compiler`.

```qs
@Speaker('yuki.main')
@ShowCharacter({ sprite: 'smile', position: { x: 960, y: 640 } })
@SpeakerStyle({ color: '#7cc7ff', fontSize: 28, fontFamily: 'Qua Serif' })
Yuki: I'm here.

@SetSprite('happy')
@SetExpression('happy')
Yuki: That worked.

@MoveCharacter('Yuki', 1100, 640, 1.05)
Narrator: Yuki steps closer.
```

Decorators:

- `@Speaker(idOrAlias)`: dialogue-line only; resolves current speaker by character id or unique alias/display name.
- `@SpeakerName(value)`: dialogue-line only; overrides displayed speaker rich text/string for one line.
- `@SpeakerStyle(style)`: dialogue-line only; overrides displayed speaker style for one line.
- `@SetSprite(asset, character?)`: sets sprite for explicit character or current dialogue speaker.
- `@ShowCharacter()`, `@ShowCharacter(options)`, `@ShowCharacter(character)`, `@ShowCharacter(character, options)`: shows a character projection. The zero-arg/options forms require dialogue context and use the resolved current speaker. Do not use `undefined` placeholders.
- `@HideCharacter(character?)`: hides explicit character or current speaker.
- `@MoveCharacter(character?, x?, y?, scale?, rotation?, anchor?)`: moves explicit character or current speaker.
- `@SetExpression(expression, character?)`: sets expression for explicit character or current speaker.
- `@CharacterFade(character?, from, to, duration?, optionsOrWait?)`
- `@CharacterEnter(character?, direction, duration?, options?, wait?)`
- `@CharacterExit(character?, direction, duration?, options?, wait?)`

`CharacterEnter` and `CharacterExit` directions are commonly `left`, `right`, `top`, and `bottom`. Character animation decorators use `@quajs/plugin-animation`, and motion options may include `easing` timing functions such as `easeOutCubic`, `cubic-out`, `ease-in-out`, or `cubic-bezier(...)`.

Renderer character presence transitions are fade-in/fade-out by default. Web/Vue transition options support `enterDurationMs`, `exitDurationMs`, `moveDurationMs`, `enterEasing`, `exitEasing`, and `moveEasing`; keep these as projection parameters, not renderer-owned game state.

Renderer dialogue boxes also keep a transient enter/exit presence so default dialogue chrome can fade in/out without becoming authoritative state. Web DOM, Vue, React, and Svelte dialogue renderers should expose `data-dialogue-presence="enter|exit"` and keep project-level quick toolbar chrome synchronized with that projection instead of duplicating framework-local behavior.

## Sprite Manifests

Sprite manifest and expression diff tooling belongs to `@quajs/plugin-sprite`. Character state chooses sprite/expression; renderer sprite plugins resolve manifests as transient projection resources.

## Validation

```bash
pnpm --filter @quajs/character test -- --run
pnpm --filter @quajs/character typecheck
pnpm --filter @quajs/character build
```

Run renderer tests when character projection contracts change.

## Review Checklist

- Does character state remain engine-owned?
- Are renderer component refs, object URLs, and animation handles transient?
- Are coordinates logical stage units?
- Do decorators default to the dialogue speaker only where compiler context supports it?
- If character API, decorator, projection, or renderer behavior changed, was this skill updated?
