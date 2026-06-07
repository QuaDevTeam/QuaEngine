<script lang="ts">
  import type { ArtifactRef, ReviewFinding, WorkflowEvent } from '$lib/types'
  import { type InspectorTabId, type PlannerMessage } from '$lib/client/workspace'
  import InspectorTabs from './inspector/InspectorTabs.svelte'
  import PlannerChatPanel from './inspector/PlannerChatPanel.svelte'
  import ReferencesPanel from './inspector/ReferencesPanel.svelte'
  import ReviewFindingsPanel from './inspector/ReviewFindingsPanel.svelte'
  import RunLogPanel from './inspector/RunLogPanel.svelte'

  export let reviewFindings: ReviewFinding[]
  export let selectedArtifact: ArtifactRef | undefined
  export let visibleEvents: WorkflowEvent[]
  export let plannerMessages: PlannerMessage[]
  export let plannerInput = ''
  export let sendingMessage = false
  export let onSendPlannerMessage: () => void | Promise<void>

  let activeTab: InspectorTabId = 'chat'

  $: references = selectedArtifact?.references ?? []
  $: logEvents = visibleEvents.slice(-40).reverse()
  $: tabCounts = {
    chat: plannerMessages.length,
    review: reviewFindings.length,
    refs: references.length,
    log: 0,
  }
</script>

<aside class="inspector">
  <InspectorTabs bind:activeTab counts={tabCounts} />

  {#if activeTab === 'chat'}
    <PlannerChatPanel
      messages={plannerMessages}
      bind:plannerInput
      {sendingMessage}
      {onSendPlannerMessage}
    />
  {/if}

  {#if activeTab === 'review'}
    <ReviewFindingsPanel findings={reviewFindings} />
  {/if}

  {#if activeTab === 'refs'}
    <ReferencesPanel {references} />
  {/if}

  {#if activeTab === 'log'}
    <RunLogPanel events={logEvents} />
  {/if}
</aside>
