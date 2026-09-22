<script lang="ts">
  import { Switch as ShadcnSwitch } from './switch'

  type Props = {
    checked?: boolean
    disabled?: boolean
    id?: string
    size?: 'sm' | 'default'
    type?: 'button' | 'submit' | 'reset'
    class?: string
    'aria-label'?: string
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id,
    size = 'default',
    type = 'button',
    class: className = '',
    'aria-label': ariaLabel,
  }: Props = $props()
</script>

<ShadcnSwitch
  bind:checked
  class={`nw-switch ${className}`}
  {disabled}
  {id}
  {size}
  {type}
  aria-label={ariaLabel}
/>

<style>
  :global(.nw-switch) {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    width: 34px;
    height: 20px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--border-strong);
    cursor: pointer;
    transition:
      background 120ms ease,
      box-shadow 120ms ease,
      opacity 120ms ease;
  }

  :global(.nw-switch[data-size="sm"]) {
    width: 28px;
    height: 16px;
  }

  :global(.nw-switch[data-state="checked"]),
  :global(.nw-switch[data-checked]),
  :global(.nw-switch[aria-checked="true"]) {
    background: var(--accent);
  }

  :global(.nw-switch[data-disabled]) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  :global(.nw-switch [data-slot="switch-thumb"]) {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
    transform: translateX(1px);
    transition: transform 120ms ease;
  }

  :global(.nw-switch[data-size="sm"] [data-slot="switch-thumb"]) {
    width: 12px;
    height: 12px;
  }

  :global(.nw-switch[data-state="checked"] [data-slot="switch-thumb"]),
  :global(.nw-switch[data-checked] [data-slot="switch-thumb"]),
  :global(.nw-switch[aria-checked="true"] [data-slot="switch-thumb"]) {
    transform: translateX(15px);
  }

  :global(.nw-switch[data-size="sm"][data-state="checked"] [data-slot="switch-thumb"]),
  :global(.nw-switch[data-size="sm"][data-checked] [data-slot="switch-thumb"]),
  :global(.nw-switch[data-size="sm"][aria-checked="true"] [data-slot="switch-thumb"]) {
    transform: translateX(13px);
  }
</style>
