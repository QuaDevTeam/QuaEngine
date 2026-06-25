---
name: quack-configuration
description: Configure, review, or update @quajs/quack asset bundling. Covers QuackConfig, quack.config.*, quack.workspace.*, QPK/ZIP output, runtimePackage manifests, assetTargets, pipelines, signing, encryption, workspace bundles, patches, and QuaScript integration.
---

# Quack Configuration

Use this skill when creating, reviewing, or changing `@quajs/quack` configuration, Quack CLI usage, runtime QPK manifests, workspace bundles, asset target builds, or Quack plugin integration.

## Entry Points

Use `defineConfig` from `@quajs/quack` for TypeScript config:

```ts
import { defineConfig } from '@quajs/quack'

export default defineConfig({
  source: './assets',
  output: './dist/game.qpk',
  format: 'qpk',
  compression: { algorithm: 'lzma', level: 6 },
})
```

Config may be single-bundle or workspace mode. Do not mix loose runtime content push flows into Quack; dynamic generated content must be built as QPK Runtime Packages.

## Single Bundle Config

`QuackConfig` supports:

- `source`: source asset directory.
- `output`: output file or directory.
- `format`: `zip`, `qpk`, or `auto`.
- `compression`: `{ algorithm: 'none' | 'deflate' | 'lzma', level?: number }`.
- `compatibility`: `{ minGameVersion?: string }`.
- `encryption`: `{ enabled?, algorithm?: 'none' | 'xor' | 'custom', key?, keyGenerator?, plugin? }`.
- `versioning`: `{ bundleVersion?, buildNumber?, incrementVersion?, versionFile? }`.
- `plugins`: `QuackPlugin[]`.
- `ignore`: glob patterns.
- `verbose`: diagnostic output.
- `runtimePackage`: runtime QPK package metadata.
- `signing`: `{ key?, keyId? }`.
- `quascript`: QuaScript compile/story declaration config.
- `assetTargets` / `assetTarget`: platform or format-specific target outputs.

Example:

```ts
export default defineConfig({
  source: './assets',
  output: './dist/base.qpk',
  format: 'qpk',
  compatibility: { minGameVersion: '0.1.0' },
  compression: { algorithm: 'lzma', level: 7 },
  ignore: ['**/*.tmp', '**/.*'],
  versioning: {
    incrementVersion: true,
    buildNumber: process.env.BUILD_NUMBER,
  },
})
```

## Workspace Config

Use workspace mode for multi-bundle projects:

```ts
export default defineConfig({
  workspace: {
    name: 'MyGameAssets',
    version: '1.0.0',
    output: './dist',
    globalSettings: {
      compression: { algorithm: 'lzma', level: 6 },
      compatibility: { minGameVersion: '0.1.0' },
      versioning: { incrementVersion: true },
    },
    bundles: [
      {
        name: 'core',
        displayName: 'Core Assets',
        source: './assets/core',
        priority: 0,
        loadTrigger: 'immediate',
        dependencies: [],
        format: 'qpk',
      },
      {
        name: 'audio',
        source: './assets/audio',
        priority: 3,
        loadTrigger: 'lazy',
        dependencies: ['core'],
        compression: { algorithm: 'lzma', level: 9 },
      },
    ],
  },
})
```

Bundle definitions support `name`, `displayName`, `source`, `priority`, `compatibility`, `dependencies`, `loadTrigger`, `description`, `format`, `compression`, `encryption`, `assetTargets`, and `assetTarget`.

## Qua Project Manifest

Qua projects may define one shared project manifest in `qua.project.yaml`, `qua.project.yml`, or `qua.project.json`. If more than one exists and no explicit path is provided, validation must fail instead of merging split truth.

Use `@quajs/quack/project` for manifest work:

```ts
import {
  loadQuaProjectConfig,
  normalizeQuaProjectConfig,
  validateQuaProjectConfig,
} from '@quajs/quack/project'
```

The manifest owns project identity (`name`, `bundleId`, `version`), home metadata, icons, Web/Cocos/native targets, Web device support, PWA settings, Cocos sync/build options, and native packaging intent. `version` falls back to `package.json`, Web defaults to enabled with desktop/pad/phone enabled, PWA defaults to disabled, and Cocos/native are enabled only when their target blocks exist and are not disabled.

`createQuaProjectNativeArtifactPlans` expands normalized native project metadata into concrete `platform` × `profile` artifact plans with `artifactDir` isolated as `outputDir/profile/version-buildNumber/platform`. Native packagers should consume these plans before writing debug/release outputs or target-bundle manifests. After a Web, Cocos, or native post-bundle dependency graph is known, use `emitQuaTargetBundleManifest` with the active `expectedTarget` to validate before writing `target-bundle-manifest.json`. Native packagers can use `emitQuaProjectNativeTargetBundleManifest` as a thin helper that creates the native manifest from the native artifact plan and then delegates to the shared emitter.

Quack workspace loading automatically merges manifest-derived `assetTargets` into each workspace bundle unless `projectConfig: false` is set. CLI helpers are:

```bash
quack project validate
quack project doctor
quack project sync --target web|cocos|all
quack project build --target cocos --platform android --all
```

`quack project doctor` loads the manifest and reports Web device support, favicon/PWA icon readiness, PWA service worker caveats, Cocos platform configuration, Cocos project directory presence, icon sources, hybrid asset output hints, and native platform/profile/icon/output metadata. Treat `error` results as blockers and `warning` results as things to resolve or explicitly accept before packaging.

`quack project sync --target cocos` writes importable Creator build config JSON under `<projectDir>/qua-build/<platform>.build.json` and copies configured Cocos icon assets into `<projectDir>/assets/qua-app-icons/`. Use Creator command-line `configPath` with these files; do not edit Creator last-build cache.

The Vite plugin exposes `virtual:qua-project`, injects Web home meta, emits favicon assets when PWA is disabled, and emits `manifest.webmanifest`, PWA icons, and generated service worker assets when PWA is enabled.

## Runtime QPK Packages

Runtime packages must declare a `runtimePackage` manifest and use `format: 'qpk'`:

```ts
export default defineConfig({
  source: './runtime/chapter-2',
  output: './dist/runtime.chapter-2.qpk',
  format: 'qpk',
  compatibility: { minGameVersion: '0.1.0' },
  runtimePackage: {
    id: 'runtime.chapter-2',
    version: '1.0.0',
    compatibility: { minGameVersion: '0.1.0' },
    dependencies: ['base'],
    scripts: [
      { id: 'chapter-2.opening', version: '1.0.0', assetName: 'scripts/opening.js' },
    ],
    scenes: [
      { id: 'chapter-2.scene', assetName: 'scripts/scene.js', exportName: 'createScene' },
    ],
    plugins: [
      { id: 'chapter-2.engine-plugin', kind: 'engine', assetName: 'plugins/engine.js' },
    ],
    storyGraphDeltas: [
      { id: 'chapter-2-graph', graphId: 'main', operation: 'upsert', nodes: [], edges: [] },
    ],
    storeMigrations: [
      { id: 'chapter-2-store', assetName: 'migrations/chapter-2.js' },
    ],
  },
})
```

Runtime package fields:

- `id`, `version`, optional `sequence`, `priority`, `compatibility`, `dependencies`.
- `localePack`: locale pack target metadata.
- `scripts`: script modules with `id`, `assetName`, optional `version`, `exportName`, `dependsOnBundles`, `variants`, `metadata`.
- `scenes`: runtime scene modules.
- `plugins`: engine/renderer/compiler plugin modules.
- `storyGraphDeltas`: graph delta records.
- `storeMigrations`: idempotent store/plugin migrations.
- `integrity` and `signature`: populated for trusted production packages.
- `metadata`: serializable package metadata.

Runtime rules:

- Production dynamic JS/plugin loading needs integrity/signature trust policy.
- Runtime store changes must be idempotent migrations, not arbitrary progress overwrites.
- Story points, projections, backlog, voice replay, saves, jumps, and graph deltas must preserve package provenance.
- Do not create loose single-asset dynamic update paths.

## QuaScript Integration

Use `quascript` when Quack should compile/read `.qs` story metadata:

```ts
export default defineConfig({
  source: './runtime/chapter-2',
  output: './dist/runtime.chapter-2.qpk',
  format: 'qpk',
  quascript: {
    projectRoot: process.cwd(),
    autoCollectDecorators: true,
    decoratorMappings: {},
  },
})
```

`autoCollectDecorators` and `decoratorMappings` must match QuaScript tooling semantics so CLI, Vite, language server, and Quack agree.

## Asset Targets

Use `assetTargets` to build platform or format variants:

```ts
export default defineConfig({
  source: './assets',
  output: './dist',
  format: 'qpk',
  assetTargets: [
    {
      name: 'web-modern',
      platform: 'web',
      suffix: 'web',
      browserCondition: 'image/webp',
      pipeline: {
        images: { format: 'webp', quality: 84, rewriteExtension: true },
        audio: { format: 'aac', bitrate: '160k', rewriteExtension: true },
        video: { format: 'webm', crf: 28, rewriteExtension: true },
      },
    },
    {
      name: 'cocos-mobile',
      platform: 'cocos',
      suffix: 'cocos',
      cocos: {
        mobile: true,
        buildPlatforms: ['android', 'ios'],
        hybrid: {
          enabled: true,
          resourceRoot: 'assets',
          assetBundle: 'remote',
          domains: { images: 'cocos-bundle', characters: 'cocos-bundle', audio: 'qpk', video: 'qpk', fonts: 'qpk' },
        },
      },
    },
  ],
})
```

Target fields include `name`, `platform`, `displayName`, `suffix`, `description`, `browserCondition`, `staticOnly`, `cocos`, `optional`, `pipeline`, `compression`, `compatibility`, and `encryption`.

Pipeline domains:

- `images` / `characters`: `source`, `png`, `jpeg`, `webp`, `avif`, `jxl`.
- `audio`: `source`, `mp3`, `ogg`, `opus`, `aac`, `m4a`, `flac`, `wav`.
- `video`: `source`, `mp4`, `webm`, `mov`, `mkv`.
- `fonts`: `source`, `woff2`, `woff`, `ttf`, `otf`.

## Plugins

Quack plugins extend asset collection, processing, and post-bundle steps:

```ts
import { QuackPlugin } from '@quajs/quack'

class MyPlugin extends QuackPlugin {
  name = 'my-plugin'
  version = '1.0.0'

  async processAsset(context) {
    context.metadata.processedBy = this.name
  }
}
```

Hooks:

- `initialize(config)`
- `collectAssets({ source, assets })`
- `processAsset({ asset, buffer, metadata })`
- `postBundle(bundlePath, manifest)`
- `cleanup()`

Built-in exports include `AssetPipelinePlugin`, `ImageOptimizationPlugin`, and `BundleAnalyzerPlugin`.

## CLI

Common commands:

```bash
quack bundle ./assets --output ./dist/game.qpk --format qpk
quack bundle ./runtime/chapter-2 -o ./dist/runtime.chapter-2.qpk -f qpk --sign-key ./keys/runtime-private.pem --sign-key-id release-2026-01
quack sign ./dist/runtime.chapter-2.qpk --key ./keys/runtime-private.pem --key-id release-2026-01
quack verify ./dist/runtime.chapter-2.qpk --public-key ./keys/runtime-public.pem --require-signature --key-id release-2026-01
quack workspace build
quack workspace build --bundle core
quack patch --from 1 --to 2
quack list ./dist/game.qpk
quack extract ./dist/game.qpk ./extracted
```

## Review Checklist

- Is this single-bundle, workspace, or runtime QPK mode?
- Does runtime-generated content ship as a Quack-built QPK Runtime Package?
- Are runtime scripts, scenes, plugins, graph deltas, migrations, dependencies, compatibility, integrity, and signature declared where needed?
- Do `quascript` options match compiler/editor decorator resolution?
- Are asset target pipelines explicit about formats and extension rewriting?
- Are Cocos hybrid/static assets described through target metadata instead of renderer-side loose caches?
- Are encryption and signing separate and appropriate for the environment?
- If a Quack config option, runtime manifest field, or bundler behavior changed, was this skill updated in the same change?
