import { defineConfig } from 'svedocs/config';
import { quaCodeBlocks, quaCodeThemes } from './src/lib/markdown/qua-code.ts';
import { quaTables } from './src/lib/markdown/qua-tables.ts';

export default defineConfig({
  site: {
    name: 'QuaEngine',
    title: 'QuaEngine — 让故事，在这里发生',
    description: '用 QuaScript 写下对白，用 TypeScript 连接世界。面向视觉小说创作者的开源引擎、编辑器与完整文档。',
    url: process.env.DOCS_SITE_URL ?? 'https://quaengine.com'
  },
  content: { root: '.generated/content' },
  build: { mode: 'static' },
  markdown: { rehypePlugins: [quaCodeBlocks, quaTables] },
  theme: {
    defaultMode: 'system',
    palette: { accent: '#ba5676', neutral: '#65585d' },
    fonts: { sans: 'Nunito Variable, ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif', mono: '"SFMono-Regular", Consolas, monospace', display: 'Nunito Variable, ui-rounded, "PingFang SC", sans-serif' },
    radius: '16px',
    codeTheme: quaCodeThemes,
    code: { copyButton: true, lineNumbers: false, wrap: false },
    brand: { label: 'QuaEngine', href: '/', mark: false, logo: '/brand/quaengine-icon.png' },
    nav: [
      { label: '文档', href: '/docs' },
      { label: '创作工具', href: '/docs/editor' },
      { label: '参考手册', href: '/docs/reference' },
      { label: '项目进展', href: '/docs/project/status' }
    ],
    social: [{ label: 'GitHub', href: 'https://github.com/QuaDevTeam/QuaEngine', external: true }],
    footer: { text: 'Made with care, by QuaDevTeam.' }
  },
  i18n: { defaultLocale: 'zh', locales: [{ code: 'zh', label: '简体中文', hreflang: 'zh-CN' }], messages: { zh: {
    'search.placeholder': '搜索文档、API、指南…',
    'home.primaryAction': '开始创作',
    'nav.documentation': '文档导航',
    'nav.primary': '主导航', 'nav.docs': '文档', 'nav.footer': '页脚', 'nav.social': '社区',
    'nav.mobile.open': '打开导航', 'nav.mobile.close': '关闭导航', 'nav.skipToContent': '跳到正文',
    'scope.group': '文档范围', 'scope.locale': '语言', 'scope.localeOptions': '选择语言', 'scope.langShort': '语言',
    'search.trigger': '搜索', 'search.dialog': '搜索文档', 'search.query': '搜索关键词',
    'search.results': '搜索结果', 'search.loading': '正在搜索…', 'search.loadingIndex': '正在载入搜索索引…',
    'search.indexError': '搜索索引加载失败，请重试。', 'search.empty': '没有找到相关内容，试试其他关键词。',
    'search.failed': '搜索失败，请重试。', 'search.requestError': '搜索返回错误 {status}。',
    'toc.label': '本页目录', 'heading.anchor': '复制本节链接',
    'article.kind.doc': '文档', 'article.kind.page': '页面', 'article.breadcrumb': '当前位置',
    'article.updated': '更新于 {date}', 'article.edit': '改进本页', 'article.previous': '上一页', 'article.next': '下一页',
    'code.copy': '复制代码', 'code.copied': '已复制', 'code.copyDiff': '复制差异',
    'tools.label': '阅读工具', 'tools.backToTop': '返回顶部',
    'theme.switch': '切换为{mode}主题', 'theme.light': '浅色', 'theme.dark': '深色',
    'error.notFound.title': '这一页，还没有写下', 'error.notFound.description': '可能是地址有误，也可能故事已经搬到了别处。回到文档继续寻找吧。',
    'error.generic.title': '页面暂时无法打开', 'error.generic.description': '请刷新重试，或通过导航继续阅读。',
    'error.status': '错误 {status}', 'error.home': '返回首页', 'error.docs': '阅读文档',
    'render.label': '显示异常', 'render.title': '这部分内容暂时无法显示', 'render.message': '你可以重试，或继续阅读其他内容。',
    'render.details': '错误详情', 'render.tryAgain': '重试', 'render.reload': '刷新页面', 'render.docsHome': '文档首页'
  } } },
  search: { enabled: true, provider: 'local', scope: 'all' },
  ai: false,
  seo: { ogImage: false, sitemap: true, robots: true },
  checks: { assets: true, externalLinks: false }
});
