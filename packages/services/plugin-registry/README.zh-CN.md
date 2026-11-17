# QuaEngine 插件注册服务

[English](README.md) · **简体中文**

部署在 `https://registry.quaengine.com` 的 Cloudflare Workers + D1 服务。插件包本身、版本历史和 tarball 依然由 npm 托管分发；Registry 只负责维护通过校验的插件目录、所有权记录、审核状态和定期同步，既不会运行或重新打包你提交的代码，也不会接触你的 npm 凭据。

## 发布者接入流程

1. 在插件包的 `package.json` 中声明 `quajs.extension`（schema 1）的 `runtime`、`devtools` 或两者，字段定义见[编辑器插件契约](../../../docs/design/editor-plugins.md)。
2. 在 QuaEngine Editor 里直接打开这个插件包目录（不需要游戏配置），进入「插件 → 发布」使用 GitHub 登录。
3. 生成所有权声明（claim），编辑器会在 `quajs.registry.claim` 写入一份可撤销草稿。核对保存后构建插件，并在本机登录好 npm。
4. 点击「打包并检查文件」，编辑器会关闭生命周期脚本并打出一个暂存 tarball；确认包名、版本、文件清单和 SHA-512 哈希无误后，直接发布这份一模一样的产物到 npm。一次性验证码（OTP）只会在主进程内存中保留到本次发布结束；每次修改 `package.json` 都要重新打包。万一在最后关头取消发布，有可能 npm 那边其实已经收下了，重试前先去 npm 看一眼实际结果。重新打包、切换项目、发布成功或退出编辑器时，暂存文件都会自动清理。
5. 等包在 npm 的 `latest` 标签生效后，回编辑器提交登记。tarball 里附带的 24 小时有效 claim 会证明你的发布权，登记成功后立即消耗（之后的常规版本更新不需要重复登记）。如果先发了带 `next` 标签的预发布版，记得等提升为 `latest` 稳定版后再来提交。

GitHub 登录流程使用绑定浏览器的 OAuth state、PKCE 以及显式设备授权，且要求 GitHub 账号注册满七天。服务端只保存编辑器会话哈希；Electron 客户端通过系统原生的 `safeStorage` 加密存储按 Registry origin 隔离的 bearer 凭据，UI 层只能读取用于展示的账户信息。登录用的 GitHub token 用完即弃、不落盘；如果系统安全存储不可用，客户端会直接拒绝登录，不会退回明文保存。

## 自动审查与定时同步

服务默认采用 `REVIEW_MODE=system`，不需要人工审稿人或外部 AI 密钥。系统会校验包是否公开且未弃用、是否有合法的扩展 manifest、runtime/devtools 入口是否有效、devtools 是否符合 ESM 与 API 1 规范，以及 SHA-512 与实际 tarball 和元数据是否一致。元数据体积、压缩包大小、文件数量和执行时间均有严格上限；符号链接、危险路径、重名文件以及安装生命周期脚本会被直接拒绝，而读取凭据路径、夹带原生可执行文件、动态拉起子进程/`eval` 或超大脚本的包则会被隔离隐藏。通过检查的包会立刻展示在目录里，被拦截的包会隐藏并向发布者展示具体原因，修复后发新版本即可触发自动复审。

服务端也支持可选的 `REVIEW_MODE=jev`（接入 TypeSafe System One Noul 做垃圾信息、恶意行为和相关性辅助判断），通过 Worker secret `TYPESAFE_API_KEY` 配置。`TYPESAFE_MODEL` 默认为 `jev-latest`，每天 100 次的 `JEV_DAILY_LIMIT` 配额会在发请求前由 D1 原子扣减（调用失败同样计次）。每次只发送有上限的公开元数据和最多 12000 个字符的源码片段，且包内文本一律视为不可信输入；只有返回有效的类型化概率、模型名和用量，并且满足 `spam`/`harmful <= 0.1` 且 `relevance >= 0.9` 时才会放行，遇到结果不确定、格式错误、服务异常、缺 key 或额度用完一律保持隐藏。

审核结果默认缓存 7 天，失败缓存 15 分钟，并记下模型、概率与用量日志。需要注意，这些初始阈值还需要更多真实标注包来校准，仓库里的确定性测试夹具并没有真的调用付费线上 Jev 接口。

后台 Cron 每 15 分钟触发一次，每次最多租约扫描 20 个到期的包：正常包每 12 小时复查一次，待审包每小时重试，遇到 npm 瞬时故障则在 15 分钟到 24 小时之间指数退避。新发布的版本会重新扫描，未改变的不可变归档直接复用历史扫描结果。当前 npm 维护者列表从包级文档而非版本文档读取；一旦维护者发生变更，包会暂时隔离，直到新的已发布版本携带新的 claim 证明所有权，合法的新发布者也可以借此认领已有条目。被下架、弃用或失效的包会暂停展示，恢复正常后自动解封（管理员手动加上的运营 hold 不会因为重新登记而被清除）。连续 7 天未能成功同步的包会标记为不可用。

需要强调，静态规则和 Jev 只是上线前的初筛手段，**并不构成恶意代码保证或运行沙箱**，也不会去审计全部传递依赖或证明运行时行为。安装包时依然依赖包管理器的完整性/信任校验并禁用安装脚本；编辑器里的 devtools 和索引器本质上是运行在当前用户权限下的本地代码，而游戏运行期 QPK 校验与引擎状态边界则属于另一套独立系统。

「官方」徽章只根据服务端受控的白名单 [`official-packages.json`](src/official-packages.json) 经过验证后授予。包名里带 `@quajs`、npm 字段自己写 official 或自定义 JSON 目录都无法拿到官方徽章；编辑器内置的角色浏览器也会标记为官方，本地 workspace 包不会仅因为上了白名单就自动发布到 npm。

## 滥用限制与运营保护

- **边缘限流**：通过 Cloudflare Rate Limiting 按接入点与 IP 每分钟限制 120 次请求，Keys 每天加盐轮换（这是边缘近似限流，账号和提供商的严格配额由 D1 原子计数保证）。
- **账户与全站配额**：认证、设备授权与 claim 接口有独立的小时级限流；每个账号每天最多 15 次 claim/提交、最多拥有 100 个包、同时最多 5 个待审包；全站同时最多 500 个待审包、每天最多 500 次 npm 提交检查。
- **体积上限**：单次请求上限 8 KiB，npm 元数据上限 512 KiB（所有权文档上限 4 MiB），压缩 tarball 上限 8 MiB，解压后上限 32 MiB 或 10000 个条目。
- **出站访问白名单**：服务端只连接固定的 GitHub、公开 npm 和 TypeSafe 域名，启用 `redirect: manual` 并拒绝非成功响应；tarball 下载只允许 `registry.npmjs.org` 的 HTTPS 地址，不接受任意用户输入 URL，也不执行远程代码。
- **应急管理控制台**：可选开启 `/admin` 处理突发事件与特例，通过 `ADMIN_GITHUB_IDS` 配置不可变的数字 GitHub 账号 ID（留空 `[]` 表示纯自动审核）。管理员操作需要浏览器会话、Origin 与 CSRF 校验，并用版本号防并发覆盖；手动暂停/拒绝状态跨同步保留，审计日志保存 180 天。
- **容量与告警**：注意监控 429/5xx、Cron 积压量及失败原因。建议开启 Workers Paid 以满足定时检查的 CPU 和子请求配额；按当前 Cron 节奏每天最多执行 1920 次检查（约支持 960 个包每天两次常规巡检，重试另计预算），规模继续增长前需要评估分批或 Queues、账单告警以及 WAF 规则。

## 部署说明

仓库里的配置指向 `registry.quaengine.com` 以及对应的 `qua-plugin-registry` D1 数据库。完整部署需要准备好 GitHub OAuth App 和 Worker secrets；初期可以用 `--catalog-only` 模式部署（此时要求 `GITHUB_CLIENT_ID` 留空，目录接口正常可用，登录与登记接口明确返回 HTTP 503，`/health.registrationReady` 会体现这一状态且不泄露任何凭据）。本地测试不会创建云端资源、发布 npm 包或调用付费 AI。

英文原文档中保留了一则 **2026-09-21 UTC** 的部署与 OAuth 联调记录，它验证了当日的服务健康检查、设备授权入口、回调流程和定时任务配置，但当时尚未跑通真实用户的完整登录和真实包登记，不能当作完整产品验收的依据。

在 `packages/services/plugin-registry` 目录中使用独立 Wrangler 工具链（源码参考命令使用 `4.135.0`）：

```sh
REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs
# 初期仅目录模式（要求 GITHUB_CLIENT_ID 为空）：
# REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs --catalog-only
```

D1 数据库已预先建好，只有搭建全新环境时才需另建。OAuth App 在 GitHub Developer settings 中创建，主页填 `https://registry.quaengine.com`，回调填 `https://registry.quaengine.com/oauth/callback`，然后把 client ID 写入 `vars.GITHUB_CLIENT_ID`。`mode 0600` 的私有 JSON 凭据文件只接受 `ABUSE_SECRET`、`GITHUB_CLIENT_SECRET` 和可选的 `TYPESAFE_API_KEY`——千万不要把密钥提交进 `wrangler.jsonc`、UI 或 Git，也不能拿 npm 或 GitHub CLI token 来冒充 OAuth App client secret。

部署脚本会自动核对配置和 secret 名称、执行远端 D1 迁移并发布 Worker 和 Cron；secrets 会随 Worker 版本原子上传，未列出的已有 secret 会原样保留（常规重新部署时不要轮换 `ABUSE_SECRET`）。操作前需要具备相应的账号权限、DNS/zone 权限以及可用的限流命名空间，并核对配置里的 `1001` 是否适用于你的目标账号。

上线后请实测一遍 `/health`、`/api/catalog`、完整的 GitHub 设备登录、一次真实的 npm 包登记以及一次定时同步；如果启用了 Jev，还应另行验证真实模型响应。编辑器默认连接生产域名，你也可以在「目录源」里换用其他 HTTPS Registry 或自定义 JSON 发现目录（安装仍需通过所选 Registry 的审查）；开发阶段把环境变量 `QUA_EDITOR_PLUGIN_REGISTRY` 设为空可以禁用服务，只有在这个开发覆盖变量里才允许使用本地 loopback HTTP。

## 验证

运行验证前请先构建 `@quajs/editor-core`，然后在仓库根目录执行：

```sh
pnpm --filter @quajs/plugin-registry test
pnpm --filter @quajs/plugin-registry typecheck
pnpm --filter @quajs/plugin-registry build
```

包内的 `node scripts/workerd-smoke.mjs` 会启动真实的 `workerd` 和本地 D1，配合模拟 npm HTTP 服务以及真实的 SHA-512/gzip/tar 数据，把登记、审核、目录查询、定时更新和撤回全流程跑一遍（可通过 `REGISTRY_TOOLING_PACKAGE` 指向含 Wrangler 4.135.0 的隔离 `package.json`，默认读取 `.codex-tmp/registry-tooling/package.json`）。

Editor 侧的配套验证包括 core/character/Electron 单测与类型检查、UI/Electron 构建，以及 `marketplace-smoke.mjs`、`publishing-smoke.mjs` 和 `character-plugin-smoke.mjs`。其中的发布冒烟测试会打真实的 npm/pnpm tarball 并测恶意生命周期脚本拦截，但不会真的往公开 npm 推送包，界面的发布预览也不代表真实账户的所有权验证。
