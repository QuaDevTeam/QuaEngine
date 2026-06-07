<script lang="ts">
  import { Play, Zap } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import Button from '$components/ui/Button.svelte'
  import type { NovelProject, RunMode } from '$lib/types'
  import { projectStatusInfo, workflowStageLabels } from '$lib/client/workspace'

  export let project: NovelProject
  export let progress: number
  export let running = false
  export let onRunProject: (mode: RunMode) => void | Promise<void>

  $: runDisabled = running || project.status === 'running'
  $: projectStatus = projectStatusInfo(project.status)
</script>

<section class="workbench-header">
  <div class="workbench-top">
    <div class="workbench-heading">
      <h2>{project.title}</h2>
      <p class="workbench-brief">{project.brief}</p>
      <div class="workbench-badges">
        <Badge tone={projectStatus.tone} dot>{projectStatus.label}</Badge>
        {#if project.currentStage}
          <Badge tone="neutral">{workflowStageLabels[project.currentStage]}</Badge>
        {/if}
      </div>
    </div>
    <div class="run-actions">
      <Button onclick={() => onRunProject('step')} disabled={runDisabled}>
        <Play size={15} />单步
      </Button>
      <Button variant="secondary" onclick={() => onRunProject('yolo')} disabled={runDisabled}>
        <Zap size={15} />YOLO
      </Button>
    </div>
  </div>
  <div class="progress-block">
    <div class="progress-meta">
      <span>生成进度</span>
      <b>{progress}%</b>
    </div>
    <div class="progress-track" aria-label="生成进度" title="{progress}%">
      <div class="progress-fill" style="width:{progress}%"></div>
    </div>
  </div>
</section>
