---
title: "项目当前进展"
description: "截至 2026 年 11 月 14 日的仓库能力快照，包含五大目标平台、模块导出与各自验证边界。"
order: 1
---

## 已有实现

| 领域 | 当前能力 |
| --- | --- |
| 叙事与状态 | 场景、对白、选择、角色、检查点、存读档、故事图与章节选择 |
| Web | 共用 DOM/WebAudio 运行时、逻辑舞台适配，以及 Vue、React、Svelte 适配器 |
| Cocos | 生成独立 Creator 3.8.8 工作区、共享 QUI、Web/macOS 构建、持久化与媒体投影；通用 Host 按可选能力降级 |
| Godot | Godot 4.7.x 独立项目、GDExtension/QuickJS、共享场景投影、QUI、媒体与持久化；仅支持构建时静态 QPK |
| Unity（初始适配） | Unity 6.3 LTS（6000.3.28f1）工程与 UPM 嵌入包、QuickJS VM、共享场景投影；待真实 Editor 与 Player 验收 |
| Native | Rust + JavaScriptCore + wgpu，支持 QUI/TSX、QSS、资源管理与目标构建链 |
| 嵌入模块导出 | `--embedded` 统一导出 Web、Godot、Creator、Unity 及 macOS Native C ABI 1 剧情子模块与业务协议 |
| 插件体系 | 背景、音频、动画、Sprite/UI skin、字体、回看、图库、成就、物品、设置、加载画面与嵌入会话 |
| 动态内容 | Runtime QPK 并列挂载、签名与哈希校验、脚本与插件激活、故事图增量、幂等迁移与受保护卸载（视宿主能力开放） |
| 创作工具链 | QuaScript 编译与 HMR、Quack 打包、Vite 集成、项目诊断与语言服务 |
| 独立编辑器 | Electron + Lit/SCSS 工作台、Monaco、停靠面板、角色/动画面板、Git、生产打包、插件市场、Web/Native 预览、Inspector 与性能/存储检查 |
| AI 写作辅助 | 编辑器内置 Novel Writer，支持项目上下文联动、分阶段审核与受保护的剧本草稿回写 |
| 文档站 | 基于 svedocs 0.2.4 构建，包含中英文入门与 Editor 手册、包参考、按语言搜索、机器可读文本及分享卡片 |

## 嵌入模块与 Unity 初始适配（2026-11-14）

现在可以通过 `quack project build --target <target> --embedded --all` 导出面向父工程的剧情子模块，配合 `@quajs/plugin-embedded` 接收外部参数、等待存档落盘并返回完成、取消或错误终态：

- Web（`qua-embedded` v1 + iframe SDK）、Godot（`module.tscn` + `open_story()`）与 Creator（`start()` + 作用域输入）均已在对应宿主跑通模块会话流程。
- Native 目标支持在 macOS 导出 C ABI 1 动态库和静态库，由父应用提供 `CAMetalLayer` 并驱动 `tick`/`poll`。
- Unity 新增了 6.3 LTS 桌面初始适配与本地 UPM 包（`com.quajs.unity-host`），共享 `@quajs/renderer-scene` 和 `@quajs/scene-runtime`；但目前构建环境尚未接入真实 Unity Editor，C# 编译、Play Mode、Player 及 IL2CPP 仍有待实测。详细兼容性声明见[宿主版本与兼容性](/docs/platforms/compatibility)与[模块导出指南](/docs/guides/exported-module)。

## Godot 接入

Quack 已经可以从同一份 Demo 源码直接生成独立的 Godot 4.7 项目。剧情 JS 在 Rust GDExtension 内的 QuickJS 中执行，Godot 节点通过共享 scene renderer 绘制 QUI/QSS、角色、对白、选择与媒体，运行时完全不依赖 Node 服务、WebView 或源码目录。配置和启动方式见[Godot 独立项目](/docs/platforms/godot)。

目前 macOS 已作为首批平台完成实测；Windows 与 Linux 的原生构建路径已经就绪，但还需要在对应系统上实际验证。仓库里的媒体夹具和独立打包测试能验证基础解码和篡改拒绝，不过不能代替全剧情流程测试和主观听音。Godot 目前仅支持构建时静态 QPK，且参数化音频 EQ、非 normal 混合、图片阴影与部分富文本样式和 Web 端仍有差异，详见 [Godot Host 参考](/docs/reference/godot-host)。

## Native 运行时变化

Rust/wgpu Native 端的常驻宿主和动态 QPK 执行已经全面迁至 JavaScriptCore，旧的 QuickJS 依赖和兼容别名已经清除（Godot 使用独立的 QuickJS 宿主，不受影响）。macOS 实测已经覆盖真实模块加载、异步执行、包卸载以及 Demo 完整流程，详见[迁移验证报告](/docs/reviews/native-jsc-migration-2026-09-21)。

需要注意，报告里的桥接基准数据只反映固定测试负载下的调用开销，不能直接推算实际游戏的帧率表现；Windows 交叉编译检查也不能替代真实的 Windows 可执行文件运行。

## Cocos 更新（2026-10-12）

Quack 会直接基于公开包的构建产物生成独立的 Creator 3.8.8 工作区，目前已经在本机完成了 Creator Web 预览与 macOS 应用运行验证。媒体夹具覆盖了音频增益、八段 EQ、变速播放、全屏静音 SDR H.264 视频和图片数值动画，存档和设置也做了真实重启恢复测试。接入方法见[Cocos 与 Creator 工作区](/docs/platforms/cocos)，具体差异见[媒体一致性](/docs/platforms/cocos-media)，审计记录见[集成审查](/docs/design/cocos-integration-audit)。

需要留意，三端对比的范围是生产 Web、Creator Web 与 Cocos macOS；目前 Demo 图库和成就目录为空，这部分解锁流程尚未覆盖。手机真机、非静音音画同步、HDR、骨骼/粒子系统以及系统级输入自动化测试仍待进一步验证。

## 后续方向

团队仍在持续完善各平台间的视觉与排版一致性、扩展更多脚手架模板（如 React/Svelte 开箱项目），并推进更多目标系统的实机验收和第三方插件生态建设；Demo 的故事剧本与演出效果也在不断打磨中。

目前各公开包版本仍为 `0.1.0`，API 尚在演进期。建议业务项目固定所有依赖版本，并在目标真机上完成阅读、分支与存档的完整回归。
