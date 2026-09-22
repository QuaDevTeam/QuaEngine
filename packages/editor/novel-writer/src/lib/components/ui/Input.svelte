<script lang="ts">
  import { Input as ShadcnInput } from './input'

  export let value = ''
  export let placeholder = ''
  export let type = 'text'
  export let disabled = false
  let className = ''
  export { className as class }
</script>

<ShadcnInput
  bind:value
  class={`nw-input ${className}`}
  {disabled}
  {placeholder}
  {type}
/>

<style>
  :global(.nw-input) {
    width: 100%;
    min-height: 38px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
  }

  :global(.nw-input:disabled) {
    background: var(--surface-muted);
    color: var(--text-muted);
  }
</style>
