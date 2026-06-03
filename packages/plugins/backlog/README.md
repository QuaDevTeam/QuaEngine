# @quajs/plugin-backlog

Backlog plugin for QuaEngine. It records dialogue and choice entries, projects a compact backlog UI model, supports voice replay references, and optionally supports rewind to engine checkpoints.

The default design is view-only: backlog entries are not rewindable unless the developer opts in through the default policy or a local backlog policy.

## Installation

```ts
import { QuaEngine } from '@quajs/engine'
import { BacklogPlugin } from '@quajs/plugin-backlog'

const engine = new QuaEngine()

engine.use(new BacklogPlugin({
  retention: { scope: 'global', maxEntries: 120 },
  defaultPolicy: {
    include: true,
    rewindable: false,
    voiceReplay: true,
  },
}))
```

Renderer entries:

- `@quajs/renderer-web/plugins/backlog`
- `@quajs/renderer-vue/plugins/backlog`

## State Model

- The plugin records dialogue and choice events from engine pipeline events.
- Entries live in the engine-owned plugin projection.
- Rewindable entries store checkpoint ids. View-only entries do not.
- Voice replay entries store audio references and required runtime packages.
- Runtime package unload removes backlog entries that depend on the package.

## Policy

```ts
import { setBacklogPolicyWithEngine } from '@quajs/plugin-backlog'

await setBacklogPolicyWithEngine(engine, {
  include: true,
  rewindable: true,
  voiceReplay: true,
  tags: ['route-a'],
})
```

Policy applies to the next backloggable item. Keep `rewindable: false` for spoilers, unstable checkpoints, or demo flows where rollback should not be available.

## Visibility

```ts
import {
  getBacklogProjection,
  setBacklogVisibleWithEngine,
} from '@quajs/plugin-backlog'

await setBacklogVisibleWithEngine(engine, true, {
  source: 'menu',
  scene: {
    id: 'backlog',
    presentation: 'overlay',
    overlay: { skinId: 'demo-menu', hideHud: true },
  },
})

const backlog = getBacklogProjection(engine)
```

Renderer UI sends open, close, jump, and voice replay requests through `BacklogRenderToLogicEvents`.

## QuaScript Decorators

The package publishes decorator metadata and compiler lowering through `@quajs/plugin-backlog/script-compiler`.

```qs
@Backlog({ rewindable: true, voiceReplay: true })
Heroine: Remember this line.

@NoBacklog()
Narrator: This system message will not appear in the backlog.
```

## Settings

When `@quajs/plugin-settings` is installed, backlog contributes developer settings for retention and default inclusion/rewind/voice replay policy.

## Renderer Boundary

The renderer does not decide whether an entry can rewind. It reads `entry.rewindable` from projection and emits a jump request only for selectable entries.
