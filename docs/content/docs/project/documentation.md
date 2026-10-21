---
title: "维护与部署文档站"
description: "独立安装的 svedocs 工程，自动同步包参考，生成可静态托管的站点。"
order: 3
---

## 本地运行

从仓库根目录执行：

```bash
pnpm --dir docs install --frozen-lockfile
# 已安装 Chrome 时可跳过；Linux CI 需要 Chromium 及中文字体
pnpm --dir docs exec playwright install --with-deps chromium
pnpm docs:dev
```

文档站使用独立 pnpm 工程与锁文件，因此无需安装 Rust、Electron 或整套游戏依赖。终端会显示本地预览地址。

## 内容目录

`docs/content/docs` 保存面向读者的教程，`docs/content/pages` 保存首页、品牌等独立页面。`docs/design`、`docs/reviews` 与包 README 保持原位置。

`docs/scripts/prepare-content.mjs` 每次启动/构建生成 `.generated/content`，补齐源文件、标题、描述，转换跨文件链接并复制品牌资源。新增参考包时更新脚本的来源目录；新增教程时直接写 Markdown frontmatter。

## 定制主题

`docs/svedocs.config.ts` 管理站点配置。`docs/src/lib/theme` 包含项目自己的导航、文档布局、首页和主题 CSS。svedocs 负责内容编译、搜索、路由、代码工具和机器可读输出。

不要在页面组件里重新扫描 Markdown 或创建另一套搜索索引。品牌图来自 `assets/brand`，通过内容准备脚本进入静态目录。

404 通过主题的 `Error` 组件提供搜索、首页与常用文档入口，静态回退也使用同一组件；不要把错误页重定向到首页。SvelteKit 保持 `paths.relative: false`，让复制后的 `404.html` 在任意深度的错误地址下都能加载根路径 CSS 与交互代码。

## 分享卡片与 SEO

每页自动生成 1200×630 PNG，使用页面标题、描述、路径和共享吉祥物。布局维护在 `docs/scripts/social-template.html`，生成逻辑在 `social-images.mjs`；正文可通过 frontmatter `image` 自定义图片，并同时设置 `imageAlt`、`imageWidth`、`imageHeight`、`imageType`。自动图片写入忽略的 `docs/static/og`，不会修改原始 Markdown。

站点配置维护发布者、组织身份和品牌图标；svedocs 统一输出 canonical、中文语言标记、OG/Twitter 元信息、页面与面包屑结构化数据、sitemap 和 robots。首页的 `seoTitle` 可独立于视觉标题。错误页使用 `noindex, follow`，不出现在 sitemap 中。

## 检查与构建

```bash
pnpm docs:check
pnpm docs:build
pnpm --dir docs preview
pnpm --dir docs test:smoke
pnpm --dir docs test:seo
```

检查包含 Svelte/TypeScript 和 svedocs strict 内容验证。内容准备会生成每页的 PNG 分享卡片，需要可用的 Chrome 或 Playwright Chromium；可用 `CHROME_PATH` 指定浏览器路径。首次生成后按模板、文案和素材哈希复用图片。Linux CI 使用 `playwright install --with-deps chromium` 安装浏览器及含中文的字体依赖。浏览器冒烟需要 preview 服务已经运行。

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
