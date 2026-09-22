<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: AlertDialogPrimitive.CancelProps = $props()
</script>

<AlertDialogPrimitive.Cancel
  bind:ref
  data-slot="alert-dialog-cancel"
  class={cn('nw-alert-dialog-cancel', className)}
  {...restProps}
>
  {@render children?.()}
</AlertDialogPrimitive.Cancel>

<style>
  :global(.nw-alert-dialog-cancel) {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      opacity 120ms ease;
  }

  :global(.nw-alert-dialog-cancel:hover:not(:disabled)) {
    border-color: var(--border-strong);
    background: var(--surface-muted);
  }

  :global(.nw-alert-dialog-cancel:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
