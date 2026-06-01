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
- `vite.config.ts` enables hash CSP and SRI output under `dist/qua-security/`.

The Vue renderer preset uses the current feature order: input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, and achievement. Logic-only features such as `@quajs/story-graph` chapter select and `@quajs/plugin-inventory` can be added independently when the project needs them.

## Web Security

Runtime QPKs are wired through `@quajs/security-web`. Add your production public keys to `TRUSTED_RUNTIME_KEYS` in `src/game/bootstrap.ts`, sign runtime QPKs with `quack bundle --sign-key ... --sign-key-id ...`, and deploy the generated `dist/qua-security/csp.txt` as a `Content-Security-Policy` response header.

Blob runtime module fallback is disabled by default. If you enable it in `createWebRuntimeModuleLoader`, also set `webSecurity.csp.allowRuntimeBlobModules: true` so `script-src blob:` is explicit.

Install the QuaScript VS Code extension for `.qs` diagnostics, completions, story tree inspection, and QPK exploration.
