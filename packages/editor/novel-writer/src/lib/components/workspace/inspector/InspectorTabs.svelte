<script lang="ts">
  import { Activity, BookMarked, MessageSquare, ShieldCheck } from 'lucide-svelte'
  import type { InspectorTabId } from '$lib/client/workspace'

  export let activeTab: InspectorTabId = 'chat'
  export let counts: Record<InspectorTabId, number>

  const tabs: { id: InspectorTabId, label: string, icon: typeof MessageSquare }[] = [
    { id: 'chat', label: '对话', icon: MessageSquare },
    { id: 'review', label: '评审', icon: ShieldCheck },
    { id: 'refs', label: '引用', icon: BookMarked },
    { id: 'log', label: '日志', icon: Activity },
  ]
</script>

<div class="inspector-tabs" role="tablist">
  {#each tabs as tab}
    {@const Icon = tab.icon}
    <button
      class:active={activeTab === tab.id}
      class="inspector-tab"
      type="button"
      role="tab"
      onclick={() => (activeTab = tab.id)}
    >
      <Icon size={14} />
      {tab.label}
      {#if counts[tab.id]}
        <span class="tab-count">{counts[tab.id]}</span>
      {/if}
    </button>
  {/each}
</div>
