<script lang="ts">
  import { RootLayout } from 'svedocs/theme';
  import { createThemeContext, resolveLocaleCodeFromPath, resolveLocalizedHref } from 'svedocs/theme/headless';
  import type { SvedocsErrorProps } from 'svedocs/theme/types';
  import { ArrowLeft, ArrowUpRight, BookOpen, Search } from '@lucide/svelte';

  let { status = 500, path = '', config, pages = [], tree = [], search = [], loadSearch, themeComponents = {} }: SvedocsErrorProps = $props();
  const context = $derived(createThemeContext({ config, pages, tree, search, loadSearch, localeCode: resolveLocaleCodeFromPath(path, config) }));
  const title = $derived(context.t(status === 404 ? 'error.notFound.title' : 'error.generic.title'));
  const detail = $derived(context.t(status === 404 ? 'error.notFound.description' : 'error.generic.description'));
  const links = [
    { href: '/docs/getting-started/first-story', title: '写下第一幕', detail: '从对白开始，认识 QuaScript' },
    { href: '/docs/editor', title: '打开创作工具箱', detail: '剧本、角色与演出编排' },
    { href: '/docs/reference', title: '查阅参考手册', detail: '接口、配置与完整示例' }
  ];
</script>

<RootLayout {context} {config} {pages} {tree} {search} {loadSearch} {themeComponents}
  headTitle={`${status} · ${title} | QuaEngine`} headDescription={detail} headRobots="noindex, follow"
  mobileTree={context.tree} mobileCurrentPath={path}>
  <svelte:fragment slot="background"><div class="qua-atmosphere"><div class="qua-pattern"></div></div></svelte:fragment>
  <main id="content" class="qua-error">
    <div class="qua-error-story">
      <div class="qua-error-copy">
        <p class="qua-error-label">{status} / {status === 404 ? 'PAGE NOT FOUND' : 'SOMETHING WENT WRONG'}</p>
        <h1>{title}</h1>
        <p class="qua-error-description">{detail}</p>
        <div class="qua-error-actions">
          <a class="qua-error-primary" href={resolveLocalizedHref('/docs', context)}><BookOpen size={18} />{context.t('error.docs')}</a>
          <a href={resolveLocalizedHref('/', context)}><ArrowLeft size={17} />{context.t('error.home')}</a>
        </div>
        <button class="qua-error-search" onclick={() => window.dispatchEvent(new CustomEvent('svedocs:open-search'))}>
          <Search size={18} /><span>试试搜索文档、API 或指南</span><ArrowUpRight size={17} />
        </button>
      </div>
      <div class="qua-error-art" aria-hidden="true">
        <span class="qua-error-number">{status}</span>
        <div class="qua-error-sheet"><span></span><span></span><span></span><span></span></div>
        <img src="/brand/mascot.webp" alt="" width="360" height="360" />
      </div>
    </div>
    <nav class="qua-error-links" aria-label="继续探索">
      {#each links as link}
        <a href={resolveLocalizedHref(link.href, context)}><span><strong>{link.title}</strong><small>{link.detail}</small></span><ArrowUpRight size={19} /></a>
      {/each}
    </nav>
  </main>
</RootLayout>
