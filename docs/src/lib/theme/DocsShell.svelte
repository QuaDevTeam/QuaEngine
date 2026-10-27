<script lang="ts">
  import { Article, TableOfContents } from 'svedocs/theme';
  import type { SvedocsDocsShellProps } from 'svedocs/theme/types';
  import { resolveLocalizedHref } from 'svedocs/theme/headless';
  import { BookOpen, ArrowUpRight } from '@lucide/svelte';
  import Sidebar from './Sidebar.svelte';
  let { page, navigationTree = [], content, context, tocController, themeComponents = {} }: SvedocsDocsShellProps = $props();
  const sourceUrl = $derived(typeof page.frontmatter.source === 'string' ? `https://github.com/QuaDevTeam/QuaEngine/blob/main/${page.frontmatter.source}` : undefined);
</script>

<div class="qua-docs-shell">
  <aside class="qua-docs-sidebar" aria-label={context.t('nav.documentation')}>
    <a class="sidebar-home" href={resolveLocalizedHref('/docs', context)}><BookOpen size={17} /> {context.t('qua.handbook')} <span>0.1</span></a>
    <nav><Sidebar items={navigationTree} currentPath={page.routePath} /></nav>
    <a class="sidebar-note" href={resolveLocalizedHref('/docs/getting-started/first-story', context)}><span aria-hidden="true">✦</span> {context.t('qua.firstStory')} <ArrowUpRight size={14} /></a>
  </aside>
  <main id="content" class="qua-docs-main">
    <Article {page} {content} {context} {themeComponents} />
    {#if sourceUrl}<a class="qua-source-link" href={sourceUrl}>{context.t('qua.editSource')} <ArrowUpRight size={14} /></a>{/if}
  </main>
  <div class="qua-docs-toc"><TableOfContents {page} controller={tocController} {context} /></div>
</div>
