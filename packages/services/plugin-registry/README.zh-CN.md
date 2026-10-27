# QuaEngine 插件注册服务

[English](README.md) · **简体中文**

`https://registry.quaengine.com` 的 Cloudflare Workers + D1 服务。npm 分发包、版本和 tarball；Registry 保存已验证目录、所有权、审查与同步状态，不执行或重新发布提交包，也不接收 npm 凭据。

## 发布者流程

1. 在 `package.json.quajs.extension` 声明 schema 1 的 `runtime`、`devtools` 或两者，见[插件契约](../../../docs/design/editor-plugins.md)。
2. 用 Editor 直接打开包目录，在「插件 → 发布」通过 GitHub 登录，无需游戏 manifest。
3. 生成 claim，检查编辑器在 `quajs.registry.claim` 创建的可撤销草稿，保存、构建并在本机登录 npm。
4. 「打包并检查文件」关闭生命周期脚本，生成暂存 npm/pnpm tarball；检查名称、版本、文件列表与 SHA-512，再发布同一 artifact。OTP 只在主进程保留至该次操作结束；清单修改后重新打包。取消可能与 npm 接收竞态，重试前查询实际结果。重新打包、切项目、成功发布或退出时清理 artifact。
5. 提交已发布的 npm `latest`。实际 tarball 中匹配的 24 小时 claim 证明发布权，登记后消耗；普通更新不用重新注册。预发行走 `next`，提升为稳定 `latest` 后再提交。

GitHub 登录使用浏览器绑定 OAuth state、PKCE 和显式设备授权，账号至少注册七天。服务存储编辑器 session 的哈希；Electron 通过 OS `safeStorage` 加密保存按 Registry origin 隔离的 bearer credential，UI 只读账户显示数据。GitHub token 不保留；安全存储不可用时拒绝登录，不回退明文。

## 自动审查与同步

默认 `REVIEW_MODE=system` 无需审查员或 AI key。要求公共、未弃用 npm 包、显式 manifest、有效 runtime/devtools 入口、ESM/API 1 devtools、SHA-512 与实际 tarball/元数据一致。元数据、字节数、文件数和时间均有界；链接、不安全路径、重名文件与安装 hooks 拒绝。凭据文件/访问、原生可执行文件、动态进程/eval 或超大脚本进入隔离。通过的包显示，被标记的包隐藏并告知发布者原因；新版本自动复审。

可选 `REVIEW_MODE=jev` 使用 TypeSafe System One Noul，配置 Worker secret `TYPESAFE_API_KEY`。`TYPESAFE_MODEL` 默认 `jev-latest`，每日默认 100 次的 `JEV_DAILY_LIMIT` 在调用前由 D1 原子扣减，失败也计数。只发送有界公共元数据与最多 12000 个源码字符，包文本是不可信证据。返回须有合法 typed probabilities、model 和 usage；spam/harmful ≤ 0.1 且 relevance ≥ 0.9 才批准，不确定、格式错误、服务故障、缺 key 或预算耗尽都隐藏。

审查缓存七天，失败缓存 15 分钟，并记录模型、概率和用量。这些初始阈值仍需真实标注包校准；确定性夹具不等于已调用付费/真实 Jev。

Cron 每 15 分钟租用最多 20 个到期包，正常每包 12 小时检查一次；待审每小时重试，npm 瞬时失败在 15 分钟到 24 小时退避。新版本重新扫描，未改变的不可变归档复用扫描。当前维护者取自 npm package 文档而非版本文档；身份变化持续隔离，直到新的已发布 claim 证明权限。新发布者可认领原行；移除、弃用或失效包暂停，修复后可恢复，运营 hold 不因重新登记清除。七天未成功同步的包不可用。

静态规则和 Jev 不是恶意代码保证或执行沙箱，不审核全部传递依赖或证明运行行为。安装仍用包管理器 integrity/trust 策略并禁用脚本；devtools/indexer 以用户权限执行。Runtime QPK 校验与引擎/渲染器状态边界是独立系统。

官方徽章仅来自服务维护的精确 [official-packages.json](src/official-packages.json) 白名单与正常验证。`@quajs` 前缀、npm official 字段或自定义 JSON 不能授予徽章。内置角色浏览器标为官方；本地 workspace 包不会因为目录条目而发布到 npm。

## 滥用限制与运营

- Cloudflare Rate Limiting：每 location 每 IP 每分钟 120 请求，轮换盐值；这是近似边缘限流，严格账户/提供商预算在 D1 原子实现。
- Auth/device/claim 有独立每小时限制。每账户每天 15 次 claim/submission、最多 100 个所有包、5 个待审；全局 500 个待审与每天 500 次 npm 提交检查。
- 请求最多 8 KiB；npm 元数据 512 KiB（所有权文档 4 MiB）；压缩 tarball 8 MiB、展开 32 MiB / 10000 项。
- 仅请求固定 GitHub、公共 npm、TypeSafe 地址，使用 manual redirect 并拒绝非成功响应。tarball 只接受 `registry.npmjs.org` HTTPS，不允许任意用户 URL 或远程执行。
- 可选 `/admin` 用于事件/例外。`ADMIN_GITHUB_IDS` 配置不可变数字 ID，`[]` 为仅自动审查；变更要求浏览器 session、Origin 与 CSRF，使用 revision/candidate 防过期覆盖。手动暂停/拒绝跨同步保留，审计保留 180 天。
- 监控 429/5xx、cron backlog 与原因。建议 Workers Paid 满足定时 CPU/subrequest；当前节奏最多 1920 检查/日，正常每日两次检查约支持 960 包，重试另占预算。扩大前评估批次/Queues、计费告警与 WAF。

## 部署

配置面向 `registry.quaengine.com` 与现有 `qua-plugin-registry` D1。正常部署需要 GitHub OAuth client 和 Worker secrets。初期 `--catalog-only` 要求 client ID 为空，提供目录但登录/注册 HTTP 503 关闭；`/health.registrationReady` 报告状态而不泄露凭据。本地测试不创建云资源、不发布 npm、不调用付费 AI。

英文源文档保留 **2026-09-21 UTC** 的部署与 OAuth 接线记录。它只证明当日健康检查、设备授权入口、回调与定时配置，未完成真实用户登录或真实包登记，不应当作当前完整服务验收。

在此包目录使用独立 Wrangler 工具链（源参考命令指定 4.135.0）：

```sh
REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs
# 初期仅目录部署，要求 GITHUB_CLIENT_ID 为空：
# REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs --catalog-only
```

D1 已配置；仅其他环境新建数据库。OAuth App 在 GitHub Developer settings 创建，主页 `https://registry.quaengine.com`，回调 `/oauth/callback`，client ID 放 `vars.GITHUB_CLIENT_ID`。私有 mode-0600 JSON 只接受 `ABUSE_SECRET`、`GITHUB_CLIENT_SECRET`、可选 `TYPESAFE_API_KEY`。不将凭据写入 `wrangler.jsonc`、UI 或 Git；npm/GitHub CLI token 不能代替 OAuth App client secret。

部署脚本检查配置/secret 名、应用 remote D1 migration 并发布 Worker/Cron；secrets 与版本原子上传，未列出的已有 secret 保留。正常重部署不要轮换 ABUSE_SECRET。账户认证、DNS/zone 权限和可用 rate-limit namespace 需预先具备，检查入库的 `1001` 是否适合目标环境。

发布后验证 `/health`、`/api/catalog`、完整 GitHub 设备登录、一次真实 npm 登记及定时同步；启用 Jev 后另验实际提供商。编辑器默认正式 origin，可在「目录源」选其他 HTTPS Registry 或 JSON 发现目录，安装仍经所选 Registry 审查。宿主开发覆盖 `QUA_EDITOR_PLUGIN_REGISTRY` 为空时禁用服务；仅此覆盖允许 loopback HTTP。

## 验证

先构建 `@quajs/editor-core`。在仓库执行：

```sh
pnpm --filter @quajs/plugin-registry test
pnpm --filter @quajs/plugin-registry typecheck
pnpm --filter @quajs/plugin-registry build
```

包内 `node scripts/workerd-smoke.mjs` 使用真实 workerd/D1 与夹具 npm HTTP、真实 SHA-512/gzip/tar，检查登记、审查、目录、定时更新和撤回。可用 `REGISTRY_TOOLING_PACKAGE` 指向含 Wrangler 4.135.0 的隔离安装 package.json，默认 `.codex-tmp/registry-tooling/package.json`。

Editor 验证包括 core/character/Electron 测试与 typecheck、UI/Electron 构建，以及 `marketplace-smoke.mjs`、`publishing-smoke.mjs`、`character-plugin-smoke.mjs`。发布测试使用真实 npm/pnpm 打包且禁用恶意生命周期夹具，不执行公共 `npm publish`；可见发布预览不证明真实账户所有权。
