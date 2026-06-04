# @quajs/plugin-achievement

Persistent achievement plugin for QuaEngine. It provides achievement/group definitions, profile progress, unlock conditions, rewards, notification projection, and a reserved achievement board scene.

The plugin owns engine-side achievement state and profile persistence. Renderers only project the achievement board and notification state through renderer plugin entries.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { AchievementPlugin } from '@quajs/plugin-achievement'

const engine = new QuaEngine()
const achievement = new AchievementPlugin({
  profileId: 'default',
  notifications: { mode: 'toast', durationMs: 3200 },
})

engine.use(achievement)
await engine.init()
```

Optional renderer entries:

- `@quajs/renderer-web/plugins/achievement`
- `@quajs/renderer-vue/plugins/achievement`

## State Model

- Definitions and groups live in plugin runtime state.
- Player progress lives in `QuaStore` profile snapshots with the `@quajs/plugin-achievement:profile:<profileId>` prefix.
- Profile progress is independent from story save/load and rollback.
- Runtime package unload removes definitions owned by the package but preserves profile records.
- Hidden achievements stay hidden in renderer projection unless the board/filter asks to include hidden items.

## Register Definitions

```ts
import {
  achievementCondition,
  achievementReward,
  defineAchievement,
  defineAchievementGroup,
} from '@quajs/plugin-achievement'

await achievement.registerDefinitions({
  groups: [
    defineAchievementGroup({
      id: 'main',
      title: 'Main Route',
      order: 10,
    }),
  ],
  achievements: [
    defineAchievement({
      id: 'first-contact',
      groupId: 'main',
      title: 'First Contact',
      summary: 'Meet the machine witness.',
      maxProgress: 1,
      unlockWhen: achievementCondition.storyPoint({ chapterId: '03' }),
      rewards: [
        achievementReward.unlockGalleryEntries('cg/unit-7-arrival'),
      ],
    }),
  ],
})
```

## Runtime API

```ts
await achievement.unlockAchievement('first-contact', { source: 'story' })
await achievement.incrementProgress('route-reader', 1)
await achievement.incrementCounter('choices-made', 1)

const unlocked = achievement.hasAchievement('first-contact')
const profile = achievement.getProfile()
const projection = achievement.getProjection()

await achievement.openBoard({ groupId: 'main' })
```

## Conditions And Rewards

Built-in conditions cover:

- all/any/not composition
- other achievement unlocks
- gallery unlocks
- achievement progress
- generic counters
- active runtime packages
- story point matching
- story metadata matching

Built-in rewards can unlock gallery entries, unlock other achievements, or open the achievement board. Custom reward handlers can be registered with `achievement.registerRewardHandler()`.

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-achievement/script-compiler`.

```qs
@UnlockAchievement('first-contact')
Narrator: The witness recognizes your signal.

@OpenAchievementBoard({ groupId: 'main' })
Narrator: The archive opens.
```

## Settings

When `@quajs/plugin-settings` is installed, this plugin contributes settings for achievement notification behavior. Player settings are profile preferences and are not restored by story save/load.

## Renderer Boundary

Achievement board selection, filter updates, close requests, and notification dismissal are render-to-logic intents. The plugin updates the engine-owned projection; renderer components do not decide unlock state.
