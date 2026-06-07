<script lang="ts">
  import { ShieldCheck } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import type { ReviewFinding } from '$lib/types'
  import { findingInfo } from '$lib/client/workspace'

  export let findings: ReviewFinding[]
</script>

<div class="inspector-panel">
  {#if findings.length}
    <div class="inspector-scroll">
      {#each findings as finding}
        {@const info = findingInfo(finding.severity)}
        <div class="finding-card {finding.severity}">
          <Badge tone={info.tone} dot>{info.label}</Badge>
          <div class="finding-msg">{finding.message}</div>
          {#if finding.suggestion}
            <div class="finding-suggest">{finding.suggestion}</div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="inspector-empty">
      <ShieldCheck size={28} />
      <p>暂无评审意见。评审专家处理大纲后会在这里给出反馈。</p>
    </div>
  {/if}
</div>
