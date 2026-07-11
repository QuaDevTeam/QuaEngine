---
name: quajs-plugin-backlog
description: Use, document, or modify @quajs/plugin-backlog. Covers backlog recording, retention, rewind policy, voice replay, projections, QuaScript Backlog/NoBacklog decorators, renderer intents, runtime package provenance, settings, and validation.
---

# @quajs/plugin-backlog

Use this skill for `packages/plugins/backlog`, backlog projections, rewind/voice replay behavior, renderer backlog entries, or backlog QuaScript decorators.

## Responsibility

`@quajs/plugin-backlog` records dialogue and choice entries from engine pipeline events, projects a renderer-safe backlog UI model, supports voice replay references, and optionally supports rewind to engine checkpoints.

The default design is view-only. Backlog entries are not rewindable unless developer policy enables it.

## Setup

```ts
import { QuaEngine } from '@quajs/engine'
import { BacklogPlugin } from '@quajs/plugin-backlog'

const engine = new QuaEngine()
const backlog = new BacklogPlugin({
  retention: { scope: 'global', maxEntries: 120 },
  defaultPolicy: {
    include: true,
    rewindable: false,
    voiceReplay: true,
  },
})

engine.use(backlog)
await engine.init()
```

Renderer entries:

- `@quajs/renderer-web/plugins/backlog`
- `@quajs/renderer-vue/plugins/backlog`
- `@quajs/renderer-cocos/plugins/backlog`
- `@quajs/plugin-backlog/native` through `createBacklogNativeRendererFeature()`

## Runtime API

```ts
await backlog.setPolicy({
  include: true,
  rewindable: true,
  voiceReplay: true,
  tags: ['route-a'],
})

await backlog.setVisible(true, {
  source: 'menu',
  overlayStack: 'overlay',
  zIndex: 50,
  scene: {
    id: 'backlog',
    presentation: 'overlay',
    overlay: {
      skinId: 'demo-menu',
      defaultChrome: false,
      hideHud: true,
      hideDialogue: true,
      overlayStack: 'overlay',
      zIndex: 50,
    },
  },
})

const projection = backlog.getProjection()
```

Policy applies to the next backloggable item. Keep `rewindable: false` for spoilers, unstable checkpoints, or flows where rollback should not be available.

## QuaScript Decorators

The package exports mappings and compiler lowering from `@quajs/plugin-backlog/script-compiler`.

```qs
@Backlog({ rewindable: true, voiceReplay: true })
Heroine: Remember this line.

@NoBacklog()
Narrator: This system message will not appear in the backlog.
```

Decorators:

- `@Backlog(policy?)`: calls `setBacklogPolicyWithEngine`.
- `@NoBacklog`: sets `{ include: false }`.

## State Model

- Entries live in engine-owned plugin projection.
- Entries record both `gameTimeMs` from `engine.getPlaytimeMs()` and `recordedAt` as the real-world timestamp.
- Rewindable entries store checkpoint ids.
- View-only entries do not.
- Voice replay entries store audio references and required runtime packages.
- Runtime package unload removes backlog entries that depend on the package.

## Renderer Boundary

Renderer UI emits open, close, jump, and voice replay requests through backlog render-to-logic events. It does not decide whether an entry is rewindable; it reads `entry.rewindable` from projection.

Native products explicitly register `createBacklogNativeRendererFeature()` in the same feature-surface entry list used by native frame serialization and `NativeHostPlugin`. The surface is resolved in logical stage coordinates from the native safe area, preserves entry/runtime-package provenance, and maps only `backlog-close`, `backlog-jump`, and `backlog-replay-voice` to the existing backlog pipeline events.

Default Web/Vue/Cocos backlog renderers show entry `gameTimeMs` in the item metadata. Themes may expose `recordedAt` as secondary detail, but real-world time should not replace game time by default.

Backlog UI scenes can use `overlay.defaultChrome: false` when the scene should not mount the renderer's default dialogue, choices, HUD, or quick-menu chrome behind the backlog surface.

Backlog UI placement is engine/plugin projection metadata. `BacklogUiProjection` and backlog scene `overlay` accept `overlayStack`, `stackPriority`, and `zIndex`; the default placement is `overlay` stack with backlog zIndex `50`. Renderers must project these fields to their official overlay root instead of choosing backlog layer order locally.

## Settings

When `@quajs/plugin-settings` is installed, backlog contributes developer settings for retention and default inclusion/rewind/voice replay policy.

## Validation

```bash
pnpm --filter @quajs/plugin-backlog test -- --run
pnpm --filter @quajs/plugin-backlog typecheck
pnpm --filter @quajs/plugin-backlog build
```

Run engine rollback/save-load tests when checkpoint or runtime dependency behavior changes.

## Review Checklist

- Is rewind controlled by engine/plugin policy, not renderer UI?
- Are voice replay refs and entries package-aware?
- Does runtime unload remove dependent entries safely?
- Are player progress and save/load semantics preserved?
- If backlog policy, decorator, projection, or renderer intent behavior changed, was this skill updated?
