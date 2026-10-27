---
name: qua-docs
description: Maintain QuaEngine's svedocs site, creator tutorials, generated package references, custom theme, landing page and shared brand exports.
---

# QuaEngine documentation and brand

## Responsibility

`docs/` is an independent pnpm workspace on svedocs/svedocs-cli 0.2.4. It produces static output without building engine, Electron or Rust packages. Use the installed use-svedocs, configure-svedocs, customize-svedocs-theme and build-svedocs-landing skills when changing the corresponding surfaces.

## Content and source ownership

- Author tutorials under `docs/content/docs`, standalone pages under `docs/content/pages`.
- `docs/scripts/prepare-content.mjs` gathers these pages, package READMEs, and original `docs/design`, `guides`, `security`, `reviews` documents into ignored `.generated/content`.
- Edit original reference sources, never generated copies. Preserve link/anchor behavior and source provenance. Do not replace an existing historical report with claims about newer behavior.
- Verify examples against current source/templates. Narrative state remains engine/store-owned, pipeline is the only bus, and generated runtime content travels through QPK.
- Every public page needs a unique useful title and description. Keep section indexes and search discoverability complete.
- Check public npm/release availability before presenting onboarding or download commands as usable. As of 2026-10-27, create-qua-game is unpublished and Editor releases are absent: onboarding uses source-built Editor with its portable SDK. The homepage copies the full Git clone command and keeps it contained on mobile. Re-verify before changing these dated statuses; configured release workflows are not published artifacts.
- Rust/wgpu Native is JavaScriptCore-based; its dated QuickJS reports are historical evidence. Godot is a separate, current GDExtension/QuickJS target. Separate compile checks, runtime tests, GPU readback, visible-window acceptance and platform parity.
- Godot instructions live in `content/docs/platforms/godot.md`. Register renderer-godot, godot-host, renderer-scene and scene-host package READMEs in `prepare-content.mjs`; retain platform/reference indexes, homepage and README discoverability. Document current-host generation, Godot 4.7+/Rust/C/FFmpeg prerequisites, `run:godot` versus `edit:godot`, export templates, static-QPK-only trust and Web effect gaps. Keep macOS evidence separate from Windows/Linux runtime acceptance and whole-story/listening claims. Smoke-test Godot search, reference links, Markdown twins and mobile tables.
- Cocos creator instructions live in `content/docs/platforms/cocos.md` and `cocos-media.md`. Keep public package references for renderer-cocos, cocos-host and store-cocos registered in `prepare-content.mjs`. Distinguish `project sync` from complete workspace generation, public dist inputs, sole target resolver injection, hybrid QPK/Creator resources and Creator CLI configPath/build/make with success code 36. Keep independent import copies and failure-preserving output behavior accurate. Cocos media reports compare Web, Creator Web and Cocos macOS, not Rust/wgpu Native; retain actual host fallback, media limits, debug QA prerequisites, artifact hashes and unaccepted device/listening/OS-input scopes.

For demo Cocos command sequences, generate a production Web review artifact with `VITE_QUA_PARITY=1` and match the story/resources across all compared builds. The demo Web config uses `emptyOutDir: false` to preserve other target outputs. Lifecycle QA owns app launch and requires the debug port free; relaunch the app afterward for parity/media checks. Check these preconditions against the scripts when editing instructions.

## Theme

Keep configuration in `docs/svedocs.config.ts`. Register replacements in `vite.config.ts`. `Site.svelte` passes generated svedocs data to `DocsApp` and supplies the shared landing slot. Custom navbar, sidebar composition, reading shell, footer and CSS live in `src/lib/theme`.

Preserve the single main landmark, skip link, local search controller, heading anchors, code copy, ToC, dark/system modes, reduced motion and mobile navigation. Do not rebuild content indexing or a second search implementation in UI components.

The homepage hero starts directly with its heading. Keep the removed slogan badge, bottom promotional tag row and mascot's floating `imagination.ts` tag out of `Landing.svelte`; do not reserve their former spacing. Retain the intro, actions and install-command copy feedback. The navbar, footer and OG wordmark omit only the star after the QuaEngine brand name; preserve the existing page copy, layout and other decorations.

The shared background slot provides static sakura/mint gradients and a sparse, low-contrast SVG motif, with the reading column kept quiet. Keep it decorative, non-interactive and free of animation. The inset sticky navbar uses shared header offset/height tokens for sidebar, ToC, mobile menu and anchor clearance; preserve its visible outer gap on desktop and mobile. Sidebar nesting has exactly one guide on each child list: do not add another border to `.sd-sidebar-group-body`. Active links use a soft fill without svedocs' corner ornaments or inset border. Verify the open mobile menu and scrolled/anchor states as well as initial page screenshots.

Markdown tables are wrapped by `src/lib/markdown/qua-tables.ts`: the table retains native table display and full-width column layout, while `.qua-table-scroll` owns the single border and keyboard-accessible overflow. Do not put `display: block` or scrolling on the table itself; it leaves a full-width frame around content-width columns. Verify short tables on desktop and wide reference tables on mobile. Keep the mascot artwork free of the removed decorative slogan sticky note.

QuaScript fences (`qs` and `quascript`) use the supported rehype hook in `src/lib/markdown/qua-code.ts` for build-time Shiki highlighting. Reuse the canonical VS Code TextMate grammar under `packages/build/vscode-quascript/syntaxes/` with its TypeScript embedding; do not alias the entire language to TypeScript or patch svedocs. `quaCodeThemes` is shared with the regular code theme config. Keep raw source in `data-copy`, the native svedocs line structure, and its icon-only copy button with an accessible label. Unsupported DSLs remain escaped plain text with the same copy controls. Check both theme token colors, blank lines, literal interpolation/HTML, built-in languages, and mobile copy/scroll behavior; Shiki stays out of client bundles.

## Error recovery and SEO

`src/lib/theme/Error.svelte` is registered as the `Error` theme component and also renders the prerendered `/404` document. Preserve one `main#content`, shared navigation/search, responsive light/dark artwork, noindex/follow, and generic safe messaging for non-404 failures. Test both direct missing URLs and client navigation into missing routes, including search recovery. Keep SvelteKit `paths.relative: false`: Workers can serve the copied `404.html` at arbitrary depths, so relative stylesheet/chunk URLs break deep error pages. Verify deep 404 asset requests and hydration through `dev:worker`, not only preview.

`prepare-content.mjs` uses gray-matter to add per-page image frontmatter and `scripts/social-images.mjs` renders 1200x630 PNGs from `social-template.html` with existing Playwright. Chrome (or `CHROME_PATH`) or installed Playwright Chromium is required for initial content preparation; Linux uses `playwright install --with-deps chromium` for browser and CJK fonts before checks/build. Images are local-only, content-hashed, cached under ignored `static/og`, and embed the canonical mascot/Latin font. Keep the OG mascot square with `object-fit: contain`; do not rotate the mascot or its backing card, since combined tilts make the original head pose look distorted. Explicit authored image frontmatter takes precedence. Keep image dimensions, MIME and alt metadata; keep `seo.ogImage: false` because this project-owned PNG path replaces framework generation. Do not introduce generated OG assets into Git.

SEO authority stays in svedocs configuration and frontmatter: unique page titles/descriptions, separate homepage `seoTitle`, absolute site URL, publisher/organization identity, canonical/hreflang, per-page TechArticle/WebPage and breadcrumbs. Do not emit duplicate head tags or claim a custom search action without an actual URL-based search endpoint. `test:seo` verifies production HTML without JavaScript, PNG dimensions, structured data, all page metadata, sitemap/robots and real 404 status.

## Brand

Canonical exports live in `assets/brand/`. The pink chibi mascot was generated with Replicate CLI, `openai/gpt-image-2.5-flare`, quality `medium`. Record final prompts and prediction metadata without credentials. `scripts/brand/export.py` creates avatars, banner/social image, organization wordmark, WebP variants and demo/starter icons. No WIP label belongs in current artwork. PNG icon references in project manifests remain unchanged.

Brand exports are reserved assets, separate from software licenses. Local asset changes do not prove GitHub settings were updated. Remote publication and external avatar changes require actual authorization and verification.

The Editor has a distinct rounded app icon with transparent margins and a mint pencil over the reviewed mascot. `scripts/brand/editor.py` deterministically composes `assets/brand/quaeditor-icon.png` and runs inside the full brand export. Electron's `scripts/build-icons.mjs` consumes that canonical PNG to generate PNG/ICNS/ICO in `dist/icons` without platform-specific tools. Inspect small sizes on light/dark backgrounds. Keep editor identity separate from game icons; generated icon resources and a runtime Dock icon do not prove installer metadata or signing.

## Repository README

Keep the README visually aligned with the docs using the reviewed mascot, warm cream/sakura/mint palette, and GitHub-supported Markdown/HTML. `scripts/brand/readme.py` composes dedicated light/dark covers as part of the brand export. Use `<picture>` with `prefers-color-scheme` and a light fallback; avoid CSS-dependent layouts and keep commands, links, status and license text selectable.

`README.md` is English and `README.zh-CN.md` is Simplified Chinese. Keep capability claims, commands, dates and license boundaries in sync. Each README uses its own localized cover and actual tutorial screenshot, including alt text and caption. Covers list all four targets, including Godot. Use `scripts/brand/readme.py` to export only these covers, with local Latin and CJK fonts.

The docs deliberately have partial English coverage: `content/docs/en/` mirrors the handbook index, quick start, first-scene tutorial and complete Editor section. Chinese default routes stay unprefixed. Custom shell text uses `context.t`, navigation uses localized links, and search is scoped to the current locale. Keep untranslated guide links explicitly labeled Chinese. Use the built-in language selector and fallback routing; never manufacture an English screenshot by replacing DOM text. Extend real translations before linking them. Full strict translation coverage is not an acceptance claim for this partial rollout.

Capture real docs previews through `node scripts/brand/capture-docs.mjs` with a production preview running. It captures both actual locale routes and records build version, locale, route, dimensions, browser, date and image hashes in `assets/brand/readme-previews.json`. Rebuild and restart preview before capture; inspect all four resulting screenshots. Do not imply these prove editor or renderer parity. Check images, local links, anchor navigation, collapsed reference sections, and mobile overflow in light/dark Markdown previews. README-only changes do not require rebuilding engine or native packages.

Restart the docs preview after rebuilding, so its loaded client manifest matches the final static assets. For a whole-site review, check rendered local anchors/assets, package export specifiers and QuaScript examples as well as strict content validation; preserve historical review conclusions and correct current guides at their sources.

## Validation

```sh
pnpm --dir docs install --frozen-lockfile
pnpm docs:check
pnpm --dir docs test:markdown
pnpm docs:build
pnpm --dir docs preview
pnpm --dir docs test:smoke
pnpm --dir docs test:seo
pnpm --dir docs test:sidebar
```

Use Node 22.12+ and pnpm 12.3.4. Preserve the independent lockfile and supply-chain policy. CI runs `pnpm --dir docs run check`, `run test:markdown` and `run build` directly in the docs workspace: root script dispatch can auto-install unrelated workspace dependencies. Only static output is configured; build output is `docs/build/`. CI validates and uploads an artifact, without deploying.

After svedocs upgrades, verify previous/next navigation and browser history in the custom sidebar, plus opening the mobile menu on a deep route. `test:sidebar` checks the active child enters the scroll container in light/dark modes and writes screenshots and the installed svedocs version under `.generated/qa/sidebar/`.

## Production deployment

`docs/wrangler.jsonc` publishes static assets to the `quaengine-docs` Worker at `https://quaengine.com`, in the same account as the registry. Keep the exact apex custom domain, directory-index HTML handling, real 404 fallback and immutable cache headers for hashed assets. Do not alter the registry's subdomain or deploy its service as part of docs work.

Use `pnpm --dir docs deploy:check` for Wrangler dry runs, and `pnpm --dir docs dev:worker` plus `DOCS_TEST_URL=http://127.0.0.1:4176 pnpm --dir docs test:smoke` to exercise Workers asset routing. When deployment is authorized, `DOCS_SITE_URL=https://quaengine.com pnpm --dir docs run deploy` checks and rebuilds before publishing. Verify HTTPS, direct routes, search, 404, markdown twins and SEO on the live origin with `DOCS_TEST_URL=https://quaengine.com pnpm --dir docs test:smoke`. A successful upload alone does not prove domain or certificate readiness.

Inspect desktop/mobile and light/dark screenshots. Exercise search including no results, mobile nav, a long reference page, anchors, 404, brand downloads, code copy, internal navigation, markdown twins, llms and sitemap. Keep tests focused on these user flows rather than mirroring CSS values.

## Editor downloads

The homepage Editor action links to `/docs/editor/downloads`. When releases exist, keep stable/beta platform links aligned with `.github/workflows/editor-release.yml` and channel asset names; until then, show source setup and planned filenames without dead download links. Document automatic checking, verified downloads and explicit restart. Do not imply a release is available until its GitHub assets exist. Component publishing is independent through `editor-components.yml`; catalogs retain compatible versions and use immutable URLs.

macOS signing and notarization are required GitHub Actions release steps; describe the configured workflow separately from an actually published/notarized artifact. Windows remains unsigned, and Windows/Linux platform tests are currently explicitly deferred while builds and hash checks remain enabled. Keep these platform distinctions visible on the download page and in release documentation.


## Editor handbook localization

Keep every `/docs/editor/*` route paired with `/docs/en/editor/*`, including the index, downloads, projects, workspace, authoring, character, animation, Novel Writer, preview, marketplace, builds, troubleshooting and development/service references. Author workflow pages under `content/docs/editor` and its `en/editor` mirror; `prepare-content.mjs` imports the localized package reference sources. Preserve existing reference routes. Chinese character/animation/Registry references use their `README.zh-CN.md`; English uses original package READMEs, and workbench English uses `packages/editor/README.en.md`.

Check product instructions against current source. Statement Properties is a separate dock view, not the removed code/split/visual modes. Fixed navigation cannot dock. Native embedding is macOS-only; Cocos/Godot are separate toolchains rather than embedded preview/build-dialog options. Preview storage is temporary where documented; apply-to-source still requires normal saving. Novel Writer export includes approved and draft, excluding needs_review/rejected; exported drafts are not approved. Translate menu instructions while retaining Chinese application labels where useful; English docs do not imply an English Editor UI.

Run `test:editor` with production preview for locale coverage, cross-language switching, scoped search, deep mobile routes, internal links/anchors and no-JS metadata; also run the normal Markdown, strict content, build, smoke and SEO gates. The full site remains intentionally partially translated outside Editor. Use ignored `.generated/qa/editor/` for evidence and refresh README screenshots if shared navigation changes.
