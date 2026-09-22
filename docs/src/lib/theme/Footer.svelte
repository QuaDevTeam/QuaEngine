<script lang="ts">
  import type { SvedocsFooterProps } from 'svedocs/theme/types';
  import { resolveLocalizedHref } from 'svedocs/theme/headless';
  let { context }: SvedocsFooterProps = $props();
</script>

<footer class="qua-footer">
  <div class="footer-brand"><span>QuaEngine <span aria-hidden="true">✦</span></span><p>每个好故事，都值得被看见。</p></div>
  <nav aria-label="页脚导航">
    <a href={resolveLocalizedHref('/docs', context)}>阅读文档</a>
    <a href={resolveLocalizedHref('/brand', context)}>品牌素材</a>
    <a href={resolveLocalizedHref('/docs/project/contributing', context)}>参与共建</a>
    <a href={resolveLocalizedHref('/docs/project/license', context)}>开源许可</a>
    <a href="https://github.com/QuaDevTeam">GitHub ↗</a>
  </nav>
  <div class="footer-bottom"><span>Made with care, by QuaDevTeam.</span><span>Built with Svelte & svedocs <span aria-hidden="true">♡</span></span></div>
</footer>
