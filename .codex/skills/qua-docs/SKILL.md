---
name: qua-docs
description: Maintain QuaEngine's svedocs site, creator tutorials, generated package references, custom theme, landing page and shared brand exports.
---

# QuaEngine documentation and brand

## Responsibility

`docs/` is an independent pnpm workspace on svedocs/svedocs-cli 0.2.1. It produces static output without building engine, Electron or Rust packages. Use the installed use-svedocs, configure-svedocs, customize-svedocs-theme and build-svedocs-landing skills when changing the corresponding surfaces.

## Content and source ownership

- Author tutorials under `docs/content/docs`, standalone pages under `docs/content/pages`.
- `docs/scripts/prepare-content.mjs` gathers these pages, package READMEs, and original `docs/design`, `guides`, `security`, `reviews` documents into ignored `.generated/content`.
- Edit original reference sources, never generated copies. Preserve link/anchor behavior and source provenance. Do not replace an existing historical report with claims about newer behavior.
- Verify examples against current source/templates. Narrative state remains engine/store-owned, pipeline is the only bus, and generated runtime content travels through QPK.
- Every public page needs a unique useful title and description. Keep section indexes and search discoverability complete.
- Native is JavaScriptCore-based; dated QuickJS reports are historical evidence. Separate compile checks, runtime tests, GPU readback, visible-window acceptance and platform parity.

## Theme

Keep configuration in `docs/svedocs.config.ts`. Register replacements in `vite.config.ts`. `Site.svelte` passes generated svedocs data to `DocsApp` and supplies the shared landing slot. Custom navbar, sidebar composition, reading shell, footer and CSS live in `src/lib/theme`.

Preserve the single main landmark, skip link, local search controller, heading anchors, code copy, ToC, dark/system modes, reduced motion and mobile navigation. Do not rebuild content indexing or a second search implementation in UI components.

The shared background slot provides static sakura/mint gradients and a sparse, low-contrast SVG motif, with the reading column kept quiet. Keep it decorative, non-interactive and free of animation. The inset sticky navbar uses shared header offset/height tokens for sidebar, ToC, mobile menu and anchor clearance; preserve its visible outer gap on desktop and mobile. Sidebar nesting has exactly one guide on each child list: do not add another border to `.sd-sidebar-group-body`. Active links use a soft fill without svedocs' corner ornaments or inset border. Verify the open mobile menu and scrolled/anchor states as well as initial page screenshots.

Markdown tables are wrapped by `src/lib/markdown/qua-tables.ts`: the table retains native table display and full-width column layout, while `.qua-table-scroll` owns the single border and keyboard-accessible overflow. Do not put `display: block` or scrolling on the table itself; it leaves a full-width frame around content-width columns. Verify short tables on desktop and wide reference tables on mobile. Keep the mascot artwork free of the removed decorative slogan sticky note.

QuaScript fences (`qs` and `quascript`) use the supported rehype hook in `src/lib/markdown/qua-code.ts` for build-time Shiki highlighting. Reuse the canonical VS Code TextMate grammar under `packages/build/vscode-quascript/syntaxes/` with its TypeScript embedding; do not alias the entire language to TypeScript or patch svedocs. `quaCodeThemes` is shared with the regular code theme config. Keep raw source in `data-copy`, the native svedocs line structure, and its icon-only copy button with an accessible label. Unsupported DSLs remain escaped plain text with the same copy controls. Check both theme token colors, blank lines, literal interpolation/HTML, built-in languages, and mobile copy/scroll behavior; Shiki stays out of client bundles.

## Brand

Canonical exports live in `assets/brand/`. The pink chibi mascot was generated with Replicate CLI, `openai/gpt-image-2.5-flare`, quality `medium`. Record final prompts and prediction metadata without credentials. `scripts/brand/export.py` creates avatars, banner/social image, organization wordmark, WebP variants and demo/starter icons. No WIP label belongs in current artwork. PNG icon references in project manifests remain unchanged.

Brand exports are reserved assets, separate from software licenses. Local asset changes do not prove GitHub settings were updated. Remote publication and external avatar changes require actual authorization and verification.

The Editor has a distinct rounded app icon with transparent margins and a mint pencil over the reviewed mascot. `scripts/brand/editor.py` deterministically composes `assets/brand/quaeditor-icon.png` and runs inside the full brand export. Electron's `scripts/build-icons.mjs` consumes that canonical PNG to generate PNG/ICNS/ICO in `dist/icons` without platform-specific tools. Inspect small sizes on light/dark backgrounds. Keep editor identity separate from game icons; generated icon resources and a runtime Dock icon do not prove installer metadata or signing.

## Repository README

Keep the README visually aligned with the docs using the reviewed mascot, warm cream/sakura/mint palette, and GitHub-supported Markdown/HTML. `scripts/brand/readme.py` composes dedicated light/dark covers as part of the brand export. Use `<picture>` with `prefers-color-scheme` and a light fallback; avoid CSS-dependent layouts and keep commands, links, status and license text selectable.

Capture real docs previews through `node scripts/brand/capture-docs.mjs` with a production preview running. It records screenshot provenance in `assets/brand/readme-previews.json`. Do not imply these prove editor or renderer parity. Check images, local links, anchor navigation, collapsed reference sections, and mobile overflow in light/dark Markdown previews. README-only changes do not require rebuilding engine or native packages.

## Validation

```sh
pnpm --dir docs install --frozen-lockfile
pnpm docs:check
pnpm --dir docs test:markdown
pnpm docs:build
pnpm --dir docs preview
pnpm --dir docs test:smoke
```

Use Node 22.12+ and pnpm 12.3.4. Preserve the independent lockfile and supply-chain policy. Only static output is configured; build output is `docs/build/`. CI validates and uploads an artifact, without deploying.

## Production deployment

`docs/wrangler.jsonc` publishes static assets to the `quaengine-docs` Worker at `https://quaengine.com`, in the same account as the registry. Keep the exact apex custom domain, directory-index HTML handling, real 404 fallback and immutable cache headers for hashed assets. Do not alter the registry's subdomain or deploy its service as part of docs work.

Use `pnpm --dir docs deploy:check` for Wrangler dry runs, and `pnpm --dir docs dev:worker` plus `DOCS_TEST_URL=http://127.0.0.1:4176 pnpm --dir docs test:smoke` to exercise Workers asset routing. When deployment is authorized, `DOCS_SITE_URL=https://quaengine.com pnpm --dir docs run deploy` checks and rebuilds before publishing. Verify HTTPS, direct routes, search, 404, markdown twins and SEO on the live origin with `DOCS_TEST_URL=https://quaengine.com pnpm --dir docs test:smoke`. A successful upload alone does not prove domain or certificate readiness.

Inspect desktop/mobile and light/dark screenshots. Exercise search including no results, mobile nav, a long reference page, anchors, 404, brand downloads, code copy, internal navigation, markdown twins, llms and sitemap. Keep tests focused on these user flows rather than mirroring CSS values.
