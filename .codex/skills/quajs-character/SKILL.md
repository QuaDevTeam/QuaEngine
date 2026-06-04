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
```

Character positions and motion values are logical stage units.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/character/script-compiler`.

```qs
@ShowCharacter('Yuki', 'characters/yuki/base.png', 'smile', 960, 640)
Yuki: I'm here.

@SetSprite('characters/yuki/happy.png')
@SetExpression('happy')
Yuki: That worked.

@MoveCharacter('Yuki', 1100, 640, 1.05)
Narrator: Yuki steps closer.
```

Decorators:

- `@SetSprite(asset, character?)`: sets sprite for explicit character or current dialogue speaker.
- `@ShowCharacter(character?, sprite?, expression?, x?, y?, layer?)`: shows a character projection.
- `@HideCharacter(character?)`: hides explicit character or current speaker.
- `@MoveCharacter(character?, x?, y?, scale?, rotation?, anchor?)`: moves explicit character or current speaker.
- `@SetExpression(expression, character?)`: sets expression for explicit character or current speaker.
- `@CharacterFade(character?, from, to, duration?, optionsOrWait?)`
- `@CharacterEnter(character?, direction, duration?, options?, wait?)`
- `@CharacterExit(character?, direction, duration?, options?, wait?)`

`CharacterEnter` and `CharacterExit` directions are commonly `left`, `right`, `top`, and `bottom`. Character animation decorators use `@quajs/plugin-animation`.

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
