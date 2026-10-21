<script lang="ts">
  import ErrorPage from '$lib/theme/Error.svelte';
  import config from 'virtual:svedocs/config';
  import pages from 'virtual:svedocs/page-index';
  import tree from 'virtual:svedocs/tree';
  import loadSearch from 'virtual:svedocs/search-loader';
  import themeComponents from 'virtual:svedocs/theme-components';
</script>

<ErrorPage status={404} {config} {pages} {tree} {loadSearch} {themeComponents} />
