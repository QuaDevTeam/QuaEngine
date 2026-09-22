<script lang="ts">
  import { Check, Download, Play, RotateCcw, Zap } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import Button from '$components/ui/Button.svelte'
  import type { NovelProject, RunMode } from '$lib/types'
  import { projectStatusInfo, workflowStageLabels } from '$lib/client/workspace'

  export let project: NovelProject
  export let progress: number
  export let running = false
  export let exporting = false
  export let resetting = false
  export let awaitingApproval = false
  export let approving = false
  export let completedArtifactCount = 0
  export let onRunProject: (mode: RunMode) => void | Promise<void>
  export let onExportProject: () => void | Promise<void>
  export let onResetProject: () => void | Promise<void>
  export let onApproveProject: () => void | Promise<void>

  $: runDisabled = running || project.status === 'running'
  $: approveDisabled = running || approving || !awaitingApproval
  $: yoloDisabled = runDisabled
  $: exportDisabled = runDisabled || exporting || completedArtifactCount === 0
  $: resetDisabled = runDisabled || resetting
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
      <Button
        variant="secondary"
        onclick={onExportProject}
        disabled={exportDisabled}
        title={completedArtifactCount === 0 ? '暂无已完成内容' : '导出'}
      >
        <Download size={15} />{exporting ? '导出中' : '导出'}
      </Button>
      <Button
        variant="secondary"
        onclick={onResetProject}
        disabled={resetDisabled}
        title="清空项目运行数据并重新开始"
      >
        <RotateCcw size={15} />{resetting ? '重置中' : '重置'}
      </Button>
      {#if awaitingApproval}
        <Button onclick={onApproveProject} disabled={approveDisabled}>
          <Check size={15} />{approving ? '通过中' : '通过'}
        </Button>
      {:else}
        <Button onclick={() => onRunProject('step')} disabled={runDisabled}>
          <Play size={15} />单步
        </Button>
      {/if}
      <Button variant="secondary" onclick={() => onRunProject('yolo')} disabled={yoloDisabled}>
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
