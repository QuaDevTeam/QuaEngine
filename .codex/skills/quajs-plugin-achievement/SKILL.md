---
name: quajs-plugin-achievement
description: Use, document, or modify @quajs/plugin-achievement. Covers achievement/group definitions, profile progress, conditions, rewards, notifications, achievement board scene, renderer intents, QuaScript achievement decorators, settings, runtime package provenance, and validation.
---

# @quajs/plugin-achievement

Use this skill for `packages/plugins/achievement`, achievement definitions/progress, notifications, board scene behavior, gallery reward integration, or achievement QuaScript decorators.

## Responsibility

`@quajs/plugin-achievement` owns achievement/group definitions, profile progress, unlock conditions, rewards, notification projection, and the reserved achievement board scene. Renderers project board/notification state and emit intents.

Achievement progress is profile-level and independent from story save/load and rollback.

## Setup

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

Renderer entries:

- `@quajs/renderer-web/plugins/achievement`
- `@quajs/renderer-vue/plugins/achievement`
- `@quajs/renderer-cocos/plugins/achievement`

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

Built-in conditions include all/any/not composition, achievement unlocks/progress, gallery unlocks, counters, active runtime packages, story point matching, and story metadata matching.

Rewards can unlock gallery entries, unlock achievements, open the achievement board, or invoke custom registered reward handlers.

## Runtime API

```ts
await achievement.unlockAchievement('first-contact', { source: 'story' })
await achievement.incrementProgress('route-reader', 1)
await achievement.incrementCounter('choices-made', 1)

const unlocked = achievement.hasAchievement('first-contact')
const profile = achievement.getProfile()
const projection = achievement.getProjection()

await achievement.openBoard({
  groupId: 'main',
  overlayStack: 'overlay',
  zIndex: 80,
})
```

Runtime package unload removes definitions owned by the package but preserves profile records.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-achievement/script-compiler`.

```qs
@UnlockAchievement('first-contact')
Narrator: The witness recognizes your signal.

@OpenAchievementBoard({ groupId: 'main' })
Narrator: The archive opens.
```

Decorators:

- `@UnlockAchievement(achievementIdOrIds, options?)`
- `@OpenAchievementBoard(options?)`

## Renderer Boundary

Achievement board selection, filter updates, close requests, and notification dismissal are render-to-logic intents. The plugin updates engine-owned projection; renderer components do not decide unlock/progress state.

Achievement overlay placement is plugin projection metadata. `AchievementOpenOptions` and `AchievementProjection` accept `overlayStack`, `stackPriority`, and `zIndex`; the board defaults to `overlay` stack with achievement board zIndex `80`. `AchievementNotificationOptions` and `AchievementNotificationProjection` also accept placement fields; toast notifications default to `toast` stack with zIndex `0`. Web-family renderers should render board and toast as separate official overlay roots, and Cocos should keep board/toast in separate layers so the two stacks do not mix.

## Settings

When `@quajs/plugin-settings` is installed, achievements contribute notification behavior settings. Player settings are profile preferences and are not restored by story save/load.

## Validation

```bash
pnpm --filter @quajs/plugin-achievement test -- --run
pnpm --filter @quajs/plugin-achievement typecheck
pnpm --filter @quajs/plugin-achievement build
```

Run gallery tests when gallery condition/reward behavior changes.

## Review Checklist

- Are definitions separate from profile progress?
- Does save/load avoid restoring profile achievement state?
- Are rewards/conditions package-aware where assets/runtime content are involved?
- Does renderer emit intents rather than owning unlock/progress state?
- If achievement API, decorator, conditions/rewards, settings, or projection behavior changed, was this skill updated?
