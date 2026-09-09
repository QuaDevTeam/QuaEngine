# Native demo UI synchronization — 2026-09-10

## Confirmed problem

Web product styling had evolved while the native app still used the earlier dark UI, smaller character reference boxes and generic dialogue/choice defaults. Earlier alpha/MSAA renderer fixtures did not validate the current demo interface. Native also used a fixed 1600 ms reveal duration rather than the shared 36 characters/second setting.

## Implementation

- `src/targets/native/presentation.ts` supplies product dialogue/choice chrome and the 640×1280 character reference box. Rust consumes this optional render-only DTO; generic defaults remain available to other projects. Text uses the existing native rich text/typewriter path. Full-line layout reserves the toolbar footer throughout reveal; choices retain their motion anchor and selection intents.
- `native-app.scss` and native screens now use paper/sea-green styling, the shipping title background, Chinese player actions, a footer toolbar, readable system panels, nine save slots and two-column chapter selection. Locked chapter titles are hidden. Chapter order reads down the first column, then the second, matching Web.
- `feature-skin.ts` restyles the official settings/backlog surface projections, preserving their controls, scrolling, pipeline actions and package provenance. Native settings use one scrolling column; Web uses its responsive form layout. No browser module is imported into native.
- Native control feedback preserves the product's switch colors. Select popups inherit the projected field background and text instead of imposing the old dark palette. Optimistic switch feedback moves the thumb/label; authoritative state/color updates still arrive from the owning settings plugin.
- Loading a slot closes feature overlays before restoring story execution, preventing their return checkpoints from cancelling the resumed script.

## Validation

- `pnpm --filter demo typecheck`: passed.
- Native QuickJS/Vite compilation and Quack native QPK build: passed through the native launcher.
- Rust renderer tests with `real-wgpu-noop,image-decode`: 885 passed, including full-line chrome layout and current choice intent/motion-anchor regression coverage.
- `pnpm --filter demo native:e2e`: passed the current title → prologue → `catalog-first` choice → branch → game menu → title confirmation → title → settings → chapters → title flow. Report: 364 observed dialogue signatures, 117 manual advances, real HUD skip exercised, 490 pointer intents, 1920×1080 WGPU capture, zero texture upload/cleanup or font atlas errors. Signatures include reveal changes; this is not a claim of 364 unique manuscript paragraphs.
- Manual CDP pointer checks captured title, narration, speaker/Mara, record, menu, settings, save slots, saved progress, loaded progress and subsequent dialogue in `.generated/qa/native-sync/`. Saving slot 9 then loading it and advancing reached Mara's arrival dialogue.
- The old E2E expected the removed `stealth` choice, gallery title entry and BGM. It now targets the current choice/chapters and respects read-only skip stopping at unread prose. The current QS and QPK have no audio cues/assets: E2E checks silent audio projection lifecycle and shutdown, not nonexistent music. Native media playback requires its own media tests and future actual cues.

## Limits and follow-up

These checks prove the tested current native story/menu paths, not every scene or pixel-identical Web rendering. Native paper does not yet use Web's SVG grain, and Web character environment-light overlays remain a separate rendering feature. Current native settings deliberately use one scrolling column. Native E2E's final OS surface can be occluded by other desktop windows; its validated screenshot is a real WGPU readback, not proof that the OS kept the window foregrounded.

Keep `scripts/hud-parity.mjs` synchronized with the Chinese controls and 42-pixel toolbar inset. Compare the shared fixed surfaces exactly, and check centred containment for native content-sized panels. Do not restore obsolete demo UI labels or story targets to make tests pass. Remove generated `assets/scripts/native-app.mjs` before a Web-only asset build.

Character clipping and memory fixes, native app/runtime checks and measured RSS/physical footprint are recorded in [native-memory-and-proportions.md](native-memory-and-proportions.md). The final E2E log is `.generated/qa/native-sync/verified-final-e2e.log`. The updated Web/native HUD parity script has not passed this session: the Web server timed out, so the native captures do not establish cross-target pixel parity.

The later leak review found and fixed stale pending font/video uploads and bounded native diagnostic histories. Native app 288 tests, CLI 14 tests, engine-native 111 tests/typecheck passed. Eighteen panel cycles over about165 seconds showed RSS ending near436MiB without monotonic growth; see `native-memory-and-proportions.md`.

## Smoke fixture refresh

The default native window smoke fixture no longer renders a transparent dark panel with a blank/black result. `test-fixtures/renderer/qui-qss-surface-frame.json` now uses the current paper/sea-green presentation, a visible `Native smoke preview` title and an `打开设置` action while preserving the existing command ids and intent contract. This keeps the low-level finite smoke test visibly useful without pretending to be the complete demo E2E; the complete product path remains `pnpm --filter demo native:e2e`.
