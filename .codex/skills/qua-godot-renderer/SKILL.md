---
name: qua-godot-renderer
description: Build and validate standalone Godot projects with the GDExtension/QuickJS host, shared scene renderer, QPK assets, native persistence and active-target isolation.
---

# Godot target

Pair with quaengine-development-guardrails, qua-project-configuration and quack-configuration. Godot is a separate `godot-core` family from JavaScriptCore/wgpu `native-core`.

## Responsibility and setup

- Public setup lives in `docs/content/docs/platforms/godot.md`, with services in `packages/platform/godot-host/README.md`. Keep README/platform/status/config/release/Runtime QPK guidance aligned; the docs generator publishes Godot and shared scene package references from their original READMEs.
- `@quajs/scene-host` owns host contracts; `@quajs/renderer-scene` owns shared projection, stage layout, animation, QUI and feature plugins. Cocos and Godot renderer packages are thin adapters. Shared plugin contexts use `context.scene`; plugin identities are `@quajs/renderer-scene/<feature>`.
- `@quajs/godot-host` implements TypeScript services, GDScript projection nodes and a portable Rust GDExtension with QuickJS. Runtime must not require a WebView or Node server.
- Configure `targets.godot.build.entry` (business module exporting `bootstrap(services)`), optional `viteConfig`, `profile: debug|release`, `projectDir`, `layout` and `assetTarget`. See the host README and `demo/src/targets/scene/main.ts` for the service/return contracts.
- Build public package dist entries, then `quack project build --target godot --all`. Output includes project.godot, main scene, JS, QPKs, active manifest, current-host binary and Rust source.
- Require Godot 4.7+, Cargo/Rust and a C compiler. Video uses FFmpeg with libtheora/libvorbis: `video: { format: ogv, rewriteExtension: false }`. The demo helper recognizes installed Homebrew ffmpeg-full without modifying shell configuration.
- Windows/Linux use the same source structure but need actual builds and acceptance on each OS. Godot export templates are an additional prerequisite for executable export.

## Runtime and state boundary

- Engine/store owns game state; pipeline is the sole game communication channel. Native bridge calls implement projection resources and input transport, never a second state/event authority.
- Hosts may hold nodes, fonts, decoder/audio handles, captures and input/animation timers only. Preserve package provenance and engine logical coordinates until final viewport scaling. Letterbox instead of cropping.
- QPK hashes cover exact bytes. Temporary Theora decoder files under user://qua-media materialize verified QPK resources and must be removed on release/exit.
- This target currently supports build-time QPKs only. Reject dynamic Runtime Package loading and executable modules; do not bypass trust policy or load bootstrap adapters from QPKs.
- The active godot-core-resolver is the only bootstrap injection point. Generated shells consume its validated target manifest. Check retained modules and normalized package/subentry roots against Web/Cocos/native leakage; all four targets must reject Godot leakage symmetrically.
- Generation must reject authored output directories and source aliases, stage all work, then atomically replace only after QPK/JS/native/manifest success. Cache Rust builds in project node_modules/.cache, not installed packages.
- Preserve async input ordering and stop dispatch after destroy. Resource leases outlive audio handles; teardown rejects pending captures.
- Test CJK line boxes in real Godot. Pixel-rounded measurements must not turn one line into two; match font metrics to logical lineHeight. Native WAV loops need nonempty frame ranges.
- Compact Godot UI uses hinted, oversampled raster fonts; check real CJK strokes at 1280×720 and resized windows. Do not force MSDF for small text. Chevron strokes use the projected theme fill; preserve per-edge border colors.
- Shared QUI selects open transient option lists; pointer/keyboard cancellation must not mutate preferences or close the parent panel. Clear hover on blur/letterbox exit, and avoid repainting identical pointer motion. Product choices may supply transient `choiceStyles.normal/hover` metadata.
- Forward engine `renderer.targetFrameRate` through the optional scene host runtime frame-limit API. Godot applies `Engine.max_fps`; the real display/vsync ceiling still applies. Debug snapshots expose bounded frame-time samples, and the native fixture measures actual drawn frames at 30/60/120 with vsync disabled for that fixture only.
- Record VSync, screen refresh rate and accessibility launch options in performance evidence. `--accessibility always` helps macOS editor automation but adds measurable overhead on the tested host; separately benchmark an ordinary launch. Never disable accessibility in product defaults as a performance workaround.
- Drain QuickJS promise jobs with both a count limit and a 4 ms wall-clock budget per frame. Yield only between jobs, preserving synchronous transactions. Check skip-heavy story flow as well as idle FPS; debug `scriptTimesMs` distinguishes script work from display throttling. The native fixture must prove a long promise chain yields and eventually completes.
- Keep `rquickjs-sys` optimized in debug Cargo builds (`profile.dev.package.rquickjs-sys.opt-level = 3`). Retain debug symbols/checks for the host; an unoptimized C interpreter materially distorts editor performance and is not representative of the target.
- Preserve character nodes/textures across unrelated dialogue, choice and UI updates. Presence fades update node opacity without rebuilding sprites on every frame; keep animation/resource invalidation and native teardown coverage when changing this optimization.
- Sprite and backdrop blur use logical-pixel Gaussian sigma. Keep adjacent horizontal/vertical GPU taps in transient SubViewports, half-size prefilter steps for sigma above 8, and premultiplied intermediate color. Final projection alone applies color filters, mask and opacity. Never stretch sparse 5x5 taps across the radius or multiply backdrop sigma by stage scale twice. Capture full resolution before host filtering; release all targets with their projection node. `pnpm --dir demo test:blur` compares the actual Godot node against Chromium at four radii and two stage scales.

## Features and limits

Optional entries cover input, fonts, background, sprites/characters, effects, dialogue/typewriter, choices, audio, scenes, UI, settings, backlog, gallery, achievement, save-preview and QUI. Existing engine/plugin QuaScript decorators are unchanged; no target-specific narrative syntax is needed.

Supported host features include images/fonts, Theora video, audio transport/buses/gain, captures, blur/backdrop, alpha/luminance masks, nine-slice textures and durable typed saves. Keep remaining Web differences explicit: parametric audio EQ, non-normal blending, image drop-shadow and styled rich-text spans do not have full equivalents yet. Do not infer whole-story or pixel-perfect parity from a title screenshot.

## Validation

1. Typecheck/build scene-host (types only), and typecheck/build/test renderer-scene, renderer-godot, godot-host, native-contracts and Quack; run Cocos host/renderer regression tests after shared changes. Shared lifecycle tests live in renderer-scene and exercise its fake host adapter without adding target adapters to production dependencies.
2. Run `pnpm --dir demo build:godot`, inspect target manifest/retained graph, then `pnpm --dir demo run:godot` for a real game window and `pnpm --dir demo edit:godot` for the editor. Opening project.godot itself only opens the editor; separately verify its Run Project action. `GODOT_BIN` overrides the executable on all desktop platforms.
3. Run `pnpm --dir demo test:godot:native`: QPK-derived fixtures verify actual audio PCM, video progression, pause/seek, font metrics, capture and resource cleanup. Evidence lives under demo/.generated/godot-native-smoke.
4. Exercise real title/start/continue, save/load across restart, settings, backlog, choices and hide/restore UI. Compare Web/Godot screenshots at matching story points and viewport sizes.
5. Review transport needs both debug profile and explicit `-- --qua-review-dir=<directory>`; it supports bounded snapshots/captures/input only, with no arbitrary code evaluation. Never make it a production event channel.
6. Separate contract tests, macOS runtime evidence and untested platforms. Do not commit generated binaries, caches or player saves.
7. Run `pnpm --dir demo test:godot:package` for relocation without the source checkout/editor cache, retained-module isolation and exact-QPK tamper rejection. Keep its disposable user directory separate from player saves.
8. Keep the shared scene, Godot host/adapter and target-isolation contract tests in the CI package filters. CI contract tests do not replace a real Godot window or platform-specific runtime acceptance.
