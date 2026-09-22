<script lang="ts">
  import { Article, TableOfContents } from 'svedocs/theme';
  import type { SvedocsDocsShellProps } from 'svedocs/theme/types';
  import { BookOpen, ArrowUpRight } from '@lucide/svelte';
  import Sidebar from './Sidebar.svelte';
  let { page, navigationTree = [], content, context, tocController, themeComponents = {} }: SvedocsDocsShellProps = $props();
  const sourceUrl = $derived(typeof page.frontmatter.source === 'string' ? `https://github.com/QuaDevTeam/QuaEngine/blob/main/${page.frontmatter.source}` : undefined);
</script>

<div class="qua-docs-shell">
  <aside class="qua-docs-sidebar" aria-label={context.t('nav.documentation')}>
    <a class="sidebar-home" href="/docs"><BookOpen size={17} /> 创作者手册 <span>0.1</span></a>
    <nav><Sidebar items={navigationTree} currentPath={page.routePath} /></nav>
    <a class="sidebar-note" href="/docs/getting-started/first-story"><span aria-hidden="true">✦</span> 从第一句对白开始 <ArrowUpRight size={14} /></a>
  </aside>
  <main id="content" class="qua-docs-main">
    <Article {page} {content} {context} {themeComponents} />
    {#if sourceUrl}<a class="qua-source-link" href={sourceUrl}>在 GitHub 查看 / 改进本页来源 <ArrowUpRight size={14} /></a>{/if}
  </main>
  <div class="qua-docs-toc"><TableOfContents {page} controller={tocController} {context} /></div>
</div>
