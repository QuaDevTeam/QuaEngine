<script lang="ts">
  import { SearchDialog, ThemeToggle } from 'svedocs/theme';
  import { resolveLocalizedHref } from 'svedocs/theme/headless';
  import type { SvedocsNavbarProps } from 'svedocs/theme/types';
  import { CodeXml, Menu, X } from '@lucide/svelte';
  import Sidebar from './Sidebar.svelte';
  let { context, mobileTree = [], mobileCurrentPath = '', mobileMenuId = 'qua-menu', mobileMenuOpen = false, onToggleMobileMenu, onCloseMobileMenu }: SvedocsNavbarProps = $props();
</script>

<header class="qua-header">
  <div class="qua-nav">
    <a class="qua-brand" href={resolveLocalizedHref('/', context)} aria-label="QuaEngine 首页">
      <img src="/brand/avatar-96.webp" alt="" width="40" height="40" />
      <span>Qua<span class="brand-soft">Engine</span><span class="brand-star" aria-hidden="true">✦</span></span>
    </a>
    <nav class="qua-desktop-nav" aria-label="主导航">
      {#each context.config.theme.nav as item}
        <a href={resolveLocalizedHref(item.href, context)} class:active={context.page?.routePath === item.href || (item.href !== '/docs' && context.page?.routePath.startsWith(item.href + '/'))}>{item.label}</a>
      {/each}
    </nav>
    <div class="qua-nav-tools">
      <SearchDialog records={context.search} loadRecords={context.loadSearch} scope={context.searchScope} provider={context.config.search.provider} buildMode={context.config.build.mode} {context} />
      <span class="nav-divider" aria-hidden="true"></span>
      <ThemeToggle defaultMode={context.config.theme.defaultMode} {context} />
      <a class="icon-button github-link" href="https://github.com/QuaDevTeam/QuaEngine" aria-label="GitHub 源码"><CodeXml size={19} /></a>
      <button class="icon-button qua-menu-toggle" onclick={onToggleMobileMenu} aria-expanded={mobileMenuOpen} aria-controls={mobileMenuId} aria-label={mobileMenuOpen ? context.t('nav.mobile.close') : context.t('nav.mobile.open')}>
        {#if mobileMenuOpen}<X size={22} />{:else}<Menu size={22} />{/if}
      </button>
    </div>
  </div>
  {#if mobileMenuOpen}
    <div id={mobileMenuId} class="qua-mobile-menu">
      <nav aria-label="移动导航">
        {#each context.config.theme.nav as item}<a onclick={onCloseMobileMenu} class="mobile-top-link" href={resolveLocalizedHref(item.href, context)}>{item.label}</a>{/each}
        {#if mobileTree.length}<Sidebar items={mobileTree} currentPath={mobileCurrentPath} />{/if}
      </nav>
    </div>
  {/if}
</header>
