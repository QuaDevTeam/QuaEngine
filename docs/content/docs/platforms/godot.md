---
title: "Godot 独立项目"
description: "从 QuaEngine 生成 Godot 4.7+ 项目，复用剧情、QPK 与共享界面，了解构建和验证边界。"
order: 4
---

## 运行时结构

Godot 是独立的 `godot-core` 目标：Rust GDExtension 内的 QuickJS 执行引擎与剧情 JavaScript，Godot 节点呈现共享场景投影。运行游戏不需要 Node 服务、浏览器或 WebView。它与使用 JavaScriptCore + wgpu 的 [Native 目标](/docs/platforms/native)分别构建。

`@quajs/renderer-scene` 和 `@quajs/scene-host` 提供 Cocos/Godot 共用的投影与宿主契约；`@quajs/renderer-godot` 是薄适配器，`@quajs/godot-host` 实现 Godot 资源、输入、媒体与持久化。引擎和 store 持有游戏状态，玩家意图通过 pipeline 返回引擎。

## 先运行仓库 demo

准备 Godot **4.7+**、Rust/Cargo 与 C 编译器。视频转换需要包含 **libtheora/libvorbis** 的 FFmpeg；macOS 可安装 `ffmpeg-full`，demo 构建脚本会优先使用已安装的 Homebrew 完整版本。

从仓库根目录执行：

```sh
pnpm install
pnpm exec turbo run build --filter=demo^...
pnpm --dir demo build:godot
pnpm --dir demo run:godot
```

输出位于 `demo/dist/godot/workspace`，包含 `project.godot`、主场景、本机 GDExtension、打包后的 JavaScript、QPK、Rust 源码和 `target-bundle-manifest.json`。目录可以复制到仓库外运行；本次生成的动态库对应当前操作系统与架构。

打开编辑器使用：

```sh
pnpm --dir demo edit:godot
```

双击 `project.godot` 会打开编辑器；在编辑器中点击“运行项目”才能启动游戏。`run:godot` 直接启动游戏。`GODOT_BIN` 可覆盖可执行文件；macOS 默认路径为 `/Applications/Godot.app/Contents/MacOS/Godot`，Windows/Linux 默认从 PATH 查找 `godot`。

## 接入自己的项目

将下面的目标块并入已有的 `qua.project.yaml`，保留项目身份、图标和其他目标配置。业务入口、Vite 配置与 Quack 资源工作区需要实际存在；默认 Vue 脚手架不会自动生成 Godot 入口。

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

`build.entry` 导出异步 `bootstrap(services)`。服务包含 `host`、`assets`、`adapter`、持久化 `store`、规范化的 `project`、`layout`、静态包信任策略与拒绝动态模块的 loader。入口返回已初始化的 `engine` 和 `destroy()`；可选 `surfaceKeys`、`features`、`renderDialogue`、`renderChoices`、`characterBoxSize` 用于共享 QUI 或自定义投影。

参考 [demo 目标入口](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/godot/main.ts)、[共享业务初始化](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/src/targets/scene/main.ts)与 [Vite 配置](https://github.com/QuaDevTeam/QuaEngine/blob/main/demo/vite.godot.config.ts)。Vite 编译 QuaScript 和 QUI/QSS，使用包的公开 `dist` 入口。

在自己的游戏项目目录执行：

```sh
pnpm exec quack project build --target godot --all
godot --path dist/godot/workspace
```

只有 `godot-core-resolver` 注入目标启动代码，生成壳消费目标清单。普通插件、共享 preset 与 QPK 不得另加 Web/Cocos/Native 启动适配器。共享的 scene 包属于中立投影层，可以被当前目标使用。

生成器先暂存 QPK、JavaScript、动态库和清单，成功后才替换其标记的输出目录；失败保留上一份项目，并拒绝覆盖作者源码目录。成功重建会替换整个输出目录，应在 QuaEngine 源项目修改剧情、界面与资源，再重新生成。

## 功能与限制

| 能力 | 当前实现 |
| --- | --- |
| 舞台与输入 | 固定比例逻辑舞台、留黑边、逻辑坐标命中测试、键盘与指针 |
| 图片与文字 | PNG/WebP/JPEG、TTF/OTF、CJK 行框修正、对白打字机 |
| 共享界面 | QUI/TSX、QSS、菜单、设置、记录、章节、存读档与存档预览 |
| 音频 | WAV/MP3/Ogg Vorbis、总线、增益、淡入淡出、循环、变速、暂停与 seek |
| 视频 | QPK 中的 Theora/Ogg；临时解码文件在释放和退出时清理 |
| 图像效果 | 模糊、背景模糊、透明度/亮度遮罩、九宫格纹理与画面捕获 |
| 持久化与信任 | 项目独立用户文件、带类型的存档、事务回滚、静态 QPK 精确字节 hash 校验 |

现有引擎与插件的 QuaScript 装饰器可以复用，无需 Godot 专属剧情语法。界面与动画沿用逻辑舞台坐标，由宿主最后映射到窗口；渲染器只保存节点、媒体句柄和临时交互资源。

当前 **仅支持构建时静态 QPK**，明确拒绝动态 Runtime Package 和可执行模块。参数化音频 EQ、非 normal 混合模式、图片 drop-shadow 与带样式的富文本 span 尚未完整对齐 Web；模糊采样和字体栅格化也不保证与浏览器逐像素相同。

macOS 是首批运行验证平台。Windows/Linux 已有对应宿主构建路径，需要在对应系统编译并验证窗口、输入、字体、媒体和保存恢复。导出桌面应用还需匹配版本的 Godot export templates、导出预设及对应平台的发布准备；生成项目不等于已经完成应用签名或分发。

## 如何验证

先生成当前项目，再按顺序运行：

```sh
pnpm --dir demo test:godot:native
pnpm --dir demo test:godot:package
```

`test:godot:native` 用真实 Godot 运行 QPK 内的确定性媒体夹具，检查音频 PCM、视频推进/暂停/seek、字体度量、捕获与资源清理；报告在 `demo/.generated/godot-native-smoke`。`test:godot:package` 在仓库外复制工作区，检查目标隔离、无编辑器缓存启动与 QPK 篡改拒绝；报告在 `demo/.generated/godot-package-smoke`，使用独立临时存档目录。

另在真实游戏窗口检查开始/继续、选择、存档、退出重启读档、设置、记录和隐藏/恢复 UI；与 Web 对比时使用同一剧情、资源和窗口尺寸。夹具、无界面启动和 CI 契约测试分别验证不同范围，不能代替全剧情或主观听音验收。

调试审阅需同时启用 `profile: debug` 和显式启动参数 `-- --qua-review-dir=<绝对目录>`，只提供有限的快照、捕获与输入能力；release 不启用该入口。更多服务、性能检查和调试说明见 [Godot Host 参考](/docs/reference/godot-host)与 [Godot renderer](/docs/reference/renderer-godot)。
