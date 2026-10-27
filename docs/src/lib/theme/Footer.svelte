<script lang="ts">
  import type { SvedocsFooterProps } from 'svedocs/theme/types';
  import { resolveLocalizedHref } from 'svedocs/theme/headless';
  let { context }: SvedocsFooterProps = $props();
</script>

<footer class="qua-footer">
  <div class="footer-brand"><span>QuaEngine</span><p>{context.t('qua.footer.tagline')}</p></div>
  <nav aria-label={context.t('nav.footer')}>
    <a href={resolveLocalizedHref('/docs', context)}>{context.t('qua.footer.docs')}</a>
    <a href={resolveLocalizedHref('/brand', context)}>{context.t('qua.footer.brand')}</a>
    <a href={resolveLocalizedHref('/docs/project/contributing', context)}>{context.t('qua.footer.contribute')}</a>
    <a href={resolveLocalizedHref('/docs/project/license', context)}>{context.t('qua.footer.license')}</a>
    <a href="https://github.com/QuaDevTeam">GitHub ↗</a>
  </nav>
  <div class="footer-bottom"><span>Made with care, by QuaDevTeam.</span><span>Built with Svelte & svedocs <span aria-hidden="true">♡</span></span></div>
</footer>
