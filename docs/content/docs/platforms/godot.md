---
title: "Godot 独立项目"
description: "从 QuaEngine 生成基于 Godot 4.7 API 的项目，复用剧情、QPK 与共享界面，了解版本和验证边界。"
order: 4
---

## 运行时结构

Godot 是独立的 `godot-core` 目标：由 Rust GDExtension 内置的 QuickJS 执行引擎和剧情 JavaScript，Godot 节点负责把共享场景投影画到屏幕上。运行时不需要 Node 服务、浏览器或 WebView，它和基于 JavaScriptCore + wgpu 的[Native 目标](/docs/platforms/native)分开构建。

`@quajs/renderer-scene` 和 `@quajs/scene-host` 提供 Cocos、Godot 与 Unity 共用的投影和宿主契约；`@quajs/renderer-godot` 是薄适配层，`@quajs/godot-host` 则具体实现 Godot 的资源读取、输入、媒体和持久化。故事状态依然归引擎和 store，玩家意图通过 pipeline 传回引擎。

## 先运行仓库 Demo

开始前请准备好 Godot **4.7**、Rust/Cargo 以及 C 编译器。GDExtension 基于 4.7 API 编译并声明最低要求 4.7；后续 4.x 小版本更新需要回归测试，目前不支持 Godot 5，详见[宿主版本与兼容性](/docs/platforms/compatibility)。如果需要转换视频，还要准备带 **libtheora/libvorbis** 的 FFmpeg（在 macOS 上可通过 Homebrew 安装 `ffmpeg-full`，Demo 构建脚本会自动优先选用它）。

在仓库根目录执行：

```sh
pnpm install
pnpm exec turbo run build --filter=demo^...
pnpm --dir demo build:godot
pnpm --dir demo run:godot
```

生成结果位于 `demo/dist/godot/workspace`，里面包含 `project.godot`、主场景、当前主机的 GDExtension 动态库、打包后的 JavaScript、QPK 资源包、Rust 源码以及 `target-bundle-manifest.json`。这个目录可以复制到仓库外独立运行（其中动态库对应本次构建主机的操作系统与 CPU 架构）。

如果要在 Godot 编辑器里打开项目：

```sh
pnpm --dir demo edit:godot
```

直接双击 `project.godot` 只会打开 Godot 编辑器，需要在编辑器里点「运行项目」才会启动游戏；`run:godot` 则直接启动游戏窗口。可以用 `GODOT_BIN` 环境变量覆盖默认的 Godot 可执行文件路径（macOS 默认查 `/Applications/Godot.app/Contents/MacOS/Godot`，Windows 和 Linux 默认从 `PATH` 查找 `godot`）。

## 接入自己的项目

把下面这段目标配置并入你现有的 `qua.project.yaml`，保留原有的项目身份、图标和其他平台配置。需要注意，配置中指定的业务入口、Vite 配置和 Quack 资源工作区必须实际存在，默认 Vue 脚手架不会自动为你生成 Godot 入口。

```yaml
targets:
  godot:
    enabled: true
    projectDir: dist/godot/workspace
    layout: landscape
    build:
      entry: src/targets/godot/main.ts
      viteConfig: vite.godot.config.ts
      profile: debug
    assetTarget:
      name: godot
      platform: godot
      staticOnly: true
      pipeline:
        video: { format: ogv, rewriteExtension: false }
```

`build.entry` 需要导出异步的 `bootstrap(services)` 函数。传入的 `services` 包含 `host`、`assets`、`adapter`、持久化 `store`、规范化后的 `project`、`layout`、静态包信任策略以及默认拒绝动态模块的 loader。工厂应返回初始化完成的 `engine` 和 `destroy()`，并可按需返回 `surfaceKeys`、`features`、`renderDialogue`、`renderChoices` 与 `characterBoxSize`，以便接入共享 QUI 或自定义投影。

具体写法可以参考 [Demo 目标入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/godot/main.ts)、[共享业务初始化](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/scene/main.ts)以及 [Vite 配置](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/vite.godot.config.ts)。Vite 在编译 QuaScript 和 QUI/QSS 时，应导入各个公开包的 `dist` 入口。

配置完成后，在你的游戏项目目录执行：

```sh
pnpm exec quack project build --target godot --all
godot --path dist/godot/workspace
```

只有 `godot-core-resolver` 负责注入 Godot 目标的启动代码，生成的启动壳统一读取 `target-bundle-manifest.json`；普通插件、共享 preset 和 QPK 不能再夹带 Web、Cocos、Unity 或 Native 的启动代码。共享的 `scene` 相关包属于中立投影层，可以直接在当前目标下复用。

生成器会先在暂存目录中准备 QPK、JavaScript、动态库与清单，全部成功后再替换带生成标记的输出目录；构建失败时会保留上一次的结果，并拒绝覆盖作者自己的源码目录。因为每次成功重建都会替换整个输出目录，建议把剧情、界面和资源改动都留在 QuaEngine 源工程里，改完重新生成即可。

## 嵌入已有 Godot 工程

如果要把剧情作为子模块放进已有的 Godot 游戏，请把生成的 addon、QPK/JS 和目标清单复制到父工程指定目录下，保留父工程原本的源码和 `ProjectSettings`（切勿把 `projectDir` 直接指向父工程）。接着把 `host.gd` 挂到父工程的某个 `Control` 区域，并在加入场景树前做好配置：

```gdscript
var module = preload("res://addons/quaengine/host.gd").new()
module.auto_start = false
module.standalone = false
module.content_root = "res://story-module/"
module.storage_namespace = "my-game/account-42"
module.size = Vector2(640, 360)
module.module_ready.connect(on_story_ready)
module.module_closed.connect(on_story_closed)
module.module_failed.connect(on_story_error)
add_child(module)
module.start_module()
# 退出或卸载前，先等待 module_closed 信号再销毁节点：
module.stop_module()
```

注意保持 addon 位于 `res://addons/quaengine`，并将 `qua/` 目录与目标清单放到 `content_root` 下面。嵌入模式下必须设置 `storage_namespace`，每个挂载控件会运行在独立的 QuickJS VM 中。宿主会自动适配父 `Control` 的尺寸并局限焦点到该区域内，音频也会走模块自己的独立总线；关闭模块既不会退出父工程，也不会篡改父工程的帧率或 Master 音量。至于节点隐藏时是否暂停后台运行，则由父工程自己决定。由于主线程停机采用延迟清理机制，调用 `stop_module()` 后请等待 `module_closed` 信号再移除父节点。

在仓库里执行 `pnpm --dir demo test:godot:embedding` 会在真实窗口中同时跑两个独立的 VM，检查父容器尺寸适配、存储隔离、关闭重启、兄弟模块互不干扰、作者节点保留以及父工程音频和帧率不变，结果记录在 `demo/.generated/godot-embedding-smoke`。

## 功能与限制

| 能力领域 | 当前实现情况 |
| --- | --- |
| 舞台与输入 | 固定比例逻辑舞台、黑边填充、逻辑坐标命中测试、键盘与指针输入 |
| 图片与文字 | PNG/WebP/JPEG、TTF/OTF 字体、CJK 行框修正、对白打字机效果 |
| 共享界面 | QUI/TSX、QSS、主菜单、设置、回看记录、章节选择、存读档与存档预览 |
| 音频 | WAV/MP3/Ogg Vorbis、多总线、增益、淡入淡出、循环、变速、暂停与 seek |
| 视频 | 读取 QPK 中的 Theora/Ogg；临时解码文件会在释放和退出时自动清理 |
| 图像效果 | 模糊、背景模糊、透明度/亮度遮罩、九宫格纹理与画面捕获 |
| 持久化与信任 | 按项目隔离的用户目录文件、带类型存档、事务回滚、静态 QPK 精确字节哈希校验 |

引擎和插件原有的 QuaScript 装饰器可以直接复用，不需要写 Godot 专属的剧本语法。界面和动画沿用逻辑舞台坐标，最后由宿主映射到屏幕窗口；渲染器只保存节点、媒体句柄和临时交互状态。

需要特别注意，Godot 目标目前 **仅支持构建时静态 QPK**，会明确拒绝动态 Runtime Package 和可执行脚本模块。另外，参数化音频 EQ、非 `normal` 混合模式、图片 `drop-shadow` 以及带样式的富文本 span 目前还未和 Web 完全拉齐，模糊采样与字体栅格化效果也可能和浏览器略有差异。

目前 macOS 已经作为首批平台完成了真机运行验证；Windows 与 Linux 虽然具备对应的宿主构建路径，但仍需要在目标系统上实测编译、窗口、输入、字体、媒体与存档恢复。如果要导出独立桌面安装包，还需要另外安装版本匹配的 Godot export templates 与导出预设，并自行处理签名与分发。

## 如何验证

生成当前 Godot 项目后，可以按顺序运行以下两条仓库验证脚本：

```sh
pnpm --dir demo test:godot:native
pnpm --dir demo test:godot:package
```

`test:godot:native` 会拉起真实的 Godot 渲染器，运行 QPK 里的确定性媒体夹具，检查音频 PCM 输出、视频推进/暂停/seek、字体度量、截图捕获和资源释放，报告写入 `demo/.generated/godot-native-smoke`。`test:godot:package` 则会把生成的工作区复制到仓库外部（不带编辑器缓存），检查目标隔离、无缓存启动以及篡改 QPK 后的拦截能力，使用独立临时存档目录并把结果记在 `demo/.generated/godot-package-smoke`。

准备交付作品前，建议仍在真实游戏窗口里完整走一遍：开始或继续阅读、分支选择、存档、退出重启后读档、修改设置、打开回看以及隐藏或恢复 UI。如果要和 Web 端对比画面表现，请确保两边跑的是同一份剧情、资源与窗口尺寸。

调试模式下，在 `profile: debug` 且显式传入启动参数 `-- --qua-review-dir=<绝对目录>` 时会开启有限的快照、捕获和输入调试能力；`release` 构建默认彻底禁用。更多宿主服务、性能指标与调试接口见 [Godot Host 参考](/docs/reference/godot-host) 与 [Godot 渲染适配器](/docs/reference/renderer-godot)。
