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
          <div class="small muted reference-meta"><span>{ref.source}</span>{#if ref.score !== undefined}<span>相关度 {ref.score}</span>{/if}</div>
        </a>
      {/each}
    </div>
  {:else}
    <div class="inspector-empty">
      <div class="inspector-empty-content">
      <BookMarked size={28} />
      <p>该产物暂无搜索引用。</p>
      </div>
    </div>
  {/if}
</div>
