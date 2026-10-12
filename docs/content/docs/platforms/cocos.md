---
title: "Cocos 与 Creator 工作区"
description: "从真实 demo 生成独立 Creator 工作区，构建 Web/macOS，并接入共享剧情、QUI 与持久化。"
order: 2
---

## 从 demo 开始

当前验证基线是本机 **Creator 3.8.8、web-desktop 和 macOS**。安装 Creator；macOS 原生编译还需要 Xcode 与对应开发工具。仓库构建使用 Node 22.12+、pnpm 12.3.4，浏览器验收脚本使用本机 Google Chrome。手机真机、其他 Creator 版本和商店发布不在这轮验收范围。

在仓库根目录安装依赖并构建 demo 所需包的公开产物，再生成工作区：

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=demo^...
# 后面的三端对比需要带 QA 接口的生产 Web 构建
VITE_QUA_PARITY=1 pnpm --filter demo build
pnpm --filter demo build:cocos
```

输出在 `demo/dist/cocos/workspace`。在 Cocos Dashboard 导入这个目录，打开 `assets/main.scene`，等待资源导入完成，再点击播放按钮。游戏使用同一份 demo 剧情和共享 TSX/QSS 界面。

demo 的 Vite 配置显式使用 `emptyOutDir: false`，Web 重建会保留 `dist/cocos` 与 `dist/native`。更换剧情或资源后，仍应重建参与对比的各端，并核对报告中的构建身份。

工作区包含已编译 ESM、场景、启动组件、QPK、Creator 媒体、稳定 `.meta`、图标和平台构建配置。可以复制到仓库外独立打开；不需要安装 QuaEngine npm 包或运行 QuaEngine 开发服务器。修改游戏内容后，从源码项目重新生成。整个生成目录可被替换，不要在里面维护需要保留的手写代码。

## 项目配置

以下是 demo 的 Cocos 配置，可并入自己的 `qua.project.yaml`。业务入口、Vite 配置与资源工作区必须实际存在；它不是仅凭 YAML 就能运行的空项目模板。

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

在自己的 QuaEngine 项目目录运行 `pnpm exec quack project build --target cocos --all`。`project sync --target cocos` 只同步平台配置和图标，不会生成完整游戏。Cocos 工作区要求所有资源 bundle，不支持 `--bundle` 部分项目；Creator 平台构建是后续步骤，不使用 Quack 的 `--platform`。

生成器先在临时目录构建并验证，再替换上一份生成工作区。失败保留旧工作区；目标目录含手写 Creator 项目时会拒绝覆盖。成功重新生成会替换目录中的旧平台构建，因此生成一次后用 `--no-generate` 分别构建两端。

## 构建 Creator 发布产物

从仓库根目录执行：

```bash
node demo/scripts/cocos-build.mjs web-desktop --no-generate
node demo/scripts/cocos-build.mjs mac --no-generate
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
```

`pnpm --filter demo build:cocos:mac` 会先重新生成，再构建 macOS。`COCOS_CREATOR` 可指定 Creator 可执行文件；`QUA_COCOS_WORKSPACE` 可指定已复制到仓库外的工作区。macOS 的原生音频和视频产品随工作区静态编译，不修改本机 Creator SDK。

构建脚本为每个平台建立独立的临时导入副本，避免 Creator 3.8.8 复用导入数据库时出现资源类型错误；成功后发布 `build/<platform>`，失败保留上一份可用平台产物。日志默认在 `demo/dist/cocos/review/logs`，可通过 `QUA_COCOS_BUILD_LOGS` 指定。

手动构建复制到仓库外的工作区时，为每个平台使用一份新的原始工作区副本。在该副本目录运行：

```bash
export COCOS_CREATOR=/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/web-desktop.build.json;stage=build"
# 在另一份副本里构建 macOS
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/mac.build.json;stage=build"
"$COCOS_CREATOR" --project "$PWD" --build "configPath=$PWD/qua-build/mac.build.json;stage=make"
```

Creator 成功退出码为 **36**，自动化工具应显式处理；macOS 必须完成 `make` 并实际启动 `.app`。[Creator 命令行规范](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)说明了 `configPath`、构建阶段与退出码。退出码本身不能证明启动场景或资源已经正确打包。

## 业务入口与目标边界

`build.entry` 导出异步 `bootstrap(services)`。生成器的 `cocos-core-resolver` 注入宿主与平台服务，并根据返回值安装 Cocos 投影。业务入口复用平台无关的引擎初始化、剧情和 UI session，不再手写一份 target core 插件列表。

| 契约 | 当前生成器使用的字段 |
| --- | --- |
| 注入服务 | `host`、`assets`、`adapter`、`store`、`project`、`runtimeModuleLoader`、`trustPolicy`、`review` |
| 业务返回值 | `engine`、`features`、`surfaceKeys`、`characterBoxSize`、`renderDialogue`、`renderChoices`、`getDiagnostics`、`destroy`；debug 媒体检查可返回 `mediaReview` |

完整示例见 [demo 业务入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/cocos/main.ts)和 [Vite 编译配置](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/vite.cocos.config.ts)。当前生成器契约以此示例为准；包仍处于 `0.1.0`。

QuaEngine 依赖从包公开的 `dist` 入口编译；`cc` 由 Creator 提供。打包记录实际保留的模块图并输出 `target-bundle-manifest.json`，工作区生成器消费这份清单。运行产物不能包含 Web/native core、DOM、Node 或开发服务器依赖。

`@quajs/renderer-cocos/qui` 消费共享 UI 树与 feature surfaces。标题、HUD、菜单、章节、存读档、设置与记录共用 demo UI 定义。所有输入意图经过 pipeline，游戏状态由 engine/store/plugin 管理；节点、播放句柄、悬停和滚动位置仅是瞬时实现状态。布局使用 `1920×1080` 逻辑舞台，宿主最后映射到屏幕；黑边点击不能推进剧情。

## 资源与存储

hybrid 输出将图片、角色、音频、视频和字体导入 Creator，结构化内容与资源映射保留在 QPK。无损 PNG 保留图片数据；逻辑资源名、bundle 身份和 `contentPackageId` 等包来源贯穿加载，不使用指向仓库的资源链接。

QPK 使用 **`.binary` 的通用 `cc.Asset` 导入器**。不要改成 `.bin` 或限定为 `cc.BufferAsset`：前者供 CCON 使用，后者不匹配这里的通用资源类型。JSB 下资源可能只有 `nativeUrl`，由注入的 `fileUtils` 读取打包文件。

原生存档与设置写入 Creator 可写目录下的应用命名空间；预览使用独立 IndexedDB 字节文件库。浏览器来源和 QA profile 影响持久化身份。`@quajs/store-cocos` 只为事务修改的文件建立磁盘备份，支持异常回滚，尚不承诺进程崩溃或断电时的多文件原子性。

当前生成工作区使用 static-only 信任策略和不支持动态模块的 loader。资源投影保留 QPK 来源，但没有任意运行期 JS/renderer 插件导入能力。动态内容由引擎包生命周期管理，不能以单资源推送绕过该边界。

## 验证与常见问题

| 现象 | 检查方式 |
| --- | --- |
| CLI 返回 36，但启动失败或场景缺失 | 检查发布 main bundle 的场景；demo 脚本恢复稳定 `.meta`，短暂启动完整 Editor 等待导入、关闭自己启动的 Editor，再重试一次。只操作可再生成副本的缓存。 |
| Web/mac 构建互相影响 | 生成一次后按顺序构建，保留独立导入副本；工作区旁构建锁用于阻止冲突。残留锁先核对 `owner.json` 进程确已退出。 |
| QA 找不到 `__QUA_COCOS__` | 使用 `buildOptions.debug: true` 并启动最新应用；发布构建不注册 QA 接口。 |
| 视频有时钟却看不到画面 | 检查真实像素、透明 Canvas、容器层级、解码器和 HTTP Range；详见[媒体一致性](/docs/platforms/cocos-media)。 |
| 重启后存档或设置不见 | 检查 bundleId、可写目录、预览来源与 profile 是否一致，确认没有误用内存 Fake Host。 |

启动最新 macOS Debug 应用后，从仓库根目录运行：

```bash
pnpm --filter demo test:cocos
pnpm --filter demo test:cocos:mac
# 先退出手动启动的 macOS 应用，确保 6086 无其他应用占用
QUA_COCOS_NATIVE_APP=/absolute/path/CocosGame.app pnpm --filter demo test:cocos:lifecycle
# 生命周期检查结束后，重新启动最新应用供三端对比使用
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
pnpm --filter demo test:cocos:parity
pnpm --filter demo test:cocos:surfaces
```

生命周期脚本自行启动、退出和重启指定应用，要求启动前 6086 未被占用。原生检查默认连接本机 Debug 服务 `http://127.0.0.1:6086/json`，可用 `QUA_COCOS_NATIVE_DEBUG_URL` 覆盖。`test:cocos:parity` 默认遍历剧情分支；`--quick` 仅检查开场。面板对比复用固定来源 Web 46181、Creator 46182 及持久化 profile，使章节解锁和存档状态可比。

报告位于 `demo/dist/cocos/review`，含实际截图、投影、日志、布局误差与构建身份。这里的三端是 **生产 Web、Creator web-desktop、Cocos macOS**，不代表 QuaEngine 的 Rust/wgpu Native target。原生输入绑定与 GPU 读回也不等于操作系统鼠标键盘自动化。

剧情、选择与资源身份应一致，关键布局误差不超过 2 个逻辑单位；字体抗锯齿可不同，缺失效果、错误换行或遮挡需要修复。完整剧情基线和后续媒体构建 SHA 应分别记录。demo 图库、成就目录为空，不能据此认定解锁流程已验收。

继续阅读[媒体一致性](/docs/platforms/cocos-media)、[Cocos renderer 参考](/docs/reference/renderer-cocos)、[Creator Host 参考](/docs/reference/cocos-host)、[存储参考](/docs/reference/store-cocos)和[集成审查记录](/docs/design/cocos-integration-audit)。Fake Host 测试与 GitHub CI 验证投影和构建契约，实际 Creator 窗口、媒体与持久化仍需要本机运行验收。
