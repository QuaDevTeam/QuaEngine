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

await speakWithEngine(engine, 'Yuki', 'I can speak off-screen.', {
  avatar: { type: 'characters', name: 'yuki/avatar.png' },
})

await narrateWithEngine(engine, 'Rain folds over the station roof.')

await stageCharactersWithEngine(engine, ['Yuki', 'Mara', 'Unit-7'], {
  y: 650,
  spacing: 340,
  autoScale: false,
})
```

Character positions and motion values are logical stage units.

Use `stageCharactersWithEngine` when changing the visible cast and you want engine-owned standing positions. It defaults to position-only staging and does not write scale. Set `autoScale: true` only when the story intentionally wants count-based scale, or pass explicit `positions`/`scaleByCount` values.

Character identity can be registered with `registerCharacter(s)` profiles. String refs resolve by `id` first, then by a unique `displayName`/`name`/`alias`; ambiguous display names must use an explicit id, typically through `@Speaker(id)` in QuaScript. Profiles may provide `avatar`, `speaker`, `speakerStyle`, `spriteBase`, `spriteManifest`, `sprites`, and `expressions` so sprite short keys such as `sad` can resolve before renderer projection.

Dialogue avatars are optional projection assets for the dialogue box, useful when a character speaks off-screen. `avatar` accepts an asset object such as `{ type: 'images' | 'characters', name, runtimePackageId?, alt?, metadata? }` or a string shorthand for an `images` asset. Avatars do not show/hide characters, do not change sprite state, and are omitted by default.

## Native QuickJS

Native QPK scripts import the same `@quajs/character` helpers, but the Rust QuickJS evaluator must suspend with `pendingHelperCall`. The TS product host registers `speakWithEngine`, `narrateWithEngine`, `showWithEngine`, `hideWithEngine`, `moveWithEngine`, `expressionWithEngine`, and `spriteWithEngine` through `quickJsHelperModules`; `@quajs/engine-native` invokes them with the real `StepContext.engine`. Do not duplicate character profiles, aliases, or sprite-key resolution in Rust. Product smoke must register a profile and verify the resulting native character projection/command graph.

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

The native WGPU renderer uses a `500x750` logical standing-sprite reference box at a 1080 logical stage height when character width/height are omitted, matching the Web demo's 500px standing-character width and common 2:3 art ratio. The box scales with logical stage height; explicit engine-projected width/height continue to override it.

Renderer dialogue boxes also keep a transient enter/exit presence so default dialogue chrome can fade in/out without becoming authoritative state. Web DOM, Vue, React, and Svelte dialogue renderers should expose `data-dialogue-presence="enter|exit"` and keep project-level quick toolbar chrome synchronized with that projection instead of duplicating framework-local behavior.

Dialogue avatar renderers may resolve asset URLs or native resources as transient implementation details. They must not treat avatars as character presence, standing sprite state, or progression authority.

Official Web, Vue, React, Svelte, and Cocos dialogue renderers project `mode: 'narration'` speakerless dialogue as text-only dialogue chrome: no implicit `Narrator`, no speaker element/text, and no avatar unless the projection explicitly provides one.

## Sprite Manifests

Sprite manifest and expression diff tooling belongs to `@quajs/plugin-sprite`. Character state chooses sprite/expression; renderer sprite plugins resolve manifests as transient projection resources.

Native resolved sprite layers share a character stacking context. Compose layers before applying character opacity and transient presence opacity, so fades preserve overlap colors; layer z-index must not interleave with neighboring characters. These are transient renderer operations, with no new engine-owned state. The product app also resolves sprite manifests/expressions and atlas frames from mounted QPK resources. Parent/local offsets, scale and rotation compose in logical units; negative uniform character scale follows Web `scale(...)` on both axes. Metadata caches never own character identity or expression state and invalidate with package mounts/patches/unload. Native layer timelines now project offsetX/offsetY/scale/rotation/opacity/integral zIndex/visible/blendMode after QPK resolution, including zero and negative layer scale. Use spriteLayer selectors (base index 0, expressions from 1) with `commit: 'none'`; there is no built-in spriteLayer final-state adapter. See the animation skill and `scripts/native-render-audit/sprite-animation.mjs`. Mixed intrinsic-size/trimmed-frame canvas layout remains incomplete; explicit-size parent transforms and masks have separate Metal/Chrome fixtures in `scripts/native-render-audit/features.mjs`.

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
- Do optional dialogue avatars remain dialogue projection data rather than character sprite state?
- If character API, decorator, projection, or renderer behavior changed, was this skill updated?


## Authored environment lighting

`ViewBackgroundProjection.characterLighting` is optional engine-owned presentation data set through background options/QS. It has sRGB `ambient` RGB multipliers and an optional `shade` with RGB `color` and normalized sprite-box `from/to` coordinates. The background plugin deep-copies it, carries destination lighting during replacement transitions and removes it for unlit/cleared backgrounds; engine snapshots must deep-copy nested vectors. It is authored content, not an inferred renderer policy or player preference.

Web's character subentry owns SVG matrix/gradient rendering and masks the final composed character once with SourceAlpha. Vue only converts shared descriptors to VNodes; DOM React/Svelte reuse Web. Identity profiles create no filter. Do not add duplicate PNG/Canvas caches, alpha-derived fake normals, scene-filename heuristics or another event bus. Source images keep normal QuaAssets ownership. GPU intermediate surfaces are real overhead outside URL budgets. Native/Cocos currently retain original sprite colors; do not claim parity. Validate transition reset, detached snapshots, real browser alpha edges and current-version save/load. See `demo/.agents/environment-lighting.md` and `demo/scripts/lighting-pixels.mjs`.
