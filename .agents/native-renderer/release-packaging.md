# Native 打包、加固与分发方案

## 目标

native 发行链路首先覆盖 macOS 和 Windows，其次覆盖 Linux。发行产物要能证明三件事：

- 只包含 native target core，不混入 Web / Cocos core。
- app identity、版本、图标、profile、platform、native runtime / renderer 版本都可追溯。
- debug、release、不同版本和不同平台的产物物理隔离，release 产物不可被后续构建覆盖。

## Web / Cocos / Native 打包隔离

Web、Cocos、Native 项目打包必须是三条互斥 artifact plan。核心插件只能由当前目标 resolver 注入一次：Web 只走 `web-core-resolver`，Cocos 只走 `cocos-core-resolver`，Native 只走 `native-core-resolver`。

多目标批量构建只能循环创建三个独立 plan，不能先构造 `[webCore, cocosCore, nativeCore]`、`allRendererEntries`、跨目标 startup shell 或 umbrella preset 后再按 target 过滤。即使最终 `target-bundle-manifest.json` 看起来只剩一个目标，只要中间 project graph、template graph、installer/updater graph 或 Runtime QPK resolver 曾经 materialize 过其他目标 core，就按 release blocker 失败。

project template、startup shell、debug/release shell、installer、updater、smoke runner 和 Runtime QPK 都不是 core plugin 注入点。它们只能读取当前目标已经验证过的 `target-bundle-manifest.json`；重新声明 active core 也必须失败，因为这会绕过唯一 resolver 和 manifest 校验。

release promotion 前需要对 Web、Cocos、Native 三端对称执行 target-core isolation：

- Web 产物不得包含 Cocos host / renderer、Native engine/assets/store/runtime/renderer。
- Cocos 产物不得包含 Web renderer/framework adapter、Native engine/assets/store/runtime/renderer。
- Native 产物不得包含 Web assets/renderer/framework adapter、Cocos host / renderer。
- Runtime QPK 可以声明多目标 compatibility metadata，但不得携带任一 target core executable dependency、renderer entry 或 generated resolver。

三套核心插件族的归属必须固定到 artifact plan：

- Web project 只能选择 Web core family：Web bootstrap、Web assets/store/runtime adapter、`@quajs/renderer-web`、Web framework adapter 和 Web renderer plugin subentry。
- Cocos project 只能选择 Cocos core family：Cocos bootstrap、Cocos host / asset / store bridge、`@quajs/renderer-cocos` 和 Cocos renderer plugin subentry。
- Native project 只能选择 Native core family：`@quajs/engine-native`、`@quajs/assets-native`、`@quajs/store-native`、必要的 native contracts metadata，以及 Rust native app/runtime/renderer capability metadata。

普通 game plugin、shared preset、第三方 shared entry、Runtime QPK、project template、startup shell、debug/release shell、installer、updater 和 smoke runner 都不是核心插件装配点。它们只能读取对应 artifact plan 已验证的 manifest；重新声明当前 active core 或把其他目标 core 带进来再过滤，都是 release blocker。

## 产物目录

推荐所有 native 产物从 `packages/native` 的 artifact plan 输出，最终落在 project `dist` 下：

```text
dist/native/
  debug/<version>-<buildNumber>/<platform>/<arch>/
  release/<version>-<buildNumber>/<platform>/<arch>/
```

`versionSegment = <version>-<buildNumber>` 必须由 project manifest / native artifact plan 生成，签名、加固、更新通道、installer、符号文件和 smoke report 都使用同一个 segment。release 目录如果已存在且 manifest 指向不同 commit、bundleId、native runtime version、renderer version 或 capability hash，构建必须失败；debug 目录可以重建，但仍必须重新校验 target isolation。

## App Identity

每个 native 产物必须写入并复验：

- `app.name`
- `app.bundleId` / Windows `appId`
- `app.version`
- `app.buildNumber`
- `app.icon`
- `profile`: `debug` 或 `release`
- `platform`: `macos` / `windows` / `linux`
- `arch`
- `targetCoreResolver: native-core-resolver`
- `selectedCorePluginFamily: native-core`
- `nativeRenderer.packageName`
- `nativeRenderer.version`
- `nativeRenderer.backend`
- `nativeRenderer.capabilityIds`
- `nativeRenderer.capabilityManifestHash`
- `nativeRuntime.quickjsVersion`
- `nativeRuntime.nativeRuntimeVersion`
- `nativeRuntime.assetAdapterVersion`
- `nativeRuntime.storeAdapterVersion`

`@quajs/engine-native` 启动时必须把 target-bundle manifest 中的四个 native runtime version 字段与 Rust `QuaNativeHostInfo.runtime` 逐项比较。任一字段不一致，native host plugin 不得进入 initialized 状态，QuickJS runtime module loader 也不得开始评估动态包 JS。

## 图标

图标源建议由 project manifest 指向一份高分辨率 PNG 或 SVG。打包器生成平台产物：

- macOS: `.icns`，同时写入 `.app/Contents/Info.plist`。
- Windows: `.ico`，写入 executable resource 和 installer metadata。
- Linux: PNG 多尺寸，写入 `.desktop` entry、AppImage / deb / rpm metadata。

图标属于 release identity 的一部分。release manifest 必须记录源图标 hash、生成产物 hash 和目标路径；不同版本 release 不共享可变图标路径。

## 平台矩阵

| 平台 | 第一目标产物 | 发行要点 |
| --- | --- | --- |
| macOS | `.app`、`.dmg`、`.zip` | `Info.plist`、`CFBundleIdentifier`、`CFBundleShortVersionString`、`CFBundleVersion`、`icns`、codesign、hardened runtime、notarization、staple |
| Windows | `.exe`、`.zip`、installer | app id、publisher、`ico`、Authenticode signing、installer manifest、uninstaller identity、SmartScreen 友好版本信息 |
| Linux | AppImage、`.deb`、`.rpm` | desktop entry、icon sizes、AppStream metadata、runtime dependency declaration、optional signing / checksum |

macOS / Windows 是 P0；Linux 是 P1，但 Linux manifest/schema 不能缺失，避免将来补 Linux 时破坏 artifact layout 或 target isolation。

## 加固与安全

release 构建必须启用：

- QPK hash / signature verification。
- native dynamic package content-only guard。
- QuickJS memory limit、stack limit、interrupt / execution budget。
- Rust host API 最小化，不暴露任意 filesystem、shell、network、dynamic library load、FFI callback。
- macOS hardened runtime / notarization。
- Windows code signing。
- release manifest immutability。
- installer / updater 只读取已验证的 active target manifest，不能重新声明 native core。

动态小包只允许 QS / JS runtime modules 和资源。禁止 `.dylib`、`.so`、`.dll`、`.framework`、`.node`、WASI/native executable、平台 plugin binary、native payload manifest 字段和任何 `nativeCode: true`。这条规则在 Quack 打包、RuntimeContentManager 激活和 `@quajs/engine-native` trust policy 三层重复执行。

## Debug / Release 隔离

debug 和 release 的差异只体现在诊断、符号、source map、日志级别和签名策略，不体现在 target-core isolation 或 dynamic package guard 上。

- debug 可以重建同一 `versionSegment`，但必须覆盖写入新的 debug manifest。
- release 同一 `versionSegment/platform/arch` 一旦存在，默认不可覆盖。
- release 和 debug 不共享 native store root、cache root、profile root。
- release smoke 必须使用 release manifest；debug smoke 必须使用 debug manifest。
- crash symbol、benchmark report、smoke JSON、target-bundle manifest 分别写入当前 profile/version/platform 目录。

## Updater / Installer

installer 和 updater 不是 core plugin 注入点。它们只能消费：

- 已验证 `target-bundle-manifest.json`
- release manifest
- platform package metadata
- QPK package index / update channel metadata

updater 不允许下发 native code 动态小包。native app binary 更新可以作为完整 signed app update 处理；Runtime QPK update 仍然只允许 QS / JS / resources，并且必须经过 signature、native compatibility、target-core isolation 和 native-code payload guard。

## 验收

打包验收至少覆盖：

- macOS / Windows debug artifact 生成并通过 `validateTargetBundleManifest({ expectedTarget: "native" })`。
- macOS / Windows release artifact 生成后 release manifest 记录 bundleId、version、buildNumber、icon hash、native runtime versions、native renderer capability hash。
- 同一 release version 二次写入不同 manifest 必须失败。
- debug / release storage root、cache root、manifest path、smoke report path 不同。
- installer / updater `projectGraphs` 只包含平台无关依赖，不能二次声明 native core。
- Web / Cocos / Native 三端批量打包拆成三个独立 artifact plan，不能先构造 core union 再过滤。
- Runtime QPK update 含 native payload 时，在 Quack 和 runtime activation 两层失败。
