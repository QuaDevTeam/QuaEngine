<script lang="ts">
  import { SidebarTree } from 'svedocs/theme';
  import type { SvedocsSidebarProps } from 'svedocs/theme/types';
  let { items = [], currentPath = '', depth = 0 }: SvedocsSidebarProps = $props();
</script>

<div class="qua-sidebar-tree">
  <SidebarTree {items} {currentPath} {depth} />
</div>
