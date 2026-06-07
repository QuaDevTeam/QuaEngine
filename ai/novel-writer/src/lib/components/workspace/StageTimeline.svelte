<script lang="ts">
  import { Check, ChevronDown, Circle, Clock, FileText, Loader2, X } from 'lucide-svelte'
  import type { StageTimelineItem } from '$lib/client/workspace'

  export let items: StageTimelineItem[]
  export let selectedArtifactId = ''
  export let onSelectArtifact: (artifactId: string) => void

  let expandedStage: string | null = null

  function toggleHistory(stage: string, hasHistory: boolean) {
    if (!hasHistory) return
    expandedStage = expandedStage === stage ? null : stage
  }
</script>

<div class="stage-stepper" aria-label="创作流程">
  {#each items as item, index}
    {@const artifactId = item.artifact?.id || ''}
    {@const hasHistory = item.history.length > 1}
    {@const isExpanded = expandedStage === item.stage}

    <div class="stage-wrapper">
      <button
        class:active={artifactId && artifactId === selectedArtifactId && !isExpanded}
        class:clickable={Boolean(artifactId)}
        class:has-history={hasHistory}
        class="stage-node"
        type="button"
        disabled={!artifactId}
        onclick={() => {
          if (hasHistory) {
            toggleHistory(item.stage, true)
          } else if (artifactId) {
            onSelectArtifact(artifactId)
          }
        }}
      >
        <div class="stage-node-top">
          <span class="stage-dot" data-state={item.state}>
            {#if item.state === 'running'}
              <Loader2 size={14} />
            {:else if item.state === 'approved' || item.state === 'draft'}
              <Check size={14} />
            {:else if item.state === 'needs_review'}
              <Clock size={14} />
            {:else if item.state === 'rejected'}
              <X size={14} />
            {:else if artifactId}
              <FileText size={14} />
            {:else}
              <Circle size={13} />
            {/if}
          </span>
          <span class="stage-num">{String(index + 1).padStart(2, '0')}</span>
          {#if hasHistory}
            <span class="history-chevron" class:rotated={isExpanded}>
              <ChevronDown size={12} />
            </span>
          {/if}
        </div>
        <div>
          <span class="stage-node-label">{item.label}</span>
        </div>
      </button>

      {#if isExpanded && hasHistory}
        <div class="history-dropdown">
          {#each item.history as artifact, historyIndex}
            <button
              class="history-item"
              class:active={artifact.id === selectedArtifactId}
              type="button"
              onclick={() => {
                onSelectArtifact(artifact.id)
                expandedStage = null
              }}
            >
              <span class="history-label">v{item.history.length - historyIndex}</span>
              <span class="history-title">{artifact.title}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
