# Web / Native demo parity — 2026-09-12

已修正当前 demo 的 Native 光照、模糊、文字、纸纹、面板布局、禁用按钮、回看滚动与保存等待差异。19 组真实截图全部通过验收；验收允许字体抗锯齿和边缘采样误差，未宣称所有分支每一帧逐字节相同。

This review uses the current Chinese manuscript demo, its real Quack QPK, packaged Noto fonts, and the actual WGPU/QuickJS application. Browser captures use a 960×540 viewport at DPR 2; Native readback is 1920×1080. Both project the same 1920×1080 logical stage.

## Corrections

- Native now carries `background.characterLighting` to the completed character sprite compositor. Ambient gain and directional shade apply once after sprite layers, before parent opacity, with the same sRGB/8-bit shade semantics as the Web SVG material. Clearing scene lighting removes the material; package resources and provenance remain unchanged.
- Native backdrop blur now uses continuous separable Gaussian color passes with reusable, accounted scratch textures. The former sparse sample grid produced visible ghost images.
- Dialogue chrome uses the authored font size, line height and inherited letter spacing. Its paper grain is a Quack-packaged raster of the original Web SVG, not substituted artwork.
- Native text-only save cards explicitly disable unused thumbnail capture, avoiding a five-second wait for an unsupported capture response.
- Native title, chapter list, menu, two-column settings, chronological transcript, nine-slot save/load grid and confirmation dialogs follow the Web layout and Chinese copy. Save timestamps share a formatter that works in QuickJS without Intl.
- Native disabled Buttons have no activation/control target and resolve `:disabled` styles. Empty save cards support dashed borders. Product hover/focus styles remain explicit.
- Scroll intent travels through the existing pipeline; scroll offsets are transient renderer state. Initial bottom offsets, earliest/latest navigation and cleanup on close are supported. Window wheel coordinates/deltas convert through the resolved logical stage.
- Feature scene chrome policy is preserved when native feature surfaces are created; hidden dialogue must not remain in a modal backdrop capture. Story state itself is untouched.
- Web baseline fixes: the common paper selector no longer overwrites the title artwork, and the menu's outer layer no longer retains an opacity animation that blocks Chromium backdrop blur. These fixes make the baseline stable before comparing Native.

## Reproduction

Start the demo with `pnpm dev:web` and `pnpm dev:native`, then run from the repository root:

```sh
node demo/scripts/hud-parity.mjs
node demo/scripts/render-parity.mjs
node demo/scripts/compare-parity-images.mjs demo/dist/native/hud-parity
node demo/scripts/compare-parity-images.mjs demo/dist/native/story-parity
node scripts/native-render-audit/lighting.mjs --skip-build
node scripts/native-render-audit/backdrop.mjs --skip-build
pnpm native:e2e
```

Set `QUA_PARITY_CHROMIUM` when a specific Chromium executable is needed. Start Native at the title for HUD capture; story capture accepts the title or first narration. Avoid source reloads while a capture driver is advancing the story.

## Evidence

- WGPU renderer library: 891 tests passed (`real-wgpu-noop,image-decode`).
- Native application: 280 unit tests and 14 CLI tests passed (`native-window,quickjs-rquickjs`).
- Native engine adapter: all 116 tests passed on the final source, including feature-scene visibility and intent disposal. Typecheck passed.
- Native UI compiler: 227 tests and typecheck passed. Demo typecheck passed.
- Historical `pnpm native:e2e`: passed its then-current interaction/final-title gates, reporting 398 dialogue samples, `catalog-first`, settings, chapters and title return. **Follow-up correction:** those samples included typewriter prefixes; 398 was not a count of unique dialogue lines, and a final-title readback did not establish intermediate scene visibility. The updated smoke gate uses stable dialogue identities and 15 real GPU visual checkpoints under `demo/dist/native/dev/e2e-checkpoints/`. Texture upload/shutdown errors in the historical run were 0; its final window presentation status was `OccludedAfterRetry`, while GPU readback succeeded.
- HUD: all 11 captures passed geometry/content and pixel gates. Mean RGB difference 0.522–2.099/255; maximum p95 5/255. Toolbar bounds differ by less than 0.01 logical pixels.
- Story: all 8 captures passed content/navigation/save/load and pixel gates. Mean RGB difference 0.745–2.488/255; maximum p95 8/255. The restored rain scene is pixel-identical to its pre-save capture in each renderer.
- Character material: all 10 real WGPU/Chromium cases passed, including every authored lighting profile; maximum mean error 0.916/255, p95 ≤2/255.
- Backdrop blur: all 6 real cases passed; maximum mean error 1.193/255, p95 ≤6/255. All material fixture texture uploads were released without cleanup errors.

The two `review.html` files under `demo/dist/native/{hud-parity,story-parity}` provide a movable Native/Web comparison divider. `measurements.json` records geometry and actual command/text content; `pixel-checks.json` records whole-frame RGB mean error, p95 and worst tiles. Material tests report separate character/blur regions and resource upload/release checks under `packages/native/target/render-audit`.

## Smoke flow follow-up

The revised `pnpm native:e2e` passed with **257 stable dialogue identities and 15 GPU visual checkpoints**. It followed normal reading through `catalog-first`; read-only skip correctly stopped at unread text. Bus stop, Mara's entrance, the shopping street, the studio, three-character staging and the selected branch were captured with complete dialogue. All authored background/cast assertions and scene-region pixel checks passed. The app used its configured frame cadence (6,368 rendered frames in this run), with zero texture upload or shutdown cleanup errors. Native app validation passed 283 unit and 14 CLI tests; the engine adapter passed 117 tests and typecheck. The final window status was again `OccludedAfterRetry`; these artifacts prove actual offscreen WGPU pixels, not uninterrupted on-screen visibility while the OS occludes the window.

Review `demo/dist/native/dev/e2e-checkpoints/review.html` and `report.json`. Black/flat scene detection excludes the bright dialogue panel. Failed checkpoints retain their PNG and JSON measurements. Unit coverage rejects a black scene with a normal bright dialogue box and verifies that reveal prefixes do not inflate line counts. The old rapid-click loop and final-title-only acceptance are no longer the product smoke gate.

## Scope and limits

The interactive captures exercise title/chapters, narration/speaker HUD, unlit character, rainy street lighting, long transcript navigation, menu/hover, settings, save/load and overwrite confirmation, then restoration of the saved lit scene. Material fixtures cover the lighting profiles authored throughout the demo plus alpha, layer overlap, gain clamping, degenerate gradients and rotation.

This is visual equivalence within a measured tolerance, not a claim of byte-identical font rasterization or every possible frame of every story branch. Chromium and Native font antialiasing and large-radius blur approximation can differ at edges. Capture assertions require mean RGB error ≤3/255 and p95 ≤10/255, in addition to geometry/content assertions. Native dashed borders currently use bounded rectangular edge segments; arbitrary CSS dash-phase continuity around rounded corners is not covered by this demo.
