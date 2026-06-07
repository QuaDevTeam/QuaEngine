<script lang="ts">
  import { Check, Pencil, RefreshCw, RotateCcw } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import Textarea from '$components/ui/Textarea.svelte'
  import type { ApprovalAction, ArtifactViewMode } from '$lib/client/workspace'

  export let viewMode: ArtifactViewMode = 'preview'
  export let reviewNote = ''
  export let disabled = false
  export let onResetEdit: () => void
  export let onSubmitApproval: (action: ApprovalAction) => void | Promise<void>
</script>

<div class="review-bar">
  <div class="split-row">
    <span class="section-label">评审与确认</span>
    {#if viewMode === 'edit'}
      <Button size="sm" variant="ghost" onclick={onResetEdit}>
        <RotateCcw size={13} />还原
      </Button>
    {/if}
  </div>
  <Textarea bind:value={reviewNote} rows={2} placeholder="评审备注（可选）" />
  <div class="review-actions">
    <Button size="sm" onclick={() => onSubmitApproval('approve')} disabled={disabled}>
      <Check size={14} />通过
    </Button>
    <Button size="sm" variant="secondary" onclick={() => onSubmitApproval('manual_edit')} disabled={disabled}>
      <Pencil size={14} />保存修改
    </Button>
    <Button size="sm" variant="secondary" onclick={() => onSubmitApproval('request_changes')} disabled={disabled}>
      要求修改
    </Button>
    <Button size="sm" variant="secondary" onclick={() => onSubmitApproval('regenerate')} disabled={disabled}>
      <RefreshCw size={14} />重生成
    </Button>
  </div>
</div>
