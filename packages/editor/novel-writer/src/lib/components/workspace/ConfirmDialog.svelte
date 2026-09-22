<script lang="ts">
  import * as AlertDialog from '$components/ui/alert-dialog'
  import Button from '$components/ui/Button.svelte'

  export let open = false
  export let title = ''
  export let description = ''
  export let confirmLabel = '确认'
  export let cancelLabel = '取消'
  export let variant: 'default' | 'destructive' = 'default'
  export let busy = false
  export let onConfirm: () => void | Promise<void>
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <div class="confirm-dialog-copy">
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{description}</AlertDialog.Description>
    </div>

    <div class="confirm-dialog-actions">
      <AlertDialog.Cancel disabled={busy}>
        {cancelLabel}
      </AlertDialog.Cancel>
      <Button
        variant={variant === 'destructive' ? 'destructive' : 'default'}
        disabled={busy}
        onclick={() => void onConfirm()}
      >
        {confirmLabel}
      </Button>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .confirm-dialog-copy {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .confirm-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
</style>
