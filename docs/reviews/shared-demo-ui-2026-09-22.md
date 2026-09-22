# Demo shared Web / Native UI review — 2026-09-22

The title menu uses the harbor illustration, a lighter cream gradient and warm charcoal serif typography with six equal, evenly spaced rows in a fixed order. Row dividers have been removed; hover uses a fine gold marker and translucent warm fill. Decorative English, setting descriptions and operation hints have been removed. Product menus, HUD, chapter selection, save/load, confirmations and plugin skins are authored once in `demo/src/game/ui`. Web is a thin Vue stage plus the optional `@quajs/renderer-web/qui` DOM adapter; native consumes the same resolved TSX/QSS surfaces through WGPU. Navigation stays in the shared logic session. Web-only projects retain custom framework UI.

The later hover investigation found an opaque-alpha parser mismatch that endpoint-only screenshots missed. See [Native hover root cause and regression coverage](native-hover-flicker-2026-09-22.md) for the failing intermediate-frame counterexample, shared parser fix and 45-capture real Native check.

Pure feature surfaces now use plugin `/surface` subentries and neutral `UiFeatureSurfaceEntry` contracts from render-core. No shared source imports a target core or native host. Browser select popups use OS chrome; base dialogue/characters/background continue through each target renderer. The optional Web adapter is a supported QUI subset, not arbitrary native shader/media parity.

The subsequent [startup presentation fix](native-startup-presentation-2026-09-22.md) removes colored missing-image textures, waits for a complete initial frame before revealing the window and retains the previous surface during demanded image preparation.

## Validation

- Builds and TypeScript checks passed for render-core, engine-native, native-ui, UI compiler, Web renderer and settings/backlog/gallery/achievement packages; demo TypeScript and production Web build passed.
- Relevant package tests passed: render-core 27, engine-native 117, UI compiler 227, settings 17, backlog 18, gallery 19, achievement 19; Web had 99 passing tests before two additional QUI cases were added, and all five QUI cases passed afterward. Demo skin regression passed. Native UI JSX has no test files.
- Production story regression passed all 22 cases, 46 acting checks and 3 lighting checks with zero browser errors. It covers all three endings, chapter replay, refresh/load/continue, settings and mobile layout. Final navigation/paint adjustments also passed the focused production UI and quit smoke checks.
- Paired HUD regression passed all eight panel geometry checks; largest measured difference was 0.0125 logical pixels. It also checked control order, nine-slot grids, hover and toolbar containment.
- Real paired story/input regression passed transcript earliest/latest navigation, save/overwrite/load and restored lighting. Final Native hover text was separately captured and reviewed after completing pseudo-state paint.
- Final native CDP interaction also passed save, overwrite acceptance, close back to reading, return to title and confirmed application quit; native logged normal exit with zero texture/font cleanup errors.
- Reviewed title, settings and history screenshots. Corrected Web select label contrast and Native history button hover paint, both with focused regressions.

## Evidence

- `demo/.generated/qa/shared-ui/comparison.png`: paired title and settings overview.
- `demo/dist/native/hud-parity/review.html`, `checks.json`: paired panel captures and measurements.
- `demo/dist/native/story-parity/review.html`: actual story and save/load captures.
- `demo/.generated/qa/story/results.json`: production story results.
- `demo/.generated/qa/ui/`: final Web UI captures.

## Remaining validation boundary

The full native application gate reached the story but failed actual window presentation with `OccludedAfterRetry` (initially `story-mara`; the rerun after the hover fix reached `story-street`). WGPU captures/CDP input are verified separately and do not turn this into a passing native OS-window gate. Browser/Node loopback transport also intermittently returned `ERR_ADDRESS_INVALID`; bounded transport-only retries were used, with successful complete reruns.

The installed pnpm 12 trust policy rejected existing chokidar/semver dependency installation (`ERR_PNPM_TRUST_DOWNGRADE`). Validation therefore invoked the already installed workspace Vite/TypeScript/Vitest tools directly without relaxing that policy; native rebuild used `QUA_NATIVE_EDITOR_FAST_REBUILD=1` after explicit package builds. Existing unrelated workspace changes were preserved.

## Native opening and return-to-title regression

Native reproduction found two synchronous preview captures before the first QS step (5 seconds each), and another 5-second capture wait before returning to title. The resident demo host has no save-preview provider, and its save cards do not display thumbnails. The shared runtime now disables save previews by default for all demo saves; individual manual saves no longer carry a separate policy. Engine step execution still starts automatically, with no synthetic advance intent.

The compiled-QS/shared-session regression runs without any preview responder and verifies immediate first-line projection, actual background, chapter/continue save creation, title return, resume at a later line and restart. Demo tests (2), TypeScript and production Web build pass. `scripts/navigation-smoke.mjs` exercises the same sequence on Web and Native, with a 2-second deadline per navigation and no story input after start/continue/restart. Native uses one persistent CDP connection to avoid repeated local transport handshakes. Readiness timings and WGPU/browser captures are in `demo/.generated/qa/navigation/{native,web}.json` and adjacent PNGs. These are focused navigation/readback checks, not the full native OS presentation gate above.

Save/load panels now omit the redundant mode-button row; their respective menu entries select the operation, and a filled load card restores immediately. The grid moves up 75 logical pixels within a correspondingly shorter panel. The focused Web/native navigation smoke saves slot 9, restarts, clicks that card to restore the saved second line without a separate load button, and returns to title. Both passed; paired `web-load-cards.png` / `native-load-cards.png` were inspected. Empty load cards remain inactive and save overwrite confirmation remains available. Demo tests, typecheck and both builds passed.
