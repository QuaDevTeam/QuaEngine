<script lang="ts">
  import { Loader2, Radio, TriangleAlert } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import type { StageContentPreview, Tone } from '$lib/client/workspace'
  import { workflowStageLabels } from '$lib/client/workspace'
  import MarkdownPreview from './MarkdownPreview.svelte'

  export let liveContent: StageContentPreview

  let badgeTone: Tone

  $: stageLabel = liveContent.stage ? workflowStageLabels[liveContent.stage] : '当前阶段'
  $: badgeTone = liveContent.status === 'error' ? 'danger' : liveContent.status === 'done' ? 'success' : 'running'
  $: badgeLabel = liveContent.status === 'error' ? '流式中断' : liveContent.status === 'done' ? '生成完成' : '实时生成'
</script>

<section class="panel streaming-preview">
  <div class="streaming-preview-head">
    <div class="streaming-preview-title">
      {#if liveContent.status === 'error'}
        <TriangleAlert size={16} />
      {:else if liveContent.status === 'done'}
        <Radio size={16} />
      {:else}
        <Loader2 size={16} class="spin" />
      {/if}
      <h3>{stageLabel}</h3>
    </div>
    <Badge tone={badgeTone} dot>{badgeLabel}</Badge>
  </div>

  {#if liveContent.message}
    <p class="streaming-preview-message">{liveContent.message}</p>
  {/if}

  {#if liveContent.markdown.trim()}
    <MarkdownPreview markdown={liveContent.markdown} compact />
  {:else}
    <div class="streaming-preview-empty">正在建立模型输出流...</div>
  {/if}
</section>
