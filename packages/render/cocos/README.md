# @quajs/renderer-cocos

Cocos nodes, media handles and shared QUI projections for QuaEngine. Game state
belongs to engine/store/plugins; renderer input intents use `@quajs/pipeline`.
Creator supplies `cc` through the host. The renderer package does not bundle the SDK.

## Generated project integration

Configure `targets.cocos.build.entry` in `qua.project.yaml` and run
`quack project build --target cocos --all` in the game source project. Quack's
`cocos-core-resolver` is the sole target bootstrap injection point. It bundles
public `dist` entries, emits the retained-module graph and validated
`target-bundle-manifest.json`, then generates the standalone Creator scene and
startup component. Do not add Cocos/Web/native target cores to ordinary plugin
lists or re-declare bootstrap in the generated startup shell.

The business entry exports `bootstrap(services)`. It receives `host`, `assets`,
the asset `adapter`, `store`, `project`, `runtimeModuleLoader`, `trustPolicy` and
debug `review`. The current generator consumes the returned `engine`,
`features`, `surfaceKeys`, `characterBoxSize`, `renderDialogue`, `renderChoices`,
`getDiagnostics` and async `destroy`; debug media QA may return `mediaReview`.
Use the [demo entry](../../../demo/src/targets/cocos/main.ts) and its
[Vite config](../../../demo/vite.cocos.config.ts) as the complete working example.
The resolver creates and destroys the renderer; the business entry owns its
engine and UI session lifecycle.

## Public entries

| Entry                                                                                                               | Responsibility                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Root                                                                                                                | `QuaCocosRendererController`, renderer actions, projections, plugin contracts and visual-novel preset |
| `./qui`                                                                                                             | `createQuiCocosRendererPlugin({ surfaceKeys, features })` for shared compiled TSX/QSS surfaces        |
| `./plugins/core`                                                                                                    | `defineCocosRendererPlugin` and pipeline-based plugin setup                                           |
| `./plugins/input`, `background`, `sprite`, `character`, `effects`, `fonts`, `dialogue`, `choices`, `audio`, `scene` | Optional narrative projection features, each beneath `./plugins/`                                     |
| `./plugins/ui`, `settings`, `backlog`, `gallery`, `achievement`, `save-preview`                                     | Optional product and feature projections, each beneath `./plugins/`                                   |
| `./plugins/preset`                                                                                                  | Visual-novel projection composition                                                                   |

QUI reads resolved engine-owned UI surfaces. It draws text, images, controls,
clipping and scroll content, then emits control intents through pipeline. Hover,
scroll offsets, nodes and cleanup handles are transient. Save slots, settings,
chapter unlocks, backlog and achievement/gallery state stay with their plugins.
Generic feature panels and shared product QUI are different compositions; the
demo resolver selects the shared QUI and excludes duplicate generic panels.

## Host and media boundary

Transforms, animation tracks and hit tests use logical stage units until the
host maps them to screen pixels. The fixed stage is fitted with black bars,
without changing authored coordinates; clicks outside it are rejected.

Resource resolution preserves logical IDs and QPK package provenance from
projections, sprite/UI metadata, backlog voice and feature assets. The generated
project imports media through Quack hybrid output and keeps structured content
in QPK. Its static-only runtime does not dynamically import arbitrary JS or
renderer plugins.

Concrete Creator 3.8.8 runtime support is documented in
[`@quajs/cocos-host`](../../platform/cocos-host/README.md). Audio gain, EQ,
seek/rate and native video depend on optional host capabilities. Generic hosts
may warn, no-op or use an authored poster; these fallbacks do not establish media
parity. The full-screen muted SDR H.264 and numeric image timeline checks do not
establish arbitrary video composition, non-muted AV sync, HDR or skeletal/particle
animation support. SDK Web video sits below Canvas and is outside GPU-only capture.

## Validation

```bash
pnpm --filter @quajs/renderer-cocos test -- --run
pnpm --filter @quajs/renderer-cocos typecheck
pnpm --filter @quajs/renderer-cocos build
```

Fake/Creator fixtures verify contracts; actual preview and macOS execution use
the [demo build, interaction, lifecycle and media commands](../../../demo/README.md).
Three-target reports compare production Web, Creator Web and Cocos macOS,
not the Rust/wgpu Native renderer. Record actual artifact hashes and distinguish
native input bindings/GPU readback from OS pointer automation or subjective listening.
