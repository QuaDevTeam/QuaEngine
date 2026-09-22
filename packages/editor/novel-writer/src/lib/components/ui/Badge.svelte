<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Badge as ShadcnBadge } from './badge'

  type Props = {
    tone?: 'neutral' | 'running' | 'success' | 'warning' | 'danger'
    /** Show a leading status dot. Use for state badges. */
    dot?: boolean
    class?: string
    children?: Snippet
  }

  let { tone = 'neutral', dot = false, class: className = '', children }: Props = $props()
</script>

<ShadcnBadge
  class={`nw-badge ${dot ? 'nw-badge-dot' : ''} ${className}`}
  data-tone={tone}
  variant="outline"
>
  {#if dot}
    <span class="nw-badge-marker"></span>
  {/if}
  {@render children?.()}
</ShadcnBadge>

<style>
  :global(.nw-badge) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-muted);
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.005em;
    white-space: nowrap;
  }

  :global(.nw-badge-marker) {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: currentColor;
    flex-shrink: 0;
  }

  :global(.nw-badge[data-tone='running']) {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent-strong);
  }

  :global(.nw-badge[data-tone='success']) {
    border-color: transparent;
    background: var(--success-soft);
    color: var(--success);
  }

  :global(.nw-badge[data-tone='warning']) {
    border-color: transparent;
    background: var(--warning-soft);
    color: var(--warning);
  }

  :global(.nw-badge[data-tone='danger']) {
    border-color: transparent;
    background: var(--danger-soft);
    color: var(--danger);
  }
</style>
