# Native image prewarming

The interactive native path already decoded images asynchronously, but requested them only when a frame needed them and released them when they left the frame. Large images could therefore appear late, and returning to an earlier background repeated decoding, premultiplication, mip generation and upload.

The compiler now accepts static resource hints from the owning background and character decorator compilers. Engine dialogue publishes the next 64 steps (at most 12 unique hints), preserving QPK provenance and without running future steps. The native pipeline bridge resolves character identities through the existing registry; the native host resolves sprite manifests and reads only mounted package assets. The Demo publishes the opening script window from the title screen.

Interactive WGPU keeps an image cache capped at 256 MiB, including mipmaps. The subsequent dynamic memory policy is described in [the memory follow-up](native-image-memory-budget-2026-09-22.md). Active projection images are pinned, idle images are evicted by recency with upcoming hints preferred, and only one speculative image job is started at a time. The native scheduler continues polling on stable title/reading frames until queued preparation is drained, then returns to idle; replacing the hint window cancels stale jobs. Active images can exceed the target and a bounded preparation result may temporarily be in flight; this is not a process or driver memory cap. Fonts and video retain their own lifecycle. Package scope changes cancel old generations, package unload clears speculative resources, and shutdown/device recreation release caches.

The exact-halving mipmap filter uses an integer 2x2 average with the same rounding; odd dimensions retain the area-weighted path.

## Measurement

See [raw measurements](native-image-prewarming-2026-09-21.json). Real Apple M4 / Metal, dev profile (workspace unoptimized; external dependencies optimized), same images and device for cold/async/warm paths.

| Resource | Cold preparation | Async enqueue | Background preparation | Warm selection p99, 120 visits |
| --- | ---: | ---: | ---: | ---: |
| Demo background, 1672×941 WebP | 388.30 ms | 0.018 ms | 413.55 ms | 0.0025 ms |
| Demo character, 768×1536 PNG | 166.33 ms | 0.031 ms | 164.26 ms | 0.0079 ms |
| Synthetic 3840×2160 PNG | 1200.31 ms | 0.189 ms | 1175.48 ms | 0.0009 ms |

Warm selection checks retained GPU residency after frame retirement, with no decoding or texture upload. These numbers do not measure complete frame latency or OS presentation. Unexpected dynamic assets, immediate jumps, or cache pressure may still require asynchronous cold preparation.

## Validation

Targeted TypeScript compilation and tests cover compiler metadata, bounded lookahead, character resolution and native projection; Rust tests cover retained textures, eviction, active pinning, package changes/unload, queued preparation, host path/provenance validation, and mip filtering.

- TypeScript: 329 tests passed across engine, script compiler, character, background and native engine. Affected package builds, Demo typechecking and changed-file lint passed.
- WGPU renderer with `real-wgpu-noop,image-decode`: 901 tests passed. These are structural renderer regressions; the measurements above use real Metal.
- Native host with `native-window,javascriptcore`: 295 tests and 14 CLI tests passed. After the final cached-frame budget maintenance change, the image-decode host suite passed 192 tests and 14 CLI tests; the full window/audio/JSC configuration passed `cargo check`.
- Workspace `git diff --check` passed. Existing local TypeScript tools were invoked directly because pnpm auto-install rejected a dependency trust downgrade; dependency trust settings were not changed.

The complete Demo E2E was attempted with fresh QPKs and the resident JSC app. Its first run caught duplicate bind-group invalidation, which was fixed and added to the regression coverage. Two subsequent runs reached the title with no such renderer error but macOS returned `OccludedAfterRetry` at the title checkpoint. The failing capture is preserved in `demo/dist/native/dev/e2e-checkpoints/title-menu.png`. The retry log also confirms `Image preload ready: images:backgrounds/town-bus-rain.webp` while the engine remained on the title screen. Complete visible-window E2E and subjective transition acceptance remain unverified.
