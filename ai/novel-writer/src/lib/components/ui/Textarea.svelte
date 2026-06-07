<script lang="ts">
  import { Textarea as ShadcnTextarea } from './textarea'

  export let value = ''
  export let placeholder = ''
  export let rows = 3
  export let disabled = false
  let className = ''
  export { className as class }
</script>

<ShadcnTextarea
  bind:value
  class={`nw-textarea ${className}`}
  {disabled}
  {placeholder}
  {rows}
/>

<style>
  :global(.nw-textarea) {
    width: 100%;
    min-height: unset;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font-size: 13px;
    line-height: 1.55;
    resize: vertical;
  }

  :global(.nw-textarea::placeholder) {
    color: var(--text-soft);
    font-size: 12.5px;
  }
</style>
