<script lang="ts">
  import { FileCode2, ListMinus } from 'lucide-svelte'
  import { writingDiff } from '$lib/client/writing-diff'
  import Button from '$components/ui/Button.svelte'

  let { before, after }: { before: string, after: string } = $props()
  let full = $state(false)
  const diff = $derived(writingDiff(before, after))
</script>

<div class="writing-diff">
  <div class="writing-diff-toolbar">
    <span class="writing-diff-counts"><span class="writing-added">+{diff.added}</span><span class="writing-removed">−{diff.removed}</span><span>行</span></span>
    <Button variant="ghost" size="sm" onclick={() => full = !full}>
      {#if full}<ListMinus size={14} />只看修改{:else}<FileCode2 size={14} />完整文件{/if}
    </Button>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the diff independently.) -->
  <div class="writing-diff-scroll" tabindex="0" role="region" aria-label="QS 修改预览">
    {#if full}
      <pre class="writing-full-source">{after}</pre>
    {:else}
      <table class="writing-diff-lines" aria-label="源码差异">
        <tbody>
          {#each diff.rows as line}
            <tr class:writing-line-added={line.kind === 'added'} class:writing-line-removed={line.kind === 'removed'} class:writing-line-gap={line.kind === 'gap'}>
              <td class="writing-line-number">{line.before ?? ''}</td>
              <td class="writing-line-number">{line.after ?? ''}</td>
              <td class="writing-line-sign">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ''}</td>
              <td class="writing-line-code">{line.text || ' '}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if diff.truncated}<p class="writing-diff-limit">修改较多，已显示前 2,000 行。可切换到完整文件查看。</p>{/if}
      {#if !diff.added && !diff.removed}<p class="writing-diff-limit">内容与原文件一致。</p>{/if}
    {/if}
  </div>
</div>
