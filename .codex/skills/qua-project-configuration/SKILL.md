---
name: qua-project-configuration
description: Use, validate, or update QuaEngine unified project manifests (`qua.project.yaml`, `.yml`, `.json`) spanning project identity, Web/PWA icons, device support, Cocos target sync, Vite virtual modules, and engine metadata wiring.
---

# Qua Project Configuration

The Vue template's `assets:build` script uses `quack workspace:bundle --all`. Keep template scripts aligned with the actual Quack CLI; `quack workspace build` is not a supported subcommand.

Godot projects use `targets.godot` with `build.entry`, optional `build.viteConfig`, `build.profile` (`debug`/`release`), `projectDir`, `layout` and `assetTarget`. `quack project build --target godot --all` generates a standalone Godot 4.7 project and current-host GDExtension; doctor checks configured source paths. Generation is atomic, protects authored output/source aliases, and selects only `godot-core-resolver`. See [qua-godot-renderer](../qua-godot-renderer/SKILL.md) for requirements and actual desktop validation. Include Godot in symmetric target-isolation checks; `native` remains JavaScriptCore/wgpu.

Use this skill when changing `qua.project.yaml`, `qua.project.yml`, `qua.project.json`, `@quajs/quack/project`, `virtual:qua-project`, create-qua-game manifest scaffolding, Web/PWA icon emission, Web device guard behavior, or Cocos project sync.

For a generated Creator workspace configure `targets.cocos.build.entry` (a business module exporting `bootstrap(services)`), optional `viteConfig`, and `macOSDeploymentTarget`. `quack project build --target cocos --all` generates the complete workspace at `projectDir`; sync alone only writes platform build configuration. Generation is atomic and rejects authored/non-generated destinations. The generator bundles public package `dist` entries, records retained modules, selects only `cocos-core-resolver`, and consumes its validated target manifest to create the startup scene. Keep all runtime paths relative, `cc` external, and hybrid native media under Creator assets; structured content remains in QPK. Use generated `qua-build/<platform>.build.json` via Creator `configPath`; exit 36 means success. Native macOS additionally requires stage=make and actual application launch.

## Manifest Contract

Use `demo`'s Cocos interaction, native lifecycle, full parity and `test:cocos:surfaces` commands to verify generated products. Parity uses separate persistent QA browser profiles under `demo/.generated/cocos-parity*` and fixed loopback origins (46181/46182, or 46191/46192 for surfaces). Keep these profiles separate from authoring browsers. Await actual control projection and completed chapter transitions before capturing; a pipeline intent can finish before native fonts and controls draw.

Parity may resume only from durable checkpoints created through actual input, retaining verified prefix evidence and replaying the remaining story. Reject changed runtime artifact hashes. JSB input is queued for frame dispatch; wait for that dispatch before retrying keys or controls.

Only one implicit manifest may exist at a project root. Auto-discovery checks `qua.project.yaml`, `qua.project.yml`, then `qua.project.json`; if multiple are found without an explicit config path, validation must fail.

Schema version `1` owns:

- `name`, `bundleId`, and optional `version`.
- `home` metadata: `title`, `shortName`, `description`, `lang`, `themeColor`, `backgroundColor`, `startUrl`, and `scope`.
- `icons.source`, `icons.favicon`, optional PWA icon entries, and optional Cocos icon metadata.
- `targets.web`: enabled flag, layout, desktop/pad/phone support, PWA settings, blocking UI copy, and optional Web asset target.
- `targets.cocos`: project directory, Creator version, platforms, layout/orientation, Quack asset target/hybrid settings, build options, and icons.
- `targets.native`: native desktop packaging intent for `macos`, `windows`, and `linux`; enabled flag, profiles (`debug`/`release`), layout, outputDir, app bundleId/version/buildNumber/icon metadata, native asset target, and native build options.

Defaults: `version` falls back to `package.json`, Web is enabled, Web devices default to all true, PWA is disabled, and Cocos/native are disabled unless configured and not explicitly disabled. Native profiles default to both `debug` and `release` when native is enabled.

## Package Boundaries

Use `@quajs/quack/project` to load, normalize, validate, create Web assets/manifests, merge Quack asset targets, sync Cocos build files, derive native artifact plans, and emit validated target-bundle manifests. Do not parse YAML/JSON in engine, renderers, or templates.

Use `createQuaProjectNativeArtifactPlans` when native packaging needs the concrete output matrix. It expands `targets.native.platforms` and `targets.native.profiles` into deterministic plans whose `artifactDir` is isolated by `outputDir/profile/version-buildNumber/platform`. The sanitized `version-buildNumber` value is exposed as `versionSegment` on each plan so signing, release immutability checks, update metadata, and distribution manifests do not need to parse it back out of `artifactDir`.

Use `emitQuaTargetBundleManifest` after Web, Cocos, or native bundling has collected post-bundle dependencies, renderer entries, runtime packages, and target metadata. It validates with the active `expectedTarget` before writing `target-bundle-manifest.json`, so cross-target core adapters or mismatched renderer entries fail before artifact startup metadata is emitted. Native packagers may use `emitQuaProjectNativeTargetBundleManifest` to create the native manifest from a native artifact plan before delegating to the shared emitter. Native release manifests are immutable per `versionSegment` and platform: if a release artifact already contains a different `target-bundle-manifest.json`, the emitter must refuse to overwrite it and require a new app version/buildNumber or an explicit cleanup. Debug manifests may be regenerated in place for local iteration.

Use `doctorQuaProjectConfig` or `quack project doctor` to report target readiness. Doctor results include `info`, `warning`, and `error` issues for Web device support, local/external icon sources, PWA icon/service-worker caveats, Cocos project directory presence, configured platforms, hybrid asset output, and native platform/profile/icon/output metadata. Errors should fail packaging; warnings should be fixed or intentionally accepted.

Engine core may receive only normalized project metadata:

```ts
new QuaEngine({
  project: { name, bundleId, version },
  layout,
})
```

Web platform checks, favicon/PWA manifest generation, service worker registration, and unsupported-device UI belong in Vite and `@quajs/renderer-web`. Cocos sync belongs in Quack/build tooling.

## Runtime Wiring

Vite exposes:

```ts
import { quaProject, quaWebRuntime } from 'virtual:qua-project'
```

Startup should evaluate `quaWebRuntime` with `evaluateWebPlatformSupport`; unsupported devices should render `mountUnsupportedPlatformUi` before engine startup. If PWA is enabled and a service worker URL is present, register it through `createPwaWebRendererPlugin`.

## Brand icon sources

The repository brand kit lives in `assets/brand/` and uses a generated anime portrait. The demo declares `public/icon.png` and `public/favicon.png`; the Vue starter declares `assets/app/icon.png` and `assets/app/favicon.png`. Keep both manifest paths and any explicit HTML favicon link in sync with these binary assets. Preserve PNG bytes during scaffolding; do not pass them through text placeholder rendering.

Use the source portrait to export app/tab sizes, rather than redrawing the character at each size. Brand usage and source/prompt records are documented in `assets/brand/README.md`. Starter icons are development placeholders; generated projects must replace reserved QuaEngine artwork before shipping their own product. Brand exports do not belong in engine state or a runtime content injection path.

## Validation

`create-qua-game` exposes `visual-novel-vue` and `plugin` templates to both CLI and IDE. The plugin template declares `quajs.extension` with independent runtime/editor entries, TypeScript build scripts, and no game manifest or preview. Keep its CLI next steps as build/typecheck instead of game asset commands. Non-force scaffolding uses exclusive text and binary copies; retain PNG bytes. IDE-owned SDK archives are authoring dependencies, not Runtime QPK activation. The game starter opens directly into dialogue without an empty HUD overlay or stale startup message; keep explicit renderer CSS imports and typed runtime trust keys. Validate an installed standalone starter with both typecheck and an actual Web preview.

Prefer targeted checks after changes:

```bash
pnpm --filter @quajs/quack test -- --run
pnpm --filter @quajs/vite-plugin test -- --run
pnpm --filter create-qua-game test -- --run
pnpm --filter @quajs/renderer-web exec vitest --run -t "classifies Web device classes|evaluates disabled devices"
pnpm --filter @quajs/quack typecheck
```

Also run affected `typecheck` and `build` commands. If `@quajs/renderer-web typecheck` reports missing `@quajs/render-core` exports after render-core source changes, rebuild `@quajs/render-core` before retrying.

## Review Checklist

- Does manifest discovery fail on duplicate implicit configs?
- Does `quack project doctor` report actionable errors/warnings for target readiness?
- Do Web favicon/PWA icons have declared local sources or external URLs?
- Are Web device restrictions enforced before engine startup and represented only as renderer-local UI?
- Is engine core still platform-neutral and receiving only normalized metadata/layout?
- Do Cocos sync files use generated `configPath` JSON and copied icon assets instead of Creator volatile cache?
- Do native artifact plans isolate debug/release outputs and release versions before packaging writes files?
- Do native release manifest writes reject accidental overwrites of an existing version/platform artifact while debug remains regeneratable?
- Are Quack workspace asset targets merged without losing explicit bundle target overrides?

## Production builds

`targets.native.build` accepts `cargoManifest`, `cargoPackage`, `viteConfig`, `appAsset`, `workspaceConfig` and `cargoFeatures`. Release packaging requires native-window and javascriptcore. `targets.native.distribution.macos` contains `minimumSystemVersion`, `signing: { mode: adhoc | developer-id, identity?, entitlements? }` and `notarization: { enabled, keychainProfile? }`. Enabled notarization requires Developer ID signing and a Keychain profile; never store secrets in the manifest. `name` is the OS window/application display name, with `(Dev)` only in development. See `packages/build/quack/docs/production-build.md` for the full example, host-only macOS scope, numeric Apple version fields, output immutability and validation. The editor and CLI use the same `buildQuaProjectProduction` pipeline.

For the demo Cocos surface review, reuse the full-story browser profiles and origins (ports 46181/46182; IndexedDB is origin-scoped) so chapter unlock state matches the native profile. Locked and unlocked chapter titles have intentionally different shared geometry; mixed profile data is not a valid same-state layout comparison. Preserve a failed report when correcting the test setup.

Before a surface comparison, restart the native application after other interaction/restart tests. Browser reloads create a fresh session backlog; a native process that previously loaded a save has different in-memory dialogue history. Keep durable profiles and chapter unlocks, and compare only sessions created by the same input sequence.

Bound Playwright teardown waits, close temporary servers, and confirm no process uses the owned QA profile paths before exiting a runner whose transport remains pending. Preserve teardown evidence separately from game assertions.

For Creator media reviews, the generated Web startup skips the optional SDK splash watermark and profiler and enters the shared demo directly. The selected Creator pipeline and engine profile must agree; startup and real game GPU captures remain required after changes.


Creator 3.8.8 CLI 构建使用每次独立的临时工作区导入副本，避免跨平台／重复使用导入数据库时将资源识别成普通文件。demo 构建脚本保留原始生成文件，验证启动场景（原生还要求 make 产出应用）后原子发布 build/<platform>；失败保留上一份可用输出。临时副本和构建锁自动清理。生成 package.json 使用稳定项目 UUID。脚本调用仍为 configPath，SDK 成功码为 36；该退出码本身不构成验收。独立 CLI 手动复现时请为每个平台复制一份原始工作区；Creator 图形编辑器可直接打开生成目录。
