# @quajs/plugin-embedded

Engine-owned story-session parameters and terminal results for exported modules. The root and protocol/session entries are platform-neutral; `./web` contains only iframe transport and parent lifecycle resources. The pipeline remains the only game communication channel.

## Export and bootstrap

Use `quack project build --target web|godot|cocos|unity --embedded --all`. Web config needs `targets.web.build.embeddedEntry` and exact HTTP(S) `embeddedOrigins`; other targets use their business `build.entry`. Each factory returns initialized engine/destroy and optional onEmbeddedOpen/beforeEmbeddedResult hooks.

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

`services.embedding` / the onEmbeddedOpen context exposes sessionId, a cloned parameters object, complete(JSON), cancel(reason) and fail(error). Use after initialization; onEmbeddedOpen starts after renderer readiness without blocking the host session. Engine code can get `engine.getPluginById('@quajs/plugin-embedded')` or emit `embedded/complete` with `{sessionId,value}` / `embedded/cancel` with `{sessionId}` through pipeline. There are no new QuaScript decorators or renderer state owners.

## Results and lifecycle

`EmbeddedSessionPlugin` records active/settling/terminal state and parameters in engine-owned plugin projection. Completion/cancellation reserve one terminal outcome. beforeEmbeddedResult awaits required persistence; failure changes the outcome to error/PERSISTENCE_FAILED. Context methods are developer APIs, not host arbitrary-execution hooks. Results are delivered once per session, then adapters release the renderer, app, assets and native resources before closed. Parent navigation/reward ownership remains external and must be idempotent across sessions/replay/load.

Protocol 1 `qua-embedded` accepts only open and cancel. Open has sessionId, safe relative storageNamespace and parameters. Responses are ready/result/error/closed. Outcome is completed/value, cancelled/reason or error/code/message. JSON input has depth 24 and a conservative 64 KiB budget; reject cycles, accessors, prototype keys, non-finite numbers and non-JSON objects. No eval, filesystem path, raw store writes, dynamic module/plugin activation or loose asset push is exposed. Exports remain static QPK-only and retain exact identities/hashes.

Save/load and rollback rebind the current host session lease instead of replaying old session metadata/results. Applications must still validate saved business/quest identity against the current request.

## Web parent

```ts
import { mountEmbeddedFrame } from './export/client.js'

const story = mountEmbeddedFrame({ container, url, sessionId, storageNamespace, parameters })
await story.ready
const outcome = await story.result
await story.closed
// Or await story.destroy(): request cancel and wait for cleanup with a timeout.
```

The child checks configured exact parent origins and parent window source. Parent checks child origin/window and sessionId. Fresh iframes isolate realms. If a story ends before readiness, ready rejects while result still supplies its terminal outcome. Same-origin storage still requires stable account namespaces. Origin policy, media permissions, actual visibility, styling and final deployment need product validation. Root entries never import DOM globals.

## Native/Creator adapters

Generated Godot scene: set storage_namespace, call open_story(sessionId, Dictionary); cancel_story; observe story_message, story_result and module_closed. Unity UPM: set autoStart=false/contentPrefix/storageNamespace, call OpenStory(sessionId, parametersJson); CancelStory; observe StoryMessage/StoryResult/Closed. Messages are dispatched outside native VM callbacks. Unity Editor/Player/C# compilation remains unqualified here.

Creator start(parent,{request,input,layout,onMessage}) returns engine/result/cancel/destroy. Scoped input, container layout and final parent native products are required. A realm owns one active session; close before reopening. Do not copy application startup shells/settings into authoring projects.

## Validation

Run package build/typecheck/test, Quack embedded-project consumers, scene renderer and target hosts. Rust fmt/test/clippy and its protocol-smoke example exercise real QuickJS. Browser/Godot and Creator Web fixtures cover the parent boundary; fake drawing bridges do not qualify Unity C# rendering, Player/IL2CPP or devices. Full workflow: docs/content/docs/guides/exported-module.md.
