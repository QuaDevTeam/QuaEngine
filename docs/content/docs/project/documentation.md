---
title: "维护与部署文档站"
description: "独立安装的 svedocs 工程，自动同步包参考，生成可静态托管的站点。"
order: 3
---

## 本地运行

从仓库根目录执行：

```bash
pnpm --dir docs install --frozen-lockfile
pnpm docs:dev
```

文档站使用独立 pnpm 工程与锁文件，因此无需安装 Rust、Electron 或整套游戏依赖。终端会显示本地预览地址。

## 内容目录

`docs/content/docs` 保存面向读者的教程，`docs/content/pages` 保存首页、品牌等独立页面。`docs/design`、`docs/reviews` 与包 README 保持原位置。

`docs/scripts/prepare-content.mjs` 每次启动/构建生成 `.generated/content`，补齐源文件、标题、描述，转换跨文件链接并复制品牌资源。新增参考包时更新脚本的来源目录；新增教程时直接写 Markdown frontmatter。

## 定制主题

`docs/svedocs.config.ts` 管理站点配置。`docs/src/lib/theme` 包含项目自己的导航、文档布局、首页和主题 CSS。svedocs 负责内容编译、搜索、路由、代码工具和机器可读输出。

不要在页面组件里重新扫描 Markdown 或创建另一套搜索索引。品牌图来自 `assets/brand`，通过内容准备脚本进入静态目录。

## 检查与构建

```bash
pnpm docs:check
pnpm docs:build
pnpm --dir docs preview
pnpm --dir docs test:smoke
```

检查包含 Svelte/TypeScript 和 svedocs strict 内容验证。浏览器冒烟需要可用的 Chrome 或 Playwright Chromium，并且 preview 服务已经运行。

## 使用 Wrangler 部署

生产域名是 [quaengine.com](https://quaengine.com)。`docs/wrangler.jsonc` 将静态构建发布到独立的 `quaengine-docs` Worker，并通过 Custom Domain 绑定主域名。插件市场的 `registry.quaengine.com` 独立运行。

使用已有的 Cloudflare 项目账号登录 Wrangler，然后从仓库根目录执行：

```bash
# 先构建并检查 Wrangler 配置，不发布
pnpm docs:check
pnpm docs:build
pnpm --dir docs deploy:check

# 验证 Cloudflare 静态路由；在另一个终端运行浏览器检查
pnpm --dir docs dev:worker
DOCS_TEST_URL=http://127.0.0.1:4176 pnpm --dir docs test:smoke

# 重新检查、构建并发布到正式域名
DOCS_SITE_URL=https://quaengine.com pnpm --dir docs deploy
DOCS_TEST_URL=https://quaengine.com pnpm --dir docs test:smoke
```

Wrangler 使用文档工作区锁定的版本。凭据保存在本机认证或 CI 的受保护环境中，不写入仓库。`DOCS_SITE_URL` 负责规范链接和 sitemap，正式发布时必须与绑定域名一致。

构建输出为 `docs/build/`。Workers Assets 保留子目录 `index.html`、404 页面、静态资源、sitemap 和 markdown twins，为未知地址返回真正的 404。带内容哈希的应用资源使用长期缓存；正文不会套用这项不可变缓存策略。

本地搜索不依赖在线服务。`/llms.txt`、`/llms-full.txt` 与每页 `/index.md` 提供机器可读入口，静态模式不使用 SSR 内容协商。

CI 默认检查并保存静态产物，正式发布通过上面的 Wrangler 命令执行。上传成功后仍应检查 HTTPS、直接打开深层页面、搜索、代码复制和不存在的路径。
