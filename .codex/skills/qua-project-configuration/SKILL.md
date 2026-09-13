---
name: qua-project-configuration
description: Use, validate, or update QuaEngine unified project manifests (`qua.project.yaml`, `.yml`, `.json`) spanning project identity, Web/PWA icons, device support, Cocos target sync, Vite virtual modules, and engine metadata wiring.
---

# Qua Project Configuration

Use this skill when changing `qua.project.yaml`, `qua.project.yml`, `qua.project.json`, `@quajs/quack/project`, `virtual:qua-project`, create-qua-game manifest scaffolding, Web/PWA icon emission, Web device guard behavior, or Cocos project sync.

## Manifest Contract

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
