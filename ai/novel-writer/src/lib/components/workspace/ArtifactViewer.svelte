<script lang="ts">
  import { Code2, Eye } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import type { ArtifactRef, NovelProject } from '$lib/types'
  import {
    artifactStatusInfo,
    type ApprovalAction,
    type ArtifactViewMode,
  } from '$lib/client/workspace'
  import ArtifactReviewBar from './ArtifactReviewBar.svelte'
  import ArtifactStrip from './ArtifactStrip.svelte'
  import MarkdownPreview from './MarkdownPreview.svelte'

  export let artifacts: ArtifactRef[]
  export let selectedArtifact: ArtifactRef
  export let selectedArtifactId = ''
  export let projectStatus: NovelProject['status'] = 'idle'
  export let artifactMarkdownEdit = ''
  export let reviewNote = ''
  export let pendingApprovalAction = ''
  export let onSelectArtifact: (artifactId: string) => void
  export let onSubmitApproval: (action: ApprovalAction) => void | Promise<void>

  let viewMode: ArtifactViewMode = 'preview'

  $: artifactStatus = artifactStatusInfo(selectedArtifact.status)
  $: approvalDisabled = Boolean(pendingApprovalAction) || projectStatus === 'running'

  function resetEdit() {
    artifactMarkdownEdit = selectedArtifact.markdown
  }
</script>

<section class="panel">
  {#if artifacts.length}
    <div class="panel-head artifact-strip-head">
      <ArtifactStrip {artifacts} {selectedArtifactId} {onSelectArtifact} />
    </div>
  {/if}

  <div class="viewer-head">
    <div class="viewer-titles">
      <h3>{selectedArtifact.title}</h3>
    </div>
    <div class="row viewer-actions">
      <Badge tone={artifactStatus.tone} dot>{artifactStatus.label}</Badge>
      <div class="segmented" role="tablist">
        <button
          class:active={viewMode === 'preview'}
          type="button"
          onclick={() => (viewMode = 'preview')}
        >
          <Eye size={14} />预览
        </button>
        <button
          class:active={viewMode === 'edit'}
          type="button"
          onclick={() => (viewMode = 'edit')}
        >
          <Code2 size={14} />源文
        </button>
      </div>
    </div>
  </div>

  <div class="viewer-body">
    {#if viewMode === 'edit'}
      <textarea class="editor-textarea" bind:value={artifactMarkdownEdit}></textarea>
    {:else}
      <MarkdownPreview markdown={artifactMarkdownEdit} />
    {/if}
  </div>

  <ArtifactReviewBar
    {viewMode}
    bind:reviewNote
    disabled={approvalDisabled}
    onResetEdit={resetEdit}
    {onSubmitApproval}
  />
</section>
