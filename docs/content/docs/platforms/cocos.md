---
title: "Cocos 与 Creator 工作区"
description: "从真实 demo 生成独立 Creator 工作区，构建 Web/macOS，并接入共享剧情、QUI 与持久化。"
order: 2
---

## 嵌入已有 Creator 工程

当前生成器只声明支持 **Creator 3.8.8**，产物里附带 `qua-host-compatibility.json`。升级 Creator 版本时，必须同步验证引擎 profile、资源导入器、原生媒体产品与实际 SDK 行为，不能只改配置文件里的版本号。

父工程接入生成的资源和 runtime 时，保留自己原有的场景、Canvas 和 Camera。在有明确宽高的父节点下挂载生成的 runtime 嵌入入口，并由父工程实现输入与尺寸订阅：

```ts
const session = await start(regionNode, {
  embedded: true,
  storageNamespace: 'my-game/account-42',
  input: { onInput: listener => parentInput.subscribe(listener) },
  layout: {
    getContainerSize: () => ({ width: 640, height: 360 }),
    onLayoutChange: listener => parentLayout.subscribe(listener),
  },
  onClose: () => returnToHost(),
})
// 导航离开时：
await session.destroy()
```

嵌入模式必须传入输入和父容器尺寸 bridge。输入坐标是以容器左上角为原点、向下为正的局部坐标（尚未除以逻辑舞台缩放）；父工程负责焦点切换、手柄归属以及窗口失焦时的 blur 处理。退出剧情时会先销毁 renderer、应用实例和资源，再调用 `onClose`，而不会执行 `cc.game.end()`，确保父节点和主应用继续正常运作。`session.engine` 暴露逻辑层 API，宿主交互依然要走 engine 和 pipeline，不要绕过它们直接改 renderer 状态。

需要注意的是，Cocos 模式下剧情与父工程共用同一个 JS 运行域，因此一个运行域内按一个活跃剧情引擎来集成，需要彻底销毁后再串行重建，不要试图通过多挂几个节点来绕过单例限制。生成目录也是可随时替换的输出物，不要覆盖作者自己的工程目录；至于媒体和原生扩展在父工程里的表现，仍需在对应 SDK 上实测。

本机运行 `pnpm --dir demo test:cocos:embedding` 会用真实的 Creator 3.8.8 构建 Web 产物，验证子容器显示、退出后父应用继续运行、作者节点完好、串行重建以及输入订阅释放，报告和截图输出在 `demo/.generated/cocos-embedding-smoke`（该测试不覆盖原生嵌入、移动端或操作系统级输入自动化）。

## 从 Demo 开始

目前的实测基线是本机 **Creator 3.8.8（web-desktop 与 macOS）**。运行前请先装好 Creator；如果需要构建 macOS 原生应用，另需 Xcode 与对应开发工具。仓库构建使用 Node 22.12+、pnpm 12.3.4，浏览器验收脚本使用本机 Google Chrome。手机真机、其他 Creator 版本与商店上架流程不在当前基线范围内。

在仓库根目录安装依赖并先构建 Demo 所需的公开包产物，再生成 Creator 工作区：

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=demo^...
# 如果要做后面的三端对比，需要带 QA 接口的生产 Web 构建
VITE_QUA_PARITY=1 pnpm --filter demo build
pnpm --filter demo build:cocos
```

生成结果位于 `demo/dist/cocos/workspace`。在 Cocos Dashboard 中导入这个目录，打开 `assets/main.scene`，等资源导入完成后点击播放按钮即可运行。它会复用同一份 Demo 剧情以及共享的 TSX/QSS 界面。

`demo` 的 Vite 配置显式设置了 `emptyOutDir: false`，因此重新构建 Web 端时会保留 `dist/cocos` 和 `dist/native`。不过只要改动了剧情或资源，参与对比的各端还是都要重新构建一遍，并核对报告里的构建身份。

工作区里包含了已编译的 ESM、场景、启动组件、QPK 资源、Creator 媒体、稳定的 `.meta` 文件、图标和平台构建配置，可以直接拷贝到仓库外部独立打开，不需要再安装 QuaEngine npm 包或启动开发服务器。如果后续修改了游戏内容，回到源码工程重新生成即可——整个生成目录随时可被替换，不要在里面维护手写代码。

## 项目配置

下面是 Demo 使用的 Cocos 配置，你可以并入自己项目的 `qua.project.yaml`。需要注意，配置里引用的业务入口、Vite 配置和资源工作区必须实际存在：

```yaml
targets:
  cocos:
    enabled: true
    creatorVersion: 3.8.8
    projectDir: dist/cocos/workspace
    layout: landscape
    platforms: [web-desktop, mac]
    build:
      entry: src/targets/cocos/main.ts
      viteConfig: vite.cocos.config.ts
      macOSDeploymentTarget: '12.0'
    assetTarget:
      name: cocos-demo
      platform: cocos
      staticOnly: true
      pipeline:
        images: { format: png, rewriteExtension: false, optimize: false }
        characters: { format: png, rewriteExtension: false, optimize: false }
      cocos:
        staticOnly: true
        hybrid:
          enabled: true
          resourceRoot: assets
          assetBundle: resources
          domains:
            images: cocos-bundle
            characters: cocos-bundle
            audio: cocos-bundle
            video: cocos-bundle
            fonts: cocos-bundle
    buildOptions:
      debug: true
```

在自己的 QuaEngine 项目目录执行 `pnpm exec quack project build --target cocos --all` 即可生成工作区。注意 `project sync --target cocos` 只会同步平台配置和图标，不会生成完整工程；Cocos 工作区要求打包所有资源，不支持 `--bundle` 只打部分包，而后续的 Creator 平台构建也不使用 Quack 的 `--platform` 参数。

生成器会先在临时目录里构建并校验，确认无误后再替换上一次的生成目录：构建失败时保留旧工作区，如果目标目录里发现手写的 Creator 工程也会拒绝覆盖。由于重新生成会覆盖整个输出目录（包括里面原有的平台构建结果），所以生成一次工作区后，建议加上 `--no-generate` 来分别构建不同平台。

## 构建 Creator 发布产物

在仓库根目录执行：

```bash
node demo/scripts/cocos-build.mjs web-desktop --no-generate
node demo/scripts/cocos-build.mjs mac --no-generate
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
```

执行 `pnpm --filter demo build:cocos:mac` 则会先重新生成工作区，再构建 macOS 应用。可以通过 `COCOS_CREATOR` 指定 Creator 可执行文件路径，用 `QUA_COCOS_WORKSPACE` 指定复制到仓库外的工作区。macOS 的原生音频和视频扩展会随工作区静态编译，不会改动本机安装的 Creator SDK。

构建脚本会为每个平台复制一份独立的临时导入副本，避免 Creator 3.8.8 复用同一个导入数据库时把资源类型识别出错；构建成功后发布到 `build/<platform>`，失败时保留上一次可用的产物。构建日志默认写在 `demo/dist/cocos/review/logs`，也可以通过 `QUA_COCOS_BUILD_LOGS` 修改路径。

如果要手动构建已经拷贝到仓库外的工作区，同样请为每个平台准备一份干净的原始工作区副本，然后在副本目录中运行：

```bash
export COCOS_CREATOR=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/web-desktop.build.json;stage=build"
# 在另一份独立副本里构建 macOS
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/mac.build.json;stage=build"
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/mac.build.json;stage=make"
```

Creator CLI 成功时的退出码是 **36**，自动化脚本需要显式兼容；macOS 必须跑完 `stage=make` 并实际打开 `.app` 检验。关于 `configPath`、构建阶段和退出码的完整定义，可参考 [Creator 命令行发布文档](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)。退出码为 36 只代表构建命令结束，上线前还是得进启动场景实测。

## 业务入口与目标边界

`build.entry` 需要导出异步的 `bootstrap(services)` 函数。生成器的 `cocos-core-resolver` 会负责注入宿主与平台服务，并根据返回值接入 Cocos 投影；业务入口只需要复用平台无关的引擎初始化、剧情流程和 UI 会话，不必自己再去手写一份目标核心列表。

| 契约部分 | 生成器使用的字段 |
| --- | --- |
| 注入服务 | `host`、`assets`、`adapter`、`store`、`project`、`runtimeModuleLoader`、`trustPolicy`、`review` |
| 业务返回值 | `engine`、`features`、`surfaceKeys`、`characterBoxSize`、`renderDialogue`、`renderChoices`、`getDiagnostics`、`destroy`；开启 debug 媒体检查时可返回 `mediaReview` |

完整实现可以参考 [Demo 业务入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/cocos/main.ts) 和 [Vite 编译配置](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/vite.cocos.config.ts)（当前相关包处于 `0.1.0` 阶段）。

打包时 QuaEngine 依赖从公开的 `dist` 入口导入，`cc` 模块保持 external 由 Creator 提供。打包工具会记录最终保留下来的模块图并输出 `target-bundle-manifest.json`，确认产物里没有混入 Web/Godot/Native 核心、DOM、Node 或开发服务器依赖。

`@quajs/renderer-cocos/qui` 负责把共享 UI 树和 feature surfaces 投影到 Creator 节点上，标题画面、HUD、菜单、章节选择、存读档、设置与回看都共用 Demo 的 UI 定义。所有的操作意图仍走 pipeline，状态保存在 engine、store 和插件里，节点、播放句柄、悬停态与滚动位置仅作为渲染器内的临时状态。画面基于 `1920 × 1080` 逻辑舞台定位再映射到屏幕，点击四周黑边不会误触发剧情推进。

## 资源与存储

Hybrid 构建模式会把图片、立绘、音频、视频和字体导入 Creator 资源系统，而结构化数据和资源映射依然留在 QPK 中。图片保留无损 PNG；逻辑资源名、bundle 身份以及 `contentPackageId` 等包来源会贯穿整个加载过程，不会留下指向原仓库的硬编码路径。

QPK 文件使用 **`.binary` 扩展名配合通用 `cc.Asset` 导入器**。请不要改成 `.bin` 或限定为 `cc.BufferAsset`（前者是 Creator CCON 专用，后者与这里的通用资产类型不匹配）。在原生 JSB 环境下，资源可能只提供 `nativeUrl`，此时会由注入的 `fileUtils` 读取打包好的文件。

原生应用下的存档与设置会写入 Creator 可写目录下的应用命名空间；Web 预览则使用独立的 IndexedDB 字节库（浏览器来源与 QA profile 会影响持久化隔离键）。`@quajs/store-cocos` 只对当前事务修改到的文件在磁盘上建立备份，支持异常时回滚，但目前不承诺进程崩溃或断电时的跨文件强原子性。

当前生成的 Creator 工作区采用 `staticOnly` 信任策略，且不提供运行期动态模块加载。资源投影虽然保留了 QPK 来源标记，但不支持在运行时动态导入任意 JS 或渲染器插件。

## 验证与常见问题

| 常见现象 | 排查方式 |
| --- | --- |
| CLI 返回 36，但启动失败或缺少场景 | 检查主 bundle 里是否包含启动场景；Demo 脚本会自动恢复稳定的 `.meta`，必要时短暂打开一次完整 Creator 等待导入、关闭后再重试（只针对可再生的副本缓存）。 |
| Web 与 macOS 构建互相干扰 | 生成一次工作区后按顺序构建，并为每个平台使用独立导入副本；工作区旁的构建锁会阻止并发冲突，若遇残留锁先核对 `owner.json` 里的进程确实已退出。 |
| QA 脚本找不到 `__QUA_COCOS__` | 确认 `buildOptions.debug` 为 `true` 并启动最新构建的应用；Release 包不会注册 QA 调试接口。 |
| 视频有进度在走但画面黑屏 | 检查实际像素、透明 Canvas、容器层级、解码器以及本地服务器是否支持 HTTP Range；详见[媒体一致性](/docs/platforms/cocos-media)。 |
| 重启应用后存档或设置丢失 | 核对 `bundleId`、可写目录、预览来源与 QA profile 是否前后一致，同时确认没有误用内存 Fake Host。 |

启动最新构建的 macOS Debug 应用后，可以在仓库根目录运行以下检查：

```bash
pnpm --filter demo test:cocos
pnpm --filter demo test:cocos:mac
# 运行生命周期检查前先退出手动打开的 macOS 应用，确保 6086 端口空闲
QUA_COCOS_NATIVE_APP=/absolute/path/CocosGame.app pnpm --filter demo test:cocos:lifecycle
# 生命周期检查结束后，重新打开最新应用供三端对比使用
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
pnpm --filter demo test:cocos:parity
pnpm --filter demo test:cocos:surfaces
```

生命周期测试脚本会自动接管应用的启动、退出与重启，因此运行前需要确保 6086 端口未被占用。原生调试服务默认连 `http://127.0.0.1:6086/json`，也可以通过 `QUA_COCOS_NATIVE_DEBUG_URL` 指定。`test:cocos:parity` 默认会遍历剧情分支，加上 `--quick` 只跑开场；面板对比会固定使用 Web 46181、Creator 46182 端口以及一致的持久化 profile，以便直接比较章节解锁和存档状态。

检查报告生成在 `demo/dist/cocos/review`，里面包含实际截图、投影数据、日志、布局误差和构建身份。这里的三端指 **生产 Web、Creator web-desktop 和 Cocos macOS**，不包含 Rust/wgpu Native 目标；另外原生输入绑定与 GPU 读回也不等同于操作系统级鼠标键盘自动化测试。

三端对比时剧情、选项和资源身份应当一致，关键布局误差控制在 2 个逻辑单位以内。字体抗锯齿允许有平台差异，但如果出现效果缺失、错误换行或画面遮挡则需要修复；由于目前 Demo 里的图库和成就目录为空，这部分解锁流程还没有实测覆盖。

延伸阅读：[Cocos 媒体一致性](/docs/platforms/cocos-media)、[Cocos renderer 参考](/docs/reference/renderer-cocos)、[Creator Host 参考](/docs/reference/cocos-host)、[Cocos 存档持久化](/docs/reference/store-cocos) 与 [Cocos 集成审查](/docs/design/cocos-integration-audit)。Fake Host 测试和 GitHub CI 主要验证投影契约与构建输出，实际的 Creator 窗口表现、媒体播放与存档持久化仍需在本机跑通。
