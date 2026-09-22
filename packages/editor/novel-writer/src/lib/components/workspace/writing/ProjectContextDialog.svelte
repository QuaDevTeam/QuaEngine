<script lang="ts">
  import type { EditorWritingController } from '$lib/client/editor-writing.svelte'
  import type { createWorkspaceController } from '$lib/client/workspace-controller.svelte'
  import { FolderOpen, Link2, RefreshCw, X } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import ContextDocument from './ContextDocument.svelte'

  let { writing, workspace }: { writing: EditorWritingController, workspace: ReturnType<typeof createWorkspaceController> } = $props()
  let dialog: HTMLDialogElement
  let section = $state<'outline' | 'worldbuilding' | 'characters'>('outline')
  const tabs = [{ id: 'outline', label: '故事大纲' }, { id: 'worldbuilding', label: '故事背景' }, { id: 'characters', label: '角色设定' }] as const
  export function open() { dialog.showModal() }
</script>

<dialog bind:this={dialog} class="writing-dialog writing-context-dialog" aria-labelledby="writing-context-title">
  <div class="writing-dialog-layout">
    <header class="writing-dialog-header">
      <FolderOpen size={18} />
      <div class="writing-dialog-title"><h2 id="writing-context-title">项目资料</h2></div>
      <Button size="icon" variant="ghost" aria-label="刷新项目资料" title="刷新项目资料" disabled={writing.busy} onclick={() => writing.action(writing.refresh)}><RefreshCw size={15} /></Button>
      <Button size="icon" variant="ghost" aria-label="关闭项目资料" onclick={() => dialog.close()}><X size={17} /></Button>
    </header>
    <div class="writing-tabs" role="tablist" aria-label="项目资料分类">
      {#each tabs as tab, index}
        <button type="button" role="tab" id={`context-tab-${tab.id}`} aria-selected={section === tab.id} aria-controls="writing-context-content" tabindex={section === tab.id ? 0 : -1} class:active={section === tab.id}
          onclick={() => section = tab.id} onkeydown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
            section = tabs[next].id
            document.getElementById(`context-tab-${section}`)?.focus()
          }}>{tab.label}</button>
      {/each}
    </div>
    <div class="writing-context-content" id="writing-context-content" role="tabpanel" aria-labelledby={`context-tab-${section}`} tabindex="0">
      {#if writing.context?.[section]}<ContextDocument markdown={writing.context[section]} />
      {:else}<p class="writing-empty-copy">暂无{tabs.find(tab => tab.id === section)?.label}</p>{/if}
    </div>
    {#if writing.context?.warnings.length}
      <details class="writing-context-notes"><summary>提取提示（{writing.context.warnings.length}）</summary><ul>{#each writing.context.warnings as warning}<li>{warning}</li>{/each}</ul></details>
    {/if}
    {#if writing.error}<p class="writing-error" role="alert">{writing.error}</p>{/if}
    {#if workspace.selectedProject}
    <footer class="writing-dialog-footer">
      {#if writing.mismatch}<span class="writing-footer-note">当前写作任务属于另一个项目</span>{/if}
      <Button size="sm" disabled={writing.busy || !writing.context || !workspace.selectedProject || workspace.running || writing.mismatch} onclick={() => writing.action(writing.link)}><Link2 size={14} />用于当前任务</Button>
    </footer>
    {/if}
  </div>
</dialog>
