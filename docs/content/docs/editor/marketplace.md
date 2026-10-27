---
title: "安装与发布插件"
description: "区分引擎 runtime 与编辑器 devtools 插件，安装经过注册服务验证的版本并发布自己的插件。"
order: 10
---

## 插件提供什么

包通过 `package.json.quajs.extension` schema 1 声明 `runtime`、`devtools` 或两者。Runtime 是游戏功能，devtools 是编辑器面板/索引等工具；安装包不等于已把 runtime 接进游戏引擎。

内置角色/动画工具随 Editor 提供。第三方插件的运行行为与权限仍需自行评估，Registry 的静态检查或可选 AI 审查不是完整沙箱或恶意代码保证。

## 安装与启停

1. 打开项目，在活动栏进入插件市场；市场是停靠面板，保留固定侧栏和文档。
2. 查看包名、精确版本、功能类型、来源和审查状态，再安装。
3. 按项目的 npm/pnpm 工作流安装精确版本；编辑器禁用安装生命周期脚本。声明 Yarn 的项目需通过自己的 Yarn 流程处理。
4. 检查依赖变更、devtools 启用状态，以及 runtime 所需的项目接线。启停编辑器工具不会自动重写剧情。

目录与“官方”徽章由服务验证，包名包含 `@quajs` 或自定义 catalog 自称官方都不能直接授予徽章。自定义发现目录仍需通过所选 Registry 的安装审查。取消安装后检查 `package.json` 与锁文件，包管理器可能已经写入部分变化。

## 发布自己的插件

直接打开插件包目录，通过「插件 → 发布」登录 GitHub Registry。生成所有权 claim 后，检查 `package.json` 草稿并保存。

构建插件，使用「打包并检查文件」查看将发布的准确 tarball、名称、版本、文件列表与 SHA-512，再发布同一个 artifact 到 npm。npm 登录在本机进行，不把 npm token 交给 Registry；OTP 仅用于本次发布。

将包含 claim 的 npm `latest` 稳定版提交 Registry。Claim 有 24 小时有效期，成功登记会消耗；预发行通常使用 `next`，需提升稳定版为 `latest` 后才能按该流程登记。更改包清单后重新打包；取消发布可能与 npm 接收产生竞态，重试前先查 npm 的实际结果。

## 审查与故障处理

被隐藏的包需查看原因、修复并发布新版本，等待重新审查。普通更新无需反复注册；维护者身份变化可能需要新的发布 claim。登录失败时检查系统安全存储、Registry 来源与网络，不能以明文凭据绕过。

完整所有权、审查、同步与部署契约见[Registry 参考](/docs/editor/registry)；编辑器插件开发见[插件契约](../../../../docs/design/editor-plugins.md)。运行期动态内容仍走 Runtime QPK 与引擎激活，市场安装不能替代包信任与状态迁移。
