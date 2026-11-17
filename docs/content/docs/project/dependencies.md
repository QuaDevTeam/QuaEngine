---
title: "第三方依赖维护"
description: "持续发现版本更新、弃用与安全公告，按工作区和平台能力验证升级，维护可复现的导出与嵌入基线。"
order: 4
---

## 固定版本与持续发现

QuaEngine 包含三个独立的 pnpm 工作区：主仓库、`docs` 和 `packages/editor/release`；另外还有 `packages/native/Cargo.lock`、`packages/platform/godot-host/runtime/Cargo.lock` 与 `packages/platform/unity-host/runtime/Cargo.lock`。只更新根目录的锁文件无法覆盖全部工具。根目录下 `pnpm-workspace.yaml` 的 catalog 负责管理共享版本，升级时还需同步检查各包的 `peerDependencies`、脚手架模板、Demo、CI 与文档。

在仓库根目录执行：

```sh
pnpm deps:test
pnpm deps:report
```

检查报告会写入被 Git 忽略的 `.local/dependencies/report.json` 与 `report.md`，记录三个工作区的已装版本、最新版本、弃用标记以及 `npm audit` 安全公告与影响路径。只有遇到 `high`/`critical` 级别公告或查询失败时命令才会返回退出码 1，“仅仅有新版本发布”不会导致失败。报告范围包含开发工具链依赖，因此公告条目数并不直接等同于可被攻击的产品漏洞数，需要结合实际调用链判断；此外，`npm audit` 也不覆盖 Rust、系统 SDK、FFmpeg 或原生二进制的供应链。

`.github/workflows/dependencies.yml` 会在每周一 09:00（新加坡时间）自动跑同一套检查，并用固定版本的 `cargo-audit` 审计三个 Cargo 锁文件后上传报告，平时也可以手动触发。npm 审计阶段只做只读查询，不跑任何安装脚本也不会自动改代码（工作流合并进远端默认分支后定时触发才会生效）。

`renovate.json` 配置了针对 npm/pnpm catalog、Cargo 与 GitHub Actions 的更新策略，把 Vitest、React、Tailwind 和 svedocs 的关联包编为同一组且不自动合并（如果尚未在仓库启用 Renovate 应用，仅凭配置文件不会自动产生 PR，具体选项见 [Renovate 官方文档](https://docs.renovatebot.com/configuration-options/)）。脚手架模板目录已配置跳过自动更新，随对应版本升级时手工同步；像 Godot、rquickjs、Electron 这类紧耦合或 0.x 预发布 API 仍需人工单独评估。

## 一次升级的处理顺序

1. 先读上游的 Release Notes 和迁移指南，确认 Node、Rust 或宿主版本要求、废弃 API、行为变更与开源协议变化，列出受影响的包与入口。优先处理安全漏洞和弃用项；大版本、0.x 小版本和宿主 SDK 变动单独评估。
2. 在对应工作区更新 catalog、manifest 与锁文件，保留 `trustPolicy: no-downgrade`、完整性校验、签名与构建脚本白名单。切勿为了强行装上包而关掉全局安全策略；确需临时例外时，务必写清楚精确版本、原因和移除条件（Renovate 的 release age 只作用于 PR 节奏，不能取代包管理器本身的策略，详见[官方说明](https://docs.renovatebot.com/presets-security/)）。
3. 同步更新 `peerDependencies` 范围、脚手架模板、Demo、构建工作流、对应 skill 以及[宿主版本与兼容性](/docs/platforms/compatibility)。复查现有的 `overrides` 与 `patch`：上游修复后及时删掉不再需要的覆盖项，不要用跨大版本 override 去硬凑 API 兼容。
4. 先跑受影响包的单测、类型检查和构建（跨包构建按拓扑依赖顺序跑），再到真实的宿主环境里实测。出现问题时回退版本或修复调用方，不要悄悄降级功能或放宽信任策略。
5. 重新审计并检查锁文件 diff，用 `--frozen-lockfile` 干净重装一遍确认可复现。最后记录已修复项、遗留低风险公告、上游阻塞因素、实测范围和回滚方案，不要把未实测的新大版本写进兼容列表。

## 按依赖类别选择验证项

| 变更范围 | 重点验证内容 |
| --- | --- |
| `fflate` / QPK / 压缩与加密 | 打包与读取、损坏包拦截、签名与哈希校验、缓存与 Runtime Package 生命周期 |
| `Dexie` / 存储适配器 | 数据库升级、事务回滚、缓存身份、存档读写往返与账号隔离；跑完 mock 后在真实 IndexedDB 验证 |
| Vue / React / Svelte / Vite | 各框架薄适配器、SSR 客户端挂载边界、生产构建、资源 base 路径、挂载卸载及宿主样式与输入隔离 |
| Electron / `node-pty` / `keytar` | 对应 Electron 版本的 Node-API 原生重编译、Editor 启动与嵌入预览、安装包及目标操作系统 |
| Creator / Godot / Unity / `godot-rust` / `rquickjs` | 桥接编译、独立工程生成、目标核心隔离、真实 SDK 导入与构建、窗口输入和媒体存档；嵌入场景另测 |
| `wgpu` / 字体 / 媒体编解码 | Rust 锁定构建、GPU/字体/媒体专项夹具与真实窗口呈现；数值检查不能代替实际视觉和听音验收 |
| 文档站依赖 | `docs check`、Markdown 测试、静态构建、smoke 与 SEO；升级 svedocs 后额外检查侧栏滚动与浏览器历史导航 |

Rust 依赖更新请在对应的三个 Cargo 工作区里分别操作：先通过 `cargo metadata --locked` 或 `cargo tree` 看清依赖树，需要更新时用 `cargo update -p <crate>` 定向更新，再跑对应的 Cargo 测试与平台门禁，并用 `cargo audit` 检查三个锁文件（npm 报告不包含 Rust 漏洞）。系统级工具和 SDK 的版本、来源及许可信息请另外记录在交付文档里。

## 2026-11-14 维护批次记录

这一轮重点更新了资源与构建链路上的基础依赖：将资源核心链路升至 Dexie 4.4.7、fake-indexeddb 6.2.8、fflate 0.8.3，并将受影响的 Tinypool v2 约束到 2.1.2，以修复 [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) 等 worker 选项原型污染公告。破坏性较大的 TypeScript 7、Vitest 5、Electron 45 和 SvelteKit 3 暂未在本次升级中迁入。

此外，在安全与弃用排查中也注意到 `lucide-svelte` 已标记弃用，以及 Vite、DOMPurify、Undici、sharp、SvelteKit 和 Vitest 传递路径上的若干公告，复核时已对当前版本分支做了针对性修补。其中，`lucide-svelte` 后续更换包名需要联动验证 Novel Writer UI 和全仓导入；文档站的 svedocs/svedocs-cli 0.3 与 SvelteKit 3 也将在单独的升级任务中评估，不直接靠刷新 lockfile 强行升级。需要注意，npm audit 报出的公告总数包含了开发期工具链，是否构成真实产品风险仍需结合实际调用路径判断。

具体版本调整如下：Electron 固定在 44.9.1，在同主版本内修补了证书通告；Vite 8.3.8、Vue 3.5.45、markdown-it 15.0.3 与 Zod 4.6.7 同步升级以修复当前路径问题。`sharp` 升至 0.35.5，并依据[上游迁移说明](https://sharp.pixelplumbing.com/changelog/v0.35.0/)核对了 Node 20.9+ 要求、输入通道上限和 JP2 命名，Quack 已适配新的 default export 类型。PSD 导入器采用 `ag-psd` 31.0.3，保留其新增的[解码内存上限](https://github.com/Agamnentzar/ag-psd/blob/master/CHANGELOG.md)保护。测试环境升级至 Happy DOM 21.0.4，与当前 Node 基线兼容。

三个 pnpm 工作区的传递依赖均按各自 API 主版本加入了精准范围的安全 override（例如分别维护 Undici 6/7 的修复线，以及分开约束 `brace-expansion` 1/2/5）；VS Code 扩展依赖的 Azure Identity 4.x 则保留由上游同步适配的 MSAL，不跨大版本强换内部依赖。文档站的 `sharp` 0.35 override 属于已评估的 0.x API 升级，升级后已复测 OG 图片生成与静态站点构建。

Rust 侧也在三个 Cargo 工作区执行了完整的 RustSec 审计。Native 端按兼容分支更新了 Wayland scanner、quick-xml、rustls/webpki、rustix 和 yoke，消除了对应漏洞与 unsound/yanked 提示；复审后三个 Cargo 锁文件目前均无已知安全漏洞。不过 Native 仍存在 `rustybuzz` 0.20.1 与 `ttf-parser` 0.25.1 的停止维护提示，后续需要继续跟进上游字体栈迁移并做对应的排版实测。Godot 与 Unity 的依赖审计通过，依然不代表其宿主 SDK 的编译和真机运行已经完成验收。
