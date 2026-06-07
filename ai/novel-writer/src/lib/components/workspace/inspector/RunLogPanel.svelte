<script lang="ts">
  import { Activity } from 'lucide-svelte'
  import type { WorkflowEvent } from '$lib/types'
  import { eventLabel, eventTone, formatEventTime, workflowStageLabels } from '$lib/client/workspace'

  export let events: WorkflowEvent[]
</script>

<div class="inspector-panel">
  {#if events.length}
    <div class="inspector-scroll">
      <div class="timeline">
        {#each events as event}
          <div class="timeline-item">
            <span class="timeline-dot {eventTone(event)}"></span>
            <div class="timeline-copy">
              <div class="tl-head">
                <strong>{eventLabel(event)}</strong>
                <span class="soft small">{formatEventTime(event.timestamp)}</span>
              </div>
              <div class="tl-msg">{event.message}</div>
              {#if event.stage}
                <div class="tl-tags">
                  {workflowStageLabels[event.stage] ?? event.stage}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="inspector-empty">
      <Activity size={28} />
      <p>尚未运行，日志将在这里实时显示。</p>
    </div>
  {/if}
</div>
