<script lang="ts">
  import { Check, ChevronDown, Circle, Clock, FileText, Loader2, RotateCcw, X } from 'lucide-svelte'
  import type { ChapterTimelineItem, StageTimelineItem } from '$lib/client/workspace'

  export let items: StageTimelineItem[]
  export let selectedArtifactId = ''
  export let viewingLive = false
  export let onSelectArtifact: (artifactId: string) => void
  export let onSelectLive: () => void

  let expandedStage: string | null = null

  function toggleHistory(stage: string, hasHistory: boolean) {
    if (!hasHistory) return
    expandedStage = expandedStage === stage ? null : stage
  }

  function nodeTitle(item: StageTimelineItem): string | undefined {
    if (item.dependencyLoopTargetLabel) {
      return `大纲需要新角色时回到${item.dependencyLoopTargetLabel}`
    }
    return item.loopTargetLabel ? `评审未通过时回到${item.loopTargetLabel}` : undefined
  }

  function chapterStateIcon(ch: ChapterTimelineItem) {
    if (ch.state === 'done') return 'done'
    if (ch.state === 'needs_review') return 'review'
    if (ch.state === 'running') return 'running'
    return 'pending'
  }

  function chapterSubLabel(ch: ChapterTimelineItem): string {
    if (ch.state === 'done') return '完成'
    if (ch.state === 'needs_review') return '待审'
    if (ch.state === 'running') {
      if (ch.currentSubStage === 'chapter_editing') return '润色中'
      if (ch.currentSubStage === 'chapter_supervision') return '监督中'
      return '写作中'
    }
    return ''
  }

  function chapterArtifactId(ch: ChapterTimelineItem): string {
    return ch.supervisionArtifact?.id || ch.editingArtifact?.id || ch.sceneArtifact?.id || ''
  }
</script>

<div class="stage-stepper" aria-label="创作流程">
  {#each items as item, index}
    {@const artifactId = item.artifact?.id || ''}
    {@const hasHistory = item.history.length > 1}
    {@const isExpanded = expandedStage === item.stage}
    {@const hasChapters = item.chapterItems && item.chapterItems.length > 0}

    <div class="stage-wrapper">
      {#if item.loopTargetLabel}
        <span class="stage-loop-connector" aria-hidden="true">
          <RotateCcw size={12} />
        </span>
      {/if}
      {#if item.dependencyLoopTargetLabel}
        <span
          class:stage-loop-connector--span-4={item.dependencyLoopSpan === 4}
          class="stage-loop-connector stage-loop-connector--dependency"
          aria-hidden="true"
        >
          <RotateCcw size={12} />
        </span>
      {/if}
      <button
        class:active={(artifactId && artifactId === selectedArtifactId && !isExpanded) || (item.state === 'running' && viewingLive && !hasChapters)}
        class:clickable={Boolean(artifactId) || item.state === 'running' || hasChapters}
        class:has-history={hasHistory || hasChapters}
        class="stage-node"
        type="button"
        title={nodeTitle(item)}
        disabled={!artifactId && item.state !== 'running' && !hasChapters}
        onclick={() => {
          if (hasChapters) {
            expandedStage = isExpanded ? null : item.stage
          } else if (hasHistory) {
            toggleHistory(item.stage, true)
          } else if (artifactId) {
            onSelectArtifact(artifactId)
          } else if (item.state === 'running') {
            onSelectLive()
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
          {#if hasHistory || hasChapters}
            <span class="history-chevron" class:rotated={isExpanded}>
              <ChevronDown size={12} />
            </span>
          {/if}
        </div>
        <div>
          <span class="stage-node-label">{item.label}</span>
          {#if item.chapterItems && item.chapterItems.length > 0}
            {@const done = item.chapterItems.filter(c => c.state === 'done').length}
            <span class="stage-node-sub">{done}/{item.chapterItems.length} 章</span>
          {:else if item.revisionLoop}
            <span class="stage-node-sub">第 {item.revisionLoop}/{item.maxRevisionLoops || '?'} 轮</span>
          {/if}
        </div>
      </button>

      {#if isExpanded && hasChapters}
        <div class="history-dropdown chapter-dropdown">
          {#each item.chapterItems! as ch}
            {@const aid = chapterArtifactId(ch)}
            {@const icon = chapterStateIcon(ch)}
            <button
              class="history-item chapter-item"
              class:active={aid && aid === selectedArtifactId}
              type="button"
              disabled={!aid && ch.state !== 'running'}
              onclick={() => {
                if (aid) {
                  onSelectArtifact(aid)
                  expandedStage = null
                } else if (ch.state === 'running') {
                  onSelectLive()
                  expandedStage = null
                }
              }}
            >
              <span class="chapter-dot" data-state={icon}>
                {#if icon === 'running'}
                  <Loader2 size={11} />
                {:else if icon === 'done'}
                  <Check size={11} />
                {:else if icon === 'review'}
                  <Clock size={11} />
                {:else}
                  <Circle size={10} />
                {/if}
              </span>
              <span class="history-title">{ch.title}</span>
              {#if chapterSubLabel(ch)}
                <span class="chapter-sub-label">{chapterSubLabel(ch)}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if isExpanded && hasHistory}
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
