<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'
  import Overlay from './alert-dialog-overlay.svelte'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: AlertDialogPrimitive.ContentProps = $props()
</script>

<AlertDialogPrimitive.Portal>
  <Overlay />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    class={cn('nw-alert-dialog-content', className)}
    {...restProps}
  >
    {@render children?.()}
  </AlertDialogPrimitive.Content>
</AlertDialogPrimitive.Portal>

<style>
  :global(.nw-alert-dialog-content) {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 1201;
    width: min(420px, calc(100vw - 32px));
    transform: translate(-50%, -50%);
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lg);
  }

  :global(.nw-alert-dialog-content[data-state="open"]) {
    animation: nw-alert-dialog-in 120ms ease-out;
  }

  @keyframes nw-alert-dialog-in {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% - 4px)) scale(0.98);
    }

    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
