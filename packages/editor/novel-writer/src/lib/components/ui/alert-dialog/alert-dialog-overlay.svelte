<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: AlertDialogPrimitive.OverlayProps = $props()
</script>

<AlertDialogPrimitive.Overlay
  bind:ref
  data-slot="alert-dialog-overlay"
  class={cn('nw-alert-dialog-overlay', className)}
  {...restProps}
/>

<style>
  :global(.nw-alert-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: rgba(15, 18, 28, 0.48);
    backdrop-filter: blur(3px);
  }
</style>
