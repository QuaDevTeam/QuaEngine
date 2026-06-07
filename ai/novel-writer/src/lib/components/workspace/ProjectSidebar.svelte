<script lang="ts">
  import { ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-svelte'
  import Badge from '$components/ui/Badge.svelte'
  import Button from '$components/ui/Button.svelte'
  import * as ContextMenu from '$components/ui/context-menu'
  import type { NovelProject } from '$lib/types'
  import { projectStatusInfo } from '$lib/client/workspace'

  export let projects: NovelProject[]
  export let trashedProjects: NovelProject[]
  export let selectedProjectId = ''
  export let onCreateProject: () => void
  export let onSelectProject: (projectId: string) => void | Promise<void>
  export let onEditProject: (projectId: string) => void | Promise<void>
  export let onDeleteProject: (projectId: string) => void | Promise<void>
  export let onRestoreProject: (projectId: string) => void | Promise<void>
  export let onPermanentlyDeleteProject: (projectId: string) => void | Promise<void>
  export let onEmptyTrash: () => void | Promise<void>
  export let deletingProjectId = ''
  export let deletingTrashedProjectId = ''
  export let restoringProjectId = ''
  export let emptyingTrash = false

  let trashOpen = false
  let previousTrashedProjectIds = ''

  $: trashedProjectIds = trashedProjects.map(project => project.id).join('|')
  $: if (trashedProjectIds !== previousTrashedProjectIds) {
    if (trashedProjects.length > previousTrashedProjectIds.split('|').filter(Boolean).length) {
      trashOpen = true
    }
    previousTrashedProjectIds = trashedProjectIds
  }
</script>

<aside class="sidebar project-sidebar">
  <div class="sidebar-header">
    <div>
      <h2>项目</h2>
    </div>
    <Button aria-label="新建项目" title="新建项目" size="icon" onclick={onCreateProject}>
      <Plus size={16} />
    </Button>
  </div>

  <div class="project-list">
    {#each projects as project (project.id)}
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class:active={project.id === selectedProjectId}
              class="project-item"
              type="button"
              onclick={() => onSelectProject(project.id)}
            >
              <strong>{project.title}</strong>
              <div class="project-item-meta">
                <Badge tone={projectStatusInfo(project.status).tone} dot>{projectStatusInfo(project.status).label}</Badge>
                <span class="small soft">{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </button>
          {/snippet}
        </ContextMenu.Trigger>
        <ContextMenu.Content class="project-context-menu">
          <ContextMenu.Item
            disabled={project.status === 'running'}
            onSelect={() => onEditProject(project.id)}
          >
            <Pencil size={14} />
            编辑项目
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            variant="destructive"
            disabled={project.status === 'running' || deletingProjectId === project.id}
            onSelect={() => onDeleteProject(project.id)}
          >
            <Trash2 size={14} />
            移入回收站
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {:else}
      <div class="project-empty">
        <p class="small muted">还没有项目，点击 + 创建第一个。</p>
      </div>
    {/each}
  </div>

  <div class="trash-section" class:open={trashOpen}>
    <div class="trash-header">
      <button
        class="trash-toggle"
        type="button"
        aria-expanded={trashOpen}
        onclick={() => trashOpen = !trashOpen}
      >
        <ChevronDown size={15} />
        <h3>回收站</h3>
      </button>
      <div class="trash-header-actions">
        <Badge>{trashedProjects.length}</Badge>
        {#if trashedProjects.length > 0}
          <Button
            aria-label="清空回收站"
            title="清空回收站"
            size="icon"
            variant="ghost"
            disabled={emptyingTrash}
            onclick={onEmptyTrash}
          >
            <Trash2 size={15} />
          </Button>
        {/if}
      </div>
    </div>

    {#if trashOpen}
      <div class="trash-list">
        {#each trashedProjects as project (project.id)}
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  class="project-item"
                  type="button"
                >
                  <strong>{project.title}</strong>
                  <div class="project-item-meta">
                    <Badge tone={projectStatusInfo(project.status).tone} dot>{projectStatusInfo(project.status).label}</Badge>
                    <span class="small soft">{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
              {/snippet}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="project-context-menu">
              <ContextMenu.Item
                disabled={restoringProjectId === project.id || deletingTrashedProjectId === project.id}
                onSelect={() => onRestoreProject(project.id)}
              >
                <RotateCcw size={14} />
                恢复项目
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item
                variant="destructive"
                disabled={restoringProjectId === project.id || deletingTrashedProjectId === project.id}
                onSelect={() => onPermanentlyDeleteProject(project.id)}
              >
                <Trash2 size={14} />
                永久删除
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Root>
        {:else}
          <div class="project-empty trash-empty">
            <p class="small muted">回收站为空。</p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</aside>
