---
title: "第三方依赖维护"
description: "持续发现版本更新、弃用与安全公告，按工作区和平台能力验证升级，维护可复现的导出与嵌入基线。"
order: 4
---

## 固定版本与持续发现

QuaEngine 有三个独立的 pnpm 工作区：主仓库、`docs`、`packages/editor/release`；另有 `packages/native/Cargo.lock` 、`packages/platform/godot-host/runtime/Cargo.lock` 和 `packages/platform/unity-host/runtime/Cargo.lock`。单独更新根 lockfile 无法维护所有工具。根 `pnpm-workspace.yaml` 的 catalog 管理共享版本，包的 `peerDependencies`、脚手架模板、示例、CI 和文档也要一起检查。

从仓库根目录执行：

```sh
pnpm deps:test
pnpm deps:report
```

报告写入忽略的 `.local/dependencies/report.json` 与 `report.md`，保留三个工作区的 installed/latest、弃用标记和 npm audit 公告、影响路径。发现 high／critical 公告或查询失败时退出 1；“有新版本”本身不会失败。报告包含开发工具依赖，公告数量不是产品可利用漏洞的数量，必须结合实际调用路径判断。npm audit 不覆盖 Rust、系统 SDK、FFmpeg 或原生二进制供应链。

`.github/workflows/dependencies.yml` 每周一 09:00 新加坡时间运行同一检查，并通过固定版本的 `cargo-audit` 分别检查三个 Cargo 锁文件，上传各自报告；也可手动触发。npm 检查只读取依赖，不运行依赖安装脚本或自动改代码。工作流进入远端默认分支后才有定时执行；本地通过不代表远端任务已经运行。

`renovate.json` 为 npm／pnpm catalog、Cargo 和 GitHub Actions 提供更新配置，将 Vitest、React、Tailwind、svedocs 的关联包分组，不自动合并。**配置文件不代表机器人已经安装或授权**；维护者启用 Renovate 后才会产生更新 PR。配置与选项依据 [Renovate 官方文档](https://docs.renovatebot.com/configuration-options/)；模板目录跳过自动更新，由对应升级同步修改。精确绑定的 Godot、rquickjs、Electron 和预发布／0.x API 仍需专项评估。

## 一次升级的处理顺序

1. 阅读上游发布说明和迁移文档，确认 Node／Rust／宿主版本要求、废弃 API、行为和许可变化，记录影响包与入口。优先处理安全修复与弃用；大版本、0.x 小版本和宿主 SDK 变更单独评估。
2. 在所属工作区更新 catalog／manifest 和 lockfile，保留 `trustPolicy: no-downgrade`、完整性、签名与构建脚本白名单。不能为安装成功关闭全局策略；若必须增加例外，限定准确版本、原因和移除条件。Renovate 的 release age 不覆盖所有 lockfile 维护路径，不能代替包管理器策略，参见[官方说明](https://docs.renovatebot.com/presets-security/)。
3. 同步 peer 范围、脚手架、demo、构建工作流、相关 skill 与[兼容性说明](/docs/platforms/compatibility)。复查显式 overrides 和 patch：上游修复后移除不再必要的约束，不能用跨大版本 override 伪装 API 兼容。
4. 运行受影响包测试、类型检查和构建；跨包构建按依赖顺序执行。再在真实消费者／宿主中验证。失败保留原版本或修复调用方，不静默降低功能与信任要求。
5. 再次审计、检查 lockfile 差异、使用 frozen-lockfile 重装确认可复现。记录已修复问题、剩余公告、上游阻塞、验收范围与回滚方式。不能将未验收的大版本列为已兼容。

## 按依赖选择验证

| 变更 | 需要验证 |
| --- | --- |
| fflate／QPK／压缩与加密 | 打包、读取、损坏包拒绝、签名／hash、缓存和 Runtime Package 生命周期 |
| Dexie／存储 adapter | 数据库升级、事务回滚、缓存身份、存档往返、账号隔离；mock 后补真实 IndexedDB |
| Vue／React／Svelte／Vite | 对应薄适配器、SSR 客户端边界、生产构建、资源 base、挂载／销毁及宿主样式／输入隔离 |
| Electron／node-pty／keytar | 对应 Electron Node-API 原生重编译、Editor 实际启动与嵌入预览、安装包及目标 OS |
| Creator／Godot／Unity／godot-rust／rquickjs | 桥接编译、独立生成、目标隔离、实际 SDK 导入／构建、窗口输入和媒体／存档；嵌入另测 |
| wgpu／字体／媒体编解码 | Rust 锁定构建、GPU／字体／媒体专项与真实窗口；图像数值不代替可见／可听验收 |
| 文档依赖 | docs check、Markdown、静态 build、smoke／SEO；升级 svedocs 后额外验证侧栏与历史导航 |

Rust 更新分别在三个 Cargo workspace 中执行，先 `cargo metadata --locked`／`cargo tree` 查看依赖；有意更新时使用限定包的 `cargo update -p <crate>`，再跑对应 Cargo tests／check 和平台运行门禁。使用已安装的 `cargo audit` 检查三个锁文件；本次 npm 报告不代表已经执行 Rust 漏洞审计。系统工具和 SDK 的版本、来源与许可证另记入交付记录。

## 2026-11-14 维护批次

本批先升级资源链路的 Dexie 4.4.7、fake-indexeddb 6.2.8、fflate 0.8.3，并将受影响的 Tinypool v2 约束到 2.1.2，处理 [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) 等 worker 选项原型污染公告。没有将 TypeScript 7、Vitest 5、Electron 45 或 SvelteKit 3 自动迁入。

首轮清单还发现 `lucide-svelte` 已弃用，以及 Vite、DOMPurify、Undici、sharp、SvelteKit、Vitest 等依赖路径的安全公告。复核时继续修补受影响的版本分支；**报告中的公告与实际产品可利用路径仍需区分**。`lucide-svelte` 的包名迁移需要 Novel Writer UI 和全部导入验证；文档站的 svedocs/svedocs-cli 0.3 和 SvelteKit 3 需要作为独立迁移验证，不能只刷新 lockfile。

复核补充：Electron 固定在 44.9.1，同一主版本内修补证书通告；Vite 8.3.8、Vue 3.5.45、markdown-it 15.0.3 与 Zod 4.6.7 同步修复当前路径。sharp 升至 0.35.5，按[上游迁移说明](https://sharp.pixelplumbing.com/changelog/v0.35.0/)核对 Node 20.9+、输入通道上限和 JP2 命名，Quack 使用新的 default export 类型。PSD 导入器采用 ag-psd 31.0.3，保留[上游新增的解码内存上限](https://github.com/Agamnentzar/ag-psd/blob/master/CHANGELOG.md)，不禁用内存保护。Happy DOM 21.0.4 用于测试环境，Node 基线仍满足要求。

三个工作区的传递依赖按已有 API 主版本加入有范围的安全 override；例如 Undici 6/7 分别使用对应修复线，brace-expansion 1/2/5 分开维护。VSCE 的 Azure Identity 4.x 升级由上游带入适配后的 MSAL，不直接强换其内部 MSAL 大版本。文档站 sharp 0.35 的 override 属于已评估的 0.x API 升级，需要保留图像／OG 和真实构建验证。每次交付以最新报告中的实际数量为准，较低级别公告不能写成“零漏洞”。

本批实际执行了三个 Cargo 锁文件的 RustSec 审计。Native 按兼容分支更新 Wayland scanner／quick-xml、rustls／webpki、rustix 和 yoke，修复漏洞及 unsound／yanked 提示。复审计的三个锁文件均无已知漏洞；Native 仍有 rustybuzz 0.20.1 与 ttf-parser 0.25.1 的停止维护提示，需跟进上游字体栈迁移及字体／排版验收，不把它们隐藏为已解决。Godot／Unity 审计通过不能代替宿主 SDK 编译与运行验收。
