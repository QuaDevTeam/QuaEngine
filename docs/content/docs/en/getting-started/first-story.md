---
title: "Write your first scene"
description: "Write dialogue in a real QuaScript file, add interpolation and choices, then bring in backgrounds and music."
order: 2
---

## Replace the opening scene

Open `src/game/scenes/opening.qs` in your new project and replace its contents with this complete file. It needs no images or music, so you can check the dialogue flow first.

```qs
<script lang="ts">
export interface Scope {
  playerName: string
}
</script>

<script setup lang="ts">
const playerName = scope.playerName
</script>

The afternoon breeze turns an unfinished page.
Aoi: There you are, ${playerName}.
Aoi: What kind of story shall we write today?

- Begin with a meeting
- Begin with a secret

Aoi: Then let's write the first line.
```

Text without a speaker prefix is narration. `Aoi:` introduces character dialogue; `Narrator:` would name a speaker called Narrator rather than create anonymous narration. Expressions inside `${...}` can use valid TypeScript.

The template already passes the scene's input with `engine.dialogue(opening, { playerName: 'Player' })`. Change `playerName` to see interpolation in action. The `Scope` interface declares the scene's input contract.

## Understand the choices

Choices without targets wait for player input, leave the selection in the step context, and continue to the following steps. Both options above intentionally lead to the same next line, making this a small input check.

With `- Go to the sea -> seaside`, `seaside` is a story-node target. Your story graph or jump handler must register it; writing the name alone does not create a destination. See [branching and story graphs (Chinese)](/docs/authoring/branching).

## Add backgrounds and music

The template enables the background and audio plugins. Add your own files at `assets/backgrounds/sunset.png` and `assets/audio/evening.ogg`, then use:

```qs
@SetBackground('backgrounds/sunset.png', {
  transition: { type: 'fade', duration: 500 }
})
@PlayBGM('audio/evening.ogg', { loop: true, fadeInMs: 600 })
Sunset rests by the window. Aoi slides a pen toward you.
```

Asset IDs are relative to the asset root. Decorators immediately before text run their staging before showing that text; a blank line creates a separate action step.

Browsers may require a click before playing audio. An autoplay block should wait for user activation rather than fail the story.

## Check the result

Run `pnpm typecheck`, then advance through the dialogue and choices in the preview. Check asset loading, audio after user activation, and console errors after refreshing. Once you add saving or chapter jumps, also check that restoring keeps the same story state.

Continue with [characters and staging (Chinese)](/docs/authoring/characters) when you are ready to add sprites.
