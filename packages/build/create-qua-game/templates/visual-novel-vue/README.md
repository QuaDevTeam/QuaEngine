# __PROJECT_TITLE__

A QuaEngine visual novel starter generated with `create-qua-game`.

## Scripts

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm run assets:build
```

## Project Shape

- `src/game/scenes/opening.qs` is the first QuaScript scene.
- `src/game/bootstrap.ts` owns engine and renderer wiring.
- `assets/` is served through the QuaEngine Vite dev VFS and can be bundled with Quack.
- `src/game/styles.css` contains project styling on top of the optional renderer base/default styles.

Install the QuaScript VS Code extension for `.qs` diagnostics, completions, story tree inspection, and QPK exploration.
