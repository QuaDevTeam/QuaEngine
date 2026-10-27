---
title: "项目当前进展"
description: "截至 2026 年 10 月 27 日的仓库能力快照，包含 Godot 接入，区分实现、测试和平台验收。"
order: 1
---

## 已有实现

| 领域 | 当前能力 |
| --- | --- |
| 叙事与状态 | 场景、对白、选择、角色、检查点、存读档、故事图与章节选择 |
| Web | 共用 DOM/WebAudio 运行时、舞台适配、Vue/React/Svelte 适配器 |
| Cocos | 可独立生成 Creator 3.8.8 工作区、共享 QUI、Web/macOS 构建、持久化与媒体投影；通用 Host 可选能力降级 |
| Godot | Godot 4.7+ 独立项目、GDExtension/QuickJS、Cocos/Godot 共享场景投影、QUI、媒体与持久化；仅静态 QPK |
| Native | Rust + JavaScriptCore + wgpu，QUI/TSX、QSS、资源与目标构建链 |
| 插件 | 背景、音频、动画、Sprite/UI skin、字体、回看、图库、成就、物品、设置、加载画面 |
| 动态内容 | QPK 并列挂载、信任校验、脚本/插件、图增量、幂等迁移和依赖卸载；取决于目标能力，Godot 暂不支持动态包 |
| 作者工具 | QuaScript 编译与 HMR、Quack、Vite、项目检查与语言服务 |
| 独立编辑器 | Electron + Lit/SCSS 工作台、Monaco、停靠面板、角色、动画、Git、打包、插件市场、Web/Native 预览、Inspector 与性能/存储检查 |
| AI 写作 | 编辑器内置 Novel Writer、项目上下文、阶段审核与受保护的剧本草稿应用 |
| 文档 | svedocs 0.2.4、中英文入门页、包参考、按语言搜索、机器可读文档与逐页分享图 |

## Godot 接入

Quack 已可从同一份 demo 源码生成独立 Godot 项目。QuickJS 在 Rust GDExtension 中执行剧情，Godot 通过共享 scene renderer 呈现 QUI/QSS、角色、对白、选择与媒体；游戏运行不依赖 Node、WebView 或源码目录。构建、运行、编辑器入口与配置见[Godot 指南](/docs/platforms/godot)。

macOS 是首批运行验证平台，Windows/Linux 的本机构建路径已实现，仍需在对应系统实测。仓库提供实际媒体夹具与独立打包检查；这些检查不能代表完整剧情、全部分支或主观听音。当前仅支持静态 QPK，明确拒绝动态 Runtime Package；参数化 EQ、非 normal 混合、图片阴影与富文本样式仍有 Web 差异。完整范围见 [Godot Host](/docs/reference/godot-host)。

## 最新 Native 变化

Rust/wgpu Native 的常驻宿主和动态 QPK 执行已经迁移到 JavaScriptCore，该目标的旧 QuickJS 依赖和别名已移除。Godot 使用独立 QuickJS 宿主。Native 的 macOS 实测包含真实模块、异步执行、包卸载与 Demo 流程；完整证据见 [迁移记录](/docs/reviews/native-jsc-migration-2026-09-21)。

报告中的桥接基准只说明固定工作负载下迁移和桥接优化的组合结果，不能推断所有游戏帧率。Windows 交叉目标检查不等于实际 Windows 程序启动；原生 GPU 读回不等于可见窗口或 Web/native 像素一致。

## Cocos 更新（2026-10-12）

Quack 使用包公开产物生成独立工作区，Creator 3.8.8 预览和 macOS 应用已做本机运行检查。媒体夹具覆盖实际音频增益/EQ/变速、全屏静音 SDR H.264 视频与图片数值动画；存档和设置包含真实重启检查。接入见[Cocos 工作区](/docs/platforms/cocos)，能力与未验收范围见[媒体一致性](/docs/platforms/cocos-media)，构建身份和历史基线见[集成审查](/docs/design/cocos-integration-audit)。

这里的三端比较为 Web、Creator Web、Cocos macOS。完整剧情与后续媒体构建分别记录 SHA；图库和成就目录为空，未证明解锁流程。手机设备、任意视频混合、非静音音画同步、HDR、骨骼/粒子、系统级原生输入自动化与主观听音仍需另行验收。CI 的包测试不能代替这些本机运行证据。

## 仍在推进

更完整的平台视觉一致性、视频与排版覆盖、目标系统实际验收、更多脚手架模板和第三方插件生态持续推进。Demo 的故事与演出内容也仍在迭代。

当前包版本为 `0.1.0`，尚未承诺稳定 API。品牌素材去掉 WIP 标签不改变这些具体技术边界。使用方应固定依赖版本，在自己的目标设备验证完整阅读与保存流程。
