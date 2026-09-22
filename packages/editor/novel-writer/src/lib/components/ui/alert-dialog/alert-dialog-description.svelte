<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: AlertDialogPrimitive.DescriptionProps = $props()
</script>

<AlertDialogPrimitive.Description
  bind:ref
  data-slot="alert-dialog-description"
  class={cn('nw-alert-dialog-description', className)}
  {...restProps}
>
  {@render children?.()}
</AlertDialogPrimitive.Description>

<style>
  :global(.nw-alert-dialog-description) {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }
</style>
