# QuaScript Decorator Discovery

QuaScript decorator support is package-owned. Do not guess decorator names or argument shapes.
Plugins may declare decorators, but they may not inject custom QuaScript compiler modules or grammar extensions.

The old shared `@Timeline` name has been split at the source:

- `@StoryTimeline` for story-graph metadata
- `@AnimationTimeline` for animation playback

Do not reintroduce the old ambiguous `@Timeline` name.

## Source Of Truth

Check these in order:

1. Package metadata:
   - `package.json#quajs.decorators`
   - `package.json#quajs.language.decorators`
2. Current compiler resolution rules:
   - `packages/build/script-compiler/src/core/transformer.ts`
   - `packages/build/script-compiler/src/decorators/loaders.ts`
   - `packages/build/script-compiler/src/integrations/plugin-aware-transformer.ts`
   - `packages/build/script-compiler/src/integrations/hot-reload-transformer.ts`
3. Owning package compile behavior:
   - `src/script-compiler.ts`
4. End-to-end examples and expectations:
   - `packages/build/script-compiler/test/*.test.ts`

The compiler package itself should stay focused on orchestration and discovery. Feature behavior belongs in the feature package that owns the decorator.

## Fast Inspection Commands

```bash
rg -n '"quajs"|"decorators"|"language"' packages/*/*/package.json
sed -n '1,220p' packages/core/engine/src/script-compiler.ts
sed -n '1,240p' packages/core/character/src/script-compiler.ts
sed -n '1,260p' packages/build/script-compiler/src/core/transformer.ts
sed -n '1,260p' packages/plugins/audio/src/script-compiler.ts
sed -n '1,220p' packages/plugins/background/src/script-compiler.ts
sed -n '1,220p' packages/plugins/animation/src/script-compiler.ts
sed -n '1,220p' packages/core/story-graph/src/script-compiler.ts
```

## Built-In And Common Package Groups

### Engine-owned defaults

From `packages/core/engine/src/script-compiler.ts` and the default mapping registry:

- `@Choice(...)`
- Save/load: `@SaveToSlot`, `@LoadFromSlot`, `@QuickSave`, `@QuickLoad`, `@AutoSave`
- Flow control: `@FlowControl`, `@FlowControlPolicy`, `@ResetFlowControlPolicy`, `@Skippable`, `@NoSkip`, `@Forwardable`, `@NoForward`, `@AutoAdvanceable`, `@NoAutoAdvance`
- Rollback: `@RollbackAnchor`, `@RollbackBoundary`, `@FixRollback`, `@NoRollback`

### Story graph metadata

From `packages/core/story-graph`:

- `@Chapter`
- `@Scene`
- `@Entry`
- `@Node`
- `@Label`
- `@Lane`
- `@Route`
- `@StoryTimeline`
- `@Protagonist`
- `@Interaction`
- `@EmitStoryEvent`

### Character and character motion

From `packages/core/character`:

- `@SetSprite`
- `@ShowCharacter`
- `@HideCharacter`
- `@MoveCharacter`
- `@SetExpression`
- `@CharacterFade`
- `@CharacterEnter`
- `@CharacterExit`

### Background

From `packages/plugins/background`:

- `@SetBackground`
- `@ClearBackground`
- `@VideoBackground`
- `@SetLayeredBackground`
- `@BackgroundLayer`
- `@RemoveBackgroundLayer`
- `@ClearBackgroundLayers`
- `@BackgroundTransition`
- `@BackgroundLayerTransition`

### Audio

From `packages/plugins/audio`:

- `@AudioChapter`
- `@LineId`
- `@PlayVoice`
- `@PlayBGM`
- `@PlaySFX`
- `@PlayAmbient`
- `@SetAudioGain`
- `@SetAudioEq`
- `@SetAudioAutomation`
- `@StopAudio`
- `@PauseAudio`
- `@ResumeAudio`
- `@SeekAudio`
- `@StopVoice`
- `@StopBGM`
- `@StopSFX`
- `@StopAmbient`

### Animation timelines

From `packages/plugins/animation`:

- `@DefineAnimation`
- `@AnimationTimeline`
- `@Key`
- `@PlayAnimation`

Inspect the owning package before use. Animation timeline decorators are contextual: `@Key` must follow `@DefineAnimation` or `@AnimationTimeline`, and omitted animation targets are only valid when a dialogue speaker provides the default self target.

## Authoring Rules

- The compiler only accepts decorators that are built in, explicitly registered, imported from the current file, or auto-collected from plugin metadata.
- In standalone `.qs`, prefer `import { decorators } from '@quajs/plugin-name'` inside `<script lang="ts">` when you need explicit activation.
- In host TypeScript files, any top-level value import from the owning plugin module is enough to activate that module's decorators for `qs\`...\`` blocks.
- If the repo or task disables auto-collection, do not assume package metadata alone is enough for the current file.
- Prefer metadata from `package.json#quajs.language.decorators` when you need names, asset roots, suggested value sets, or argument hints.
- Prefer `src/script-compiler.ts` when behavior is contextual, implicit, or stateful.
- If a decorator compiles through plugin state, do not simplify its behavior in prose. Example: `@PlayVoice()` may resolve implicitly from `@AudioChapter`, current line ID, and dialogue sequence.
- If the package exposes helper imports or runtime helpers automatically, rely on actual compiler support rather than inventing additional DSL syntax.
