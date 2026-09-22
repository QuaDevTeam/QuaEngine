<script lang="ts">
  import type { EditorWritingController } from '$lib/client/editor-writing.svelte'
  import { BookOpen, FilePenLine, FolderOpen, Settings } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'

  export let onOpenSettings: () => void
  export let writing: EditorWritingController | undefined = undefined
  export let onOpenSource: () => void | Promise<void> = () => {}
  export let onOpenDraft: () => void = () => {}
  export let onOpenContext: () => void = () => {}
</script>

<header class="topbar">
  <div class="topbar-title">
    <span class="topbar-mark">
      <BookOpen size={17} />
    </span>
    <div>
      <h1>Novel Writer</h1>
    </div>
    {#if writing}<span class="writing-topbar-divider"></span><Button class="writing-project-button" size="sm" variant="ghost" title="查看项目资料" aria-label="项目资料" onclick={onOpenContext}><FolderOpen size={14} /><span>{writing.context?.name ?? '项目资料'}</span></Button>{/if}
  </div>
  <div class="topbar-actions">
    {#if writing}
      {#if writing.prose || writing.base}<Button class="writing-resume-button" size="sm" variant="ghost" onclick={onOpenDraft}><span class:writing-draft-dot={writing.dirty}></span>继续稿件</Button>{/if}
      <Button class="writing-source-button" size="sm" variant="ghost" disabled={writing.busy || !writing.context} onclick={onOpenSource}><FilePenLine size={14} />从 QS 改写</Button>
    {/if}
    <Button aria-label="设置" title="设置" variant="ghost" size="icon" onclick={onOpenSettings}>
      <Settings size={17} />
    </Button>
  </div>
</header>
