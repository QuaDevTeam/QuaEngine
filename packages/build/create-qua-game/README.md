# create-qua-game

Templates: `visual-novel-vue` creates a game, while `--template plugin` creates a
TypeScript runtime plugin and optional editor panel with `quajs.extension` metadata.
Plugin projects use `npm run build` and have no game preview. QuaEngine Editor reuses
these templates and supplies portable SDK archives for local dependency installation.

Project scaffolding CLI for QuaEngine visual novel games.

As of October 21, 2026, this CLI is not published on npm. For a runnable new
project, start the [editor from source](../../../docs/content/docs/getting-started/index.md)
and use **File → New Project**; it supplies portable SDK archives for the template.

To generate template files from a checkout without installing their dependencies:

```bash
pnpm --filter create-qua-game build
node packages/build/create-qua-game/bin/create-qua-game.cjs my-game --no-install
```

The standalone CLI template uses versioned npm dependencies. Installation requires
those packages to be available in your registry; it does not inject the editor's
local SDK archives. The editor path handles that step for current source builds.

The first template is `visual-novel-vue`, a Vue + Vite starter wired to QuaEngine, QuaScript, the Vue renderer preset, Vite dev assets, Web runtime package trust, and Quack asset builds.

Official renderer packages now also include `@quajs/renderer-react` and `@quajs/renderer-svelte`; the scaffolded starter remains Vue-focused until additional templates are added.
