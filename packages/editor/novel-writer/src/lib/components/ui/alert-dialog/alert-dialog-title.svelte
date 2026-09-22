<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: AlertDialogPrimitive.TitleProps = $props()
</script>

<AlertDialogPrimitive.Title
  bind:ref
  data-slot="alert-dialog-title"
  class={cn('nw-alert-dialog-title', className)}
  {...restProps}
>
  {@render children?.()}
</AlertDialogPrimitive.Title>

<style>
  :global(.nw-alert-dialog-title) {
    margin: 0;
    color: var(--text);
    font-size: 16px;
    font-weight: 750;
    line-height: 1.35;
  }
</style>
