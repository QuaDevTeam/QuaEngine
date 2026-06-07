<script lang="ts">
  import { BookMarked } from 'lucide-svelte'
  import type { SearchReference } from '$lib/types'

  export let references: SearchReference[]
</script>

<div class="inspector-panel">
  {#if references.length}
    <div class="inspector-scroll">
      {#each references as ref}
        <a class="reference-item" href={ref.url} target="_blank" rel="noreferrer">
          <strong>{ref.title}</strong>
          <div class="small muted reference-meta">{ref.source} · {ref.score ?? 'n/a'}</div>
        </a>
      {/each}
    </div>
  {:else}
    <div class="inspector-empty">
      <BookMarked size={28} />
      <p>该产物暂无搜索引用。</p>
    </div>
  {/if}
</div>
