<script lang="ts">
  import { contextBlocks, type ContextListItem } from '$lib/client/context-document'
  let { markdown }: { markdown: string } = $props()
  const blocks = $derived(contextBlocks(markdown))
</script>

{#snippet inline(text: string)}
  {#each text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g) as part}
    {#if part.startsWith('**') && part.endsWith('**')}<strong>{part.slice(2, -2)}</strong>
    {:else if part.startsWith('`') && part.endsWith('`')}<code>{part.slice(1, -1)}</code>
    {:else}{part}{/if}
  {/each}
{/snippet}

{#snippet list(items: ContextListItem[], ordered = false)}
  <svelte:element this={ordered ? 'ol' : 'ul'}>
    {#each items as item}
      <li>{@render inline(item.text)}{#if item.children.length}{@render list(item.children)}{/if}</li>
    {/each}
  </svelte:element>
{/snippet}

<article class="context-document">
  {#each blocks as block}
    {#if block.type === 'heading'}
      <svelte:element this={`h${Math.min(block.level + 1, 6)}`}>{@render inline(block.text)}</svelte:element>
    {:else if block.type === 'list'}{@render list(block.items, block.ordered)}
    {:else if block.type === 'quote'}<blockquote>{@render inline(block.text)}</blockquote>
    {:else if block.type === 'code'}<pre><code>{block.text}</code></pre>
    {:else}<p>{@render inline(block.text)}</p>{/if}
  {/each}
</article>
