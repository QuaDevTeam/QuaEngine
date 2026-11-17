# @quajs/plugin-embedded

Engine-owned story-session parameters and terminal results for exported modules. The root and protocol/session entries are platform-neutral; `./web` contains only iframe transport and parent lifecycle helpers. `@quajs/pipeline` remains the only game communication channel.

## Export and bootstrap

Export a module with `quack project build --target web|godot|cocos|unity --embedded --all`. Web builds require `targets.web.build.embeddedEntry` and explicit HTTP(S) `embeddedOrigins`, while other targets use their normal `build.entry`. Each factory returns `{ engine, destroy }` along with optional `onEmbeddedOpen` and `beforeEmbeddedResult` hooks:

```ts
export async function bootstrap(services) {
  const engine = await createProjectEngine(services) // project-owned factory
  return {
    engine,
    async onEmbeddedOpen(story) {
      const value = await runProjectStory(engine, story.parameters)
      await story.complete(value)
    },
    async beforeEmbeddedResult(outcome) {
      await engine.saveToSlot('embedded', {}, { preview: { mode: 'disabled' } })
    },
    async destroy() { await engine.destroy() },
  }
}
```

Both `services.embedding` and the `onEmbeddedOpen` `story` context expose `sessionId`, a cloned `parameters` object, `complete(value)`, `cancel(reason)`, and `fail(error)`. `onEmbeddedOpen` runs after the renderer is ready without blocking the host from acquiring the session. Inside engine code, you can also access the plugin via `engine.getPluginById('@quajs/plugin-embedded')` or emit `embedded/complete` (`{ sessionId, value }`) and `embedded/cancel` (`{ sessionId }`) through the pipeline. No new QuaScript decorators are introduced, and renderers do not own session results.

## Results and lifecycle

`EmbeddedSessionPlugin` tracks `active`, `settling`, and terminal states plus parameters in its engine-owned plugin projection. Calling `complete`, `cancel`, or `fail` settles a single terminal outcome (first wins). `beforeEmbeddedResult` runs and resolves before the result is delivered; if persistence fails, the outcome becomes `error` with `PERSISTENCE_FAILED`. Results are delivered once per session, followed by tearing down the renderer, app, assets, and native resources before `closed` is emitted. Parent navigation and reward granting stay outside the module and should be idempotent across sessions, replays, and save loads.

Protocol v1 (`qua-embedded`) accepts only `open` and `cancel` messages. `open` carries `sessionId`, a safe relative `storageNamespace`, and `parameters`. Responses are `ready`, `result`, `error`, and `closed`; outcomes take the form `completed` (`value`), `cancelled` (`reason`), or `error` (`code`, `message`). JSON inputs are bounded to depth 24 and a 64 KiB budget, rejecting cycles, getters, prototype keys, non-finite numbers, and non-JSON objects. No eval, filesystem paths, raw store writes, dynamic module activation, or loose asset pushes are exposed; exports remain static QPK-only with verified identities and hashes.

Save/load and rollback rebind the active session lease to the current host `sessionId` and parameters rather than replaying a previous host's result. Applications should still verify that loaded save state matches the current quest or business request.

## Web parent

```ts
import { mountEmbeddedFrame } from './export/client.js'

const story = mountEmbeddedFrame({ container, url, sessionId, storageNamespace, parameters })
await story.ready
const outcome = await story.result
await story.closed
// Or call await story.destroy() to request cancellation and wait for cleanup.
```

The child page checks the configured exact parent origins and `event.source`; the parent checks the child origin, `event.source`, and `sessionId`. Each iframe runs in an isolated JS realm. If a story finishes before `ready`, the `ready` promise rejects while `result` still resolves with the terminal outcome. Same-origin deployments still need per-account `storageNamespace` isolation. Always validate origin policies, media autoplay permissions, visibility, styling, and CSP in your target deployment environment. Root package entries never import DOM globals.

## Native and Creator adapters

- **Godot**: Set `storage_namespace`, call `open_story(sessionId, Dictionary)` or `cancel_story()`, and connect to `story_message`, `story_result`, and `module_closed`.
- **Unity UPM**: Set `autoStart = false`, `contentPrefix`, and `storageNamespace`, call `OpenStory(sessionId, parametersJson)` or `CancelStory()`, and subscribe to `StoryMessage`, `StoryResult`, and `Closed`. Messages dispatch outside native VM callbacks (Unity Editor, Player, and C# compilation remain pending verification).
- **Creator**: Call `start(parent, { request, input, layout, onMessage })` to get `{ engine, result, cancel, destroy }`, supplying scoped input, container layout, and native parent media integration. One JS realm hosts a single active session at a time, so wait for `destroy()` before reopening.

## Validation

Run package builds, typechecks, and tests across `@quajs/plugin-embedded`, `@quajs/quack`, `@quajs/renderer-scene`, and target hosts. Rust `cargo fmt`/`test`/`clippy` and the protocol-smoke example exercise real QuickJS; browser, Godot, and Creator Web fixtures verify the parent boundary (recording drawing bridges do not replace real Unity C# compilation, Player/IL2CPP, or device testing). For the full integration workflow, see [Exported module integration](../../../docs/content/docs/guides/exported-module.md).
