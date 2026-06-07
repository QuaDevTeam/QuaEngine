<script lang="ts">
  import type { ArtifactRef, NovelProject, RunMode } from '$lib/types'
  import {
    extractOutlineChapters,
    type ApprovalAction,
    type StageTimelineItem,
  } from '$lib/client/workspace'
  import ArtifactViewer from './ArtifactViewer.svelte'
  import EmptyState from './EmptyState.svelte'
  import OutlineChapterNav from './OutlineChapterNav.svelte'
  import StageTimeline from './StageTimeline.svelte'
  import WorkbenchHeader from './WorkbenchHeader.svelte'

  export let selectedProject: NovelProject | undefined
  export let artifacts: ArtifactRef[]
  export let selectedArtifact: ArtifactRef | undefined
  export let selectedArtifactId = ''
  export let progress: number
  export let stageTimeline: StageTimelineItem[]
  export let artifactMarkdownEdit = ''
  export let reviewNote = ''
  export let pendingApprovalAction = ''
  export let running = false
  export let onRunProject: (mode: RunMode, chapterIndex?: number) => void | Promise<void>
  export let onSelectArtifact: (artifactId: string) => void
  export let onSubmitApproval: (action: ApprovalAction) => void | Promise<void>

  let selectedChapterIndex: number | null = null

  $: outlineArtifact = artifacts.find(a => a.stage === 'outline')
  $: outlineChapters = outlineArtifact ? extractOutlineChapters(outlineArtifact.markdown) : []

  $: showChapterNav = selectedProject?.currentStage === 'scene_writing' && outlineChapters.length > 0

  function handleRunChapter(chapterIndex: number) {
    selectedChapterIndex = chapterIndex
    onRunProject('step', chapterIndex)
  }
</script>

<main class="main-pane">
  <div class="main-scroll">
    <div class="main-inner">
      {#if selectedProject}
        <WorkbenchHeader project={selectedProject} {progress} {running} {onRunProject} />

        <section class="panel">
          <StageTimeline items={stageTimeline} {selectedArtifactId} {onSelectArtifact} />
        </section>

        {#if outlineChapters.length > 0 && (selectedArtifact?.stage === 'outline' || showChapterNav)}
          <OutlineChapterNav
            chapters={outlineChapters}
            activeChapterIndex={selectedChapterIndex}
            enabled={showChapterNav}
            onRunChapter={handleRunChapter}
          />
        {/if}

        {#if selectedArtifact}
          <ArtifactViewer
            {artifacts}
            {selectedArtifact}
            {selectedArtifactId}
            projectStatus={selectedProject.status}
            bind:artifactMarkdownEdit
            bind:reviewNote
            {pendingApprovalAction}
            {onSelectArtifact}
            {onSubmitApproval}
          />
        {:else}
          <EmptyState
            title="尚无产物"
            description="运行单步或 YOLO 后，这里会依次出现世界观、角色、故事背景、大纲、评审和正文。"
          />
        {/if}
      {:else}
        <EmptyState title="新建一个项目" description="点击左侧 + 按钮，填写标题和需求简介即可开始创作。" />
      {/if}
    </div>
  </div>
</main>
