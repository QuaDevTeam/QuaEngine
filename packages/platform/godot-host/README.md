# QuaEngine on Godot

Generate a native Godot 4.7 project from the same engine, QuaScript, QPK assets and product UI used by Web. QuickJS runs platform-neutral JavaScript in a Rust GDExtension; Godot draws the shared scene renderer's projections. Runtime needs neither a browser nor Node.

## Build the demo

Install Godot 4.7+, Rust/Cargo and a C compiler. Video conversion requires FFmpeg with libtheora/libvorbis (macOS: `brew install ffmpeg-full`). Build the workspace packages, then:

```sh
pnpm --dir demo build:godot
pnpm --dir demo run:godot
pnpm --dir demo edit:godot
pnpm --dir demo test:godot:native
pnpm --dir demo test:godot:package
```

`run:godot` launches the game; `edit:godot` opens the editor. Opening `project.godot` itself opens the editor, not the game. Outside the demo, use `godot --path <generated-directory>` to run the main scene. The macOS Godot executable is normally `/Applications/Godot.app/Contents/MacOS/Godot`. `GODOT_BIN` overrides it for the launch helpers and native tests. The demo build helper recognizes installed Homebrew ffmpeg-full without changing shell configuration.

Open `demo/dist/godot/workspace/project.godot` in Godot. The directory is relocatable and includes the current-host GDExtension, bundled JS, QPKs and Rust source. Install matching Godot export templates to export an application. Running the generator on Windows/Linux builds its corresponding library and descriptor; those platforms require their own runtime acceptance checks.

## Configure a project

```yaml
targets:
  web: {enabled: false} # Keep your existing Web configuration for a multi-target project.
  godot:
    enabled: true
    projectDir: dist/godot/workspace
    layout: landscape
    build:
      entry: src/targets/godot/main.ts
      viteConfig: vite.godot.config.ts
      profile: debug
    assetTarget:
      name: godot
      platform: godot
      pipeline:
        video: {format: ogv, rewriteExtension: false}
```

Run `quack project build --target godot --all` from the project. A Godot Vite config should compile QuaScript and QUI/QSS, without adding another target's bootstrap. Consume public package dist entries.

The business entry exports `async bootstrap(services)`. Services include `host`, `assets`, `adapter`, durable `store`, normalized `project`, `layout`, static trust policy and a rejecting runtime-module loader. Return an initialized `engine` and `destroy()`. Optional `surfaceKeys`, `features`, `renderDialogue`, `renderChoices` and `characterBoxSize` reuse product QUI surfaces/custom projections. See `demo/src/targets/scene/main.ts` for a complete entry. The resolver starts the renderer and handles the `app/quit` pipeline intent.

`@quajs/renderer-godot` exposes optional `plugins/*` and `qui` entries. Shared plugins use `context.scene`. Engine/store and pipeline remain authoritative for replay, branching, save/load and input; native nodes hold transient projection resources only. Existing QuaScript decorators work without Godot-specific syntax.

QUI selects open a themed option list with pointer selection, arrow-key navigation and Escape cancellation. Hover clears when the pointer leaves the stage or the window loses focus. Choices can supply `choiceStyles.normal/hover` in transient node metadata. Fonts use hinted, oversampled rasterization for compact CJK UI and preserve authored line boxes.

The engine's frame-rate setting drives Godot's frame limit. QuickJS yields between promise jobs after a 4 ms per-frame budget; a single synchronous job still runs to completion. The C interpreter is optimized even in debug builds, while native debug symbols/checks remain available. Character nodes and textures survive unrelated dialogue/UI updates, and presence fades change opacity without decoding sprites again. Debug snapshots report both frame intervals and script timings, so static FPS, story-load stalls and display throttling can be assessed separately.

## Services and remaining differences

| Area         | Behavior                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| Layout       | Shared logical stage, fixed aspect fit, letterboxing, logical hit tests                   |
| Images/fonts | PNG/WebP/JPEG bytes, TTF/OTF fonts, CJK line-height correction                            |
| Video        | Theora/Ogg from QPK; temporary decoder file; loop/mute/rate/seek                          |
| Audio        | WAV/MP3/Ogg Vorbis; buses, gain, fades, automation, native loop, rate, pause/seek         |
| UI           | Shared QUI/QSS, typewriter dialogue, choices, menus/settings/backlog/gallery/achievements |
| Capture      | PNG/JPEG/WebP, cropped/downsampled images, save-preview pipeline                          |
| Storage      | Atomic project-specific user files, typed save payloads, transaction rollback             |
| Trust        | Exact static QPK hashes, confined resource paths, rejection of dynamic Runtime Packages   |

Remaining Web differences: parametric audio EQ, non-normal blending, image drop-shadow and styled rich-text spans. Unsupported image effects warn once; audio EQ capability is false. Native sampled blur and font rasterization are not pixel-identical to CSS/browser output. Dynamic Runtime Packages are explicitly unsupported in this target.

Generated output is disposable. The generator refuses authored/source directories and replaces marked output only after success. Rust build cache lives under the source project's node_modules/.cache/qua-godot-runtime. Game files and saves never depend on the source checkout.

## Evidence

`test:godot:native` launches a real Godot renderer and verifies media fixtures extracted from generated QPK bytes. JSON/PNG evidence lives under demo/.generated/godot-native-smoke; it is separate from TypeScript contract tests and OS-level product interaction.

The same fixture checks CJK metrics, promise-chain yielding/completion and actual drawn frames at 30/60/120 with vsync disabled only for the test. Normal gameplay remains subject to the display refresh/vsync ceiling. Debug snapshots include the active VSync mode and screen refresh rate. Measure the actual story separately from this small fixture.

For automated macOS editor interaction, `edit:godot --accessibility always` exposes the editor's Run Project control; this is not required to run the game normally. Record this flag in performance evidence: on the tested macOS host, forcing accessibility lowered static story FPS from 60 to 48, even with VSync disabled. Benchmark the ordinary launch separately; do not disable accessibility in the generated project or launch helper to hide that cost.

`test:godot:package` copies the output outside the repository without editor cache, validates retained target roots, boots the headless runtime and rejects a deliberately modified QPK. It uses a disposable save directory and records hashes/logs under demo/.generated/godot-package-smoke.

Debug builds accept `-- --qua-review-dir=<absolute directory>` for the bounded snapshot/capture/input fixture client `demo/scripts/godot-review.mjs`. It is disabled in release or without the explicit argument and exposes no arbitrary code evaluation.
