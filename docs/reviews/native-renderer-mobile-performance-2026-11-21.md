# Native renderer performance and mobile readiness

This review measures the native wgpu renderer on a real GPU and changes the parts that would stop it running on phone-class hardware. All numbers come from one Apple M5 Max (Metal) in release builds. They are relative measurements. No phone was run, so mobile FPS is an estimate (see "What this does not prove").

## Method

`packages/native/crates/quajs_wgpu_renderer/examples/native_render_perf.rs` drives the product per-frame path headlessly against an offscreen real-wgpu target:

- **Static scenes**: the renderer test fixtures, plus a representative in-game screen. The screen has a full-stage backdrop, detailed stripes, a translucent panel with `backdropFilter` blur and a blurred box shadow, an opacity group, quick-menu buttons, and the default dialogue box.
- **Animated scene**: the same screen with a typewriter line. Each frame goes through `NativeRendererProjectionRuntime::project_at_epoch_ms` → container composition → JSON parse/validate → `prepare_and_render` → submit, i.e. the Rust-clock path that runs every frame while text, transitions or animations are active.
- **Resolutions**: 1920x1080@1, 844x390@3 (modern phone landscape, 2532x1170 physical) and 800x360@2 (low-end Android, 1600x720 physical).
- **Device profiles**: `desktop` (WebGPU default limits), `mobile` (downlevel limits with a 4096 texture cap, the practical phone floor) and `mobile-strict` (downlevel limits at the 2048 GLES3 minimum). GPU validation errors are collected rather than panicking.
- **Metric**: `sustained` is wall time per frame over 300 back-to-back submissions after warm-up, with only the renderer's own two-frames-in-flight back-pressure. It equals max(CPU, GPU) per frame. Single-frame `gpu-wait` was latency-dominated (~1.6 ms floor) and varied ±25% between identical runs, so it is not used for comparisons.
- **A/B**: baseline, intermediate and final binaries were built from the same tree, swapping only the changed files, and run interleaved three times. Medians are reported.
- **Pixel validation**: `--capture` dumps raw RGBA for every static scene. Stripes sit behind the blurred panels because blurring a flat color hides any blur regression.

## Findings before the change

1. **Blur fill cost dominated the frame.** `ShadowBlur` ran every Gaussian pass as a full-frame triangle and only downsampled until sigma ≤ 16, so each pass read up to 97 taps per pixel. The default dialogue box (8px backdrop blur) plus a σ12 panel backdrop cost ~10 ms of GPU time per frame at 1080p on an M5 Max and ~15 ms at phone 3x. A phone GPU has roughly 1/10–1/20 of that throughput, which puts this scene in single-digit FPS.
2. **Scratch texture churn.** Two blurs with different sigmas in one frame shared a scratch pyramid that `render()` truncated after each use. Render targets were therefore reallocated and freed every frame, which is expensive on mobile drivers.
3. **Mobile device tier rejected.** The shared TextAtlas grid was 896x2799 RGBA, over the 2048 GLES3 limit. Product devices also requested `wgpu::Limits::default()` (full WebGPU), so `request_device` fails on downlevel phone GPUs that the renderer otherwise runs within.
4. **CPU was not the bottleneck.** Projection, composition and JSON parse together cost ~0.2 ms per animated frame. `prepare_and_render` cost 0.4–1.9 ms, mostly wgpu/Metal command encoding that scales with render-pass count.
5. **Memory.** The built-in TextAtlas costs ~9.8 MiB of GPU memory as soon as any text is drawn and is not counted in the renderer's texture ledger. Before the change, compositor scratch was 31.6 MiB at 1080p and 45.2 MiB at phone 3x for the dialogue scene.

## Changes

- `ShadowBlur` caps per-pass sigma at 4, matching Skia's GPU blur, so passes read at most 25 taps and run at 1/4–1/16 of the pixels.
- Blur scratch is a size-keyed pool shared by all blurs in a frame and released after 8 unused renders.
- Backdrop blur copies and blurs only `blur_source_region`: the draw's bounds plus 6σ plus the bilinear reach of each downsample level. Every pass is scissored to it. A mesh test locks the invariant that backdrop quads cover exactly their `physical_bounds`.
- The TextAtlas grid uses 256 columns (1792x1404) and is guarded by a downlevel-limit test.
- Devices request `native_renderer_required_limits(adapter.limits())`: downlevel limits plus the adapter's real texture sizes.

## Results

Sustained ms per frame (lower is better), median of three interleaved runs, Apple M5 Max:

| Scene | Resolution | Baseline | σ cap + pool | + ROI scissor | Speedup |
|---|---|---|---|---|---|
| All effects (static) | 1920x1080@1 | 10.58 | 2.75 | 2.57 | 4.1x |
| All effects (static) | 844x390@3 | 15.06 | 3.37 | 2.98 | 5.1x |
| All effects (static) | 800x360@2 | 4.82 | 3.09 | 2.59 | 1.9x |
| Default dialogue box only | 1920x1080@1 | 4.40 | 1.96 | 1.22 | 3.6x |
| Default dialogue box only | 844x390@3 | 6.19 | 1.96 | 1.47 | 4.2x |
| Default dialogue box only | 800x360@2 | 2.29 | 1.33 | 1.30 | 1.8x |
| Typewriter (Rust clock, full per-frame path) | 1920x1080@1 | 10.68 | 3.53 | 2.61 | 4.1x |
| Typewriter (Rust clock, full per-frame path) | 844x390@3 | 14.83 | 2.99 | 2.94 | 5.1x |
| Typewriter (Rust clock, full per-frame path) | 800x360@2 | 5.07 | 2.23 | 2.42 | 2.1x |

After the change this machine is CPU-bound at ~2–3 ms per frame (wgpu/Metal encoding), so the ROI step's further GPU saving appears small here and is within noise at 800x360. ROI matters more where fill rate is the limit, as on phone GPUs. The baseline frame time grew with pixel count (4.8 → 15.1 ms from 1.15 to 2.96 MP). After the change it is nearly flat, which shows that GPU blur fill was the removed cost.

Pixel diffs across 21 scene captures (3 resolutions):

- ROI scissoring versus the unscissored sigma-capped blur: **0 changed pixels** in every capture.
- Sigma cap versus the original blur: max difference **1/255** on ~5% of pixels, only inside the σ12 panel backdrop. The 8px dialogue backdrop is unchanged.
- Compositor scratch for the dialogue scene: 31.6 → 19.3 MiB at 1080p and 45.2 → 27.5 MiB at phone 3x (σ cap and pool).

Device-tier compatibility: every fixture and scene renders without validation errors under the `mobile` profile. Under `mobile-strict` only the 3x-DPR frame target (2532 px) still exceeds 2048, because the surface size is OS-provided.

Cross-compilation: `quajs_wgpu_renderer` (`real-wgpu-native,image-decode`) and `quajs_native_app --lib` with `native-gpu` and `native-audio-rodio` type-check for `aarch64-apple-ios` with the rustup stable toolchain. `embedded-sdk` does not, because `javascriptcore-sys` is declared only for macOS/Linux. The JavaScriptCore runtime is therefore the remaining iOS build blocker. Android was not checked (no Android target installed); it would also need a JavaScript engine decision.

## Validation

- `cargo test --release -p quajs_wgpu_renderer --features real-wgpu-noop`: 897 passed, including new tests for blur level/region math, backdrop quad bounds, downlevel limit resolution and atlas dimensions.
- `cargo test --release -p quajs_wgpu_renderer --features bench-smoke,wgpu-backend bench_smoke`: 8 passed. The heavy-UI fixture had stopped compiling after `ChoiceSetProjection.motion` was added; it is fixed.
- `cargo check -p quajs_native_app --tests --features native-window,native-audio-rodio,javascriptcore,native-font-ab-glyph` and `--lib --features embedded-sdk` pass. Running the native-app test binary fails to link `qua_editor_surface_*` on this machine. Untouched HEAD fails the same way in a clean worktree, so the native-app tests and Demo E2E were not run for this change.

## What this does not prove

- No iOS or Android device was run. The `mobile` profiles emulate downlevel limits on Apple Silicon; they do not reproduce phone GPU throughput, thermal throttling or tile-memory bandwidth.
- The GLES backend is not enabled in `real-wgpu-native` and was not exercised. In particular, the sRGB/non-sRGB presentation copy has not been verified on GLES.
- Analytic box shadows, opacity groups and composite drop-shadow filters still use full-frame intermediates. Composite passes are not yet scissored to group bounds.
- The built-in TextAtlas is still RGBA8 (~9.8 MiB). An R8 atlas would use a quarter of that but changes the shared producer/consumer contract.
- High-DPR phones render at full physical resolution. A render-scale/DPR cap would cut fill cost further and keep strict-tier devices under 2048, but it changes presentation and is left as a product decision.
