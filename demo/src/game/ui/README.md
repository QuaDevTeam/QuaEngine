# Shared demo UI

Web and Native use this one product UI source. `screens/*.tsx` and `app.scss` define the title, toolbar, menu, chapter selection, save/load and confirmations; `features.ts`, `settings-skin.ts`, `backlog-skin.ts` and `feature-skin.ts` define plugin surfaces. `session.ts` owns navigation and sends engine/plugin intents.

`surface.ts` resolves TSX plus build-time QSS in logical 1920 × 1080 coordinates. Web `bootstrap.ts` is a thin Vue stage host over `@quajs/renderer-web/qui`; Native `targets/native/session.ts` provides JSC/host/frame integration. Both consume identical roots, IDs, skins and intent handling. Base dialogue, character and background projections continue through the respective engine renderers.

Shared source must not depend on Vue, DOM, native host, or target bootstrap adapters. Assets remain QPK references with provenance. Other projects can opt into this path or use custom Web framework surfaces. Main-menu art, typography, spacing and behavior should be changed here once.

Validation: `pnpm --filter demo test:ui-surfaces`, demo TypeScript check, production Web build, `scripts/ui-review.mjs`, `scripts/quit-smoke.mjs`, `scripts/story-smoke.mjs`, and from repo root paired `scripts/hud-parity.mjs` / `scripts/render-parity.mjs` with the demo prefix and a running native app. Native product availability is still gated separately by `native:e2e`, including actual OS presentation.
