<script lang="ts">
  import { BookOpen } from 'lucide-svelte'
  import type { OutlineChapter } from '$lib/client/workspace'

  export let chapters: OutlineChapter[]
  export let activeChapterIndex: number | null = null
  export let enabled = false
  export let onRunChapter: (chapterIndex: number) => void | Promise<void>
</script>

<section class="panel">
  <div class="panel-head">
    <div class="panel-head-titles">
      <h3 class="panel-title">
        <BookOpen size={16} />
        章节大纲
      </h3>
    </div>
  </div>
  <div class="chapter-nav">
    {#each chapters as chapter}
      <button
        class="chapter-nav-item"
        class:active={activeChapterIndex === chapter.index}
        type="button"
        disabled={!enabled}
        onclick={() => enabled && onRunChapter(chapter.index)}
      >
        <span class="chapter-nav-num">{chapter.index + 1}</span>
        <span class="chapter-nav-title">{chapter.title}</span>
      </button>
    {/each}
  </div>
</section>
