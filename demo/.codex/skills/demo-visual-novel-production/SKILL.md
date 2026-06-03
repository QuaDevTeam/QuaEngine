---
name: demo-visual-novel-production
description: Use when working on the QuaEngine demo visual novel, including generating or regenerating character standees, expression variants, event CGs, backgrounds, editing demo QuaScript scenes, staging characters, polishing UI, reviewing Chinese story text, and preparing demo assets for commit.
---

# QuaEngine Demo Visual Novel Production

## First Steps

- Work from `/Users/orchiliao/Projects/QuaEngine`.
- Treat demo content, scripts, CGs, standees, backgrounds, UI art, and story text as copyrighted demo material, not MIT-licensed engine code.
- Runtime-used demo resources under `demo/assets/**` must be committed. Scratch outputs under `demo/.generated/**` are ignored and should not be committed.
- Before changing engine/renderer behavior for demo needs, follow QuaEngine guardrails: engine/store own authoritative state; renderer projects state and emits intents only.

## Asset Generation Commands

Use `demo/scripts/generate-assets.mjs`; do not hand-copy raw generated files into runtime assets without the script's cleanup/finalization pass.

- List asset ids: `pnpm --filter demo assets:list`
- Generate all missing assets: `pnpm --filter demo assets:generate`
- Generate missing CGs only: `pnpm --filter demo assets:generate-cgs`
- Generate missing character sprites only: `pnpm --filter demo assets:generate-characters`
- Generate one CG: `pnpm --filter demo assets:generate -- --only cg --id oracle-choice-terminal`
- Regenerate one CG: `pnpm --filter demo assets:generate -- --only cg --id oracle-choice-terminal --regenerate`
- Generate one character variant: `pnpm --filter demo assets:generate -- --only character --id unit7:resolve`
- Regenerate one character variant: `pnpm --filter demo assets:generate -- --only character --id unit7:resolve --regenerate`
- Generate one background: `pnpm --filter demo assets:generate -- --only background --id core-room`

Compatible environment filters still exist: `BACKGROUND_FILTER`, `CG_FILTER`, `CHARACTER_FILTER`, `ASSET_FILTER`, `REGENERATE_BACKGROUNDS`, `REGENERATE_CGS`, `REGENERATE_CHARACTERS`, and `REGENERATE_ALL_ASSETS`.

## Model Policy

- Do not use Seedream for demo assets.
- CGs default to `openai/gpt-image-2` with `CG_IMAGE_QUALITY=medium`; keep this lower-cost setting unless the user explicitly asks for higher quality.
- CG generation must use `references` from existing character sprites when characters appear. The prompt must preserve hairstyle, outfit silhouette, colors, face impression, height relationship, and the established sci-fi VN world.
- Character sprites use an anime-focused model plus remove-bg. Source images should be on a flat white or black studio background to avoid green edges and matte halos.
- Character cutouts must pass cleanup, normalization, and validation. Final sprites should be 1024x1536 PNGs with transparent corners, clean alpha, full body, visible shoes, and consistent apparent scale.

## Adding Or Updating Assets

- Add backgrounds to `backgrounds`, CGs to `cgs`, and standee variants to `characters` in `demo/scripts/generate-assets.mjs`.
- For CGs with known characters, add `references: ['characters/<id>/<variant>.png']` entries. Do not generate character CGs without reference images unless the scene has no established character.
- Keep runtime paths stable:
  - Backgrounds: `demo/assets/images/backgrounds/*.jpg` or intentional UI background paths.
  - CGs: `demo/assets/images/cg/*.webp`.
  - Characters: `demo/assets/characters/<id>/<variant>.png`.
- Delete unused raw proposals from `.generated`; keep only runtime-used assets in `demo/assets`.

## QuaScript And Staging

- Keep story and visual staging in `.qs` files. Use decorators/helpers such as `@SetBackground`, `@ShowCharacter`, `@MoveCharacter`, `@HideCharacter`, and imported TypeScript helpers instead of expanding QuaScript grammar.
- Use logical landscape stage coordinates. Default reference is 1920x1080; important subjects should stay inside the safe area across 16:10 to 16:9.
- Keep apparent standee sizes close. Height and body type can differ, but no character should feel accidentally giant or tiny.
- Suggested positions:
  - One person: `x: 960`, `y: 650`, scale near `1`.
  - Two people: `x: 520` and `1240`, `y: 650`.
  - Three people: `x: 420`, `760`, `1120`, `y: 650`, scale near `0.96`.
  - Four people: `x: 330`, `700`, `1080`, `1480`, `y: 650`, scale near `0.9`.
- Character entry/exit should at least fade; avoid sudden disappearances unless the script explicitly wants a shock cut.
- For event CGs that contain characters, hide standees first, then set the CG as the current background with a fade. Restore the background and standees after returning to sprite-mode staging.

## Story Text Norms

- Chinese narration should read like natural short-form VN prose: concise, specific, emotionally legible, and not slogan-like.
- Keep system/ORACLE lines calm, precise, and safety-logic driven; avoid cartoon villain phrasing.
- Keep character voices distinct:
  - 神代澪: restrained, guilty, precise, observant.
  - Tachibana Mara: dry, resistant, sharp, emotionally controlled until pressure breaks through.
  - Unit-7: literal and procedural at first, gradually developing desire and self-ownership.
  - ORACLE: polite, analytic, paternalistic, certain that control prevents harm.
- When expanding routes, add concrete action, reaction, and consequence. Avoid abstract exposition that does not change the scene.

## Demo UI And Engine Boundary

- Main menu, settings, save/load, log/backlog, story tree, and overlays are demo/plugin UI surfaces, not engine-core state owners.
- If demo UI needs new capability, add engine/plugin projection or intent support first, then render it. Do not make renderer components decide narrative progress or persist game state.
- Story tree entries that are locked or spoilery should be hidden or locked from engine-owned unlock/progress projection.
- UI should be no-select where text selection is not useful. Buttons and menu overlays should animate smoothly and expose clear feedback for save/load/settings actions.

## Verification

Run focused checks after script or demo changes:

```sh
pnpm --filter demo typecheck
pnpm --filter demo build
```

Before committing broader demo or engine changes, run:

```sh
pnpm run ci
```

For visual changes, preview the running demo at `http://localhost:5173/` and check START, first story progression, CG fade, character sizing, and return from CG to sprite staging.
