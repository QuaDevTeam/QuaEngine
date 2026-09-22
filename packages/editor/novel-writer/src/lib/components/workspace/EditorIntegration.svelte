<script lang="ts">
  import type { EditorWritingController } from '$lib/client/editor-writing.svelte'
  import type { createWorkspaceController } from '$lib/client/workspace-controller.svelte'
  import { ArrowRight, Check, FileCode2, FilePlus2, LoaderCircle, Sparkles, X } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import { Input } from '$components/ui/input'
  import { Textarea } from '$components/ui/textarea'
  import ProjectContextDialog from './writing/ProjectContextDialog.svelte'
  import WritingDiff from './writing/WritingDiff.svelte'

  let { workspace, writing }: { workspace: ReturnType<typeof createWorkspaceController>, writing: EditorWritingController } = $props()
  let dialog: HTMLDialogElement
  let contextDialog: ProjectContextDialog
  let tab = $state<'manuscript' | 'preview'>('manuscript')
  let origin = $state('')
  const scope = $derived(writing.base && writing.base.start !== writing.base.end ? '当前选区' : '全文对白')

  export async function openSource() {
    if (await writing.action(writing.capture)) {
      origin = '来自当前 QS'
      tab = 'manuscript'
      dialog.showModal()
    }
  }
  export function openArtifact() {
    if (writing.busy) return
    writing.useArtifact()
    origin = workspace.selectedArtifact?.title ?? '当前稿件'
    tab = 'manuscript'
    dialog.showModal()
  }
  $effect(() => { if (!writing.preview) tab = 'manuscript' })
  export function openDraft() { origin = ''; tab = 'manuscript'; dialog.showModal() }
  export function openContext() { contextDialog.open() }
  async function preview() {
    if (await writing.action(writing.previewChanges)) tab = 'preview'
  }
  async function apply() {
    if (await writing.action(writing.apply)) { dialog.close(); tab = 'manuscript' }
  }
  function revise() {
    dialog.close()
    writing.prepareRevision()
  }
  function switchTab(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !writing.preview) return
    event.preventDefault()
    tab = event.key === 'Home' ? 'manuscript' : event.key === 'End' ? 'preview' : tab === 'manuscript' ? 'preview' : 'manuscript'
    document.getElementById(`writing-tab-${tab}`)?.focus()
  }
</script>

<dialog bind:this={dialog} class="writing-dialog" aria-labelledby="writing-dialog-title">
  <div class="writing-dialog-layout" aria-busy={writing.busy}>
    <header class="writing-dialog-header">
      <FileCode2 size={18} />
      <div class="writing-dialog-title"><h2 id="writing-dialog-title">写入项目</h2></div>
      <Button size="icon" variant="ghost" aria-label="关闭写入面板" title="关闭，保留稿件" onclick={() => dialog.close()}><X size={17} /></Button>
    </header>

    <div class="writing-target-row">
      <label class="writing-mode-label" for="writing-mode">写入方式</label>
      <select id="writing-mode" class="writing-mode" bind:value={writing.mode} disabled={writing.busy}>
        <option value="rewrite" disabled={!writing.base}>更新原稿</option>
        <option value="append" disabled={!writing.base}>追加到末尾</option>
        <option value="create">新建文件</option>
      </select>
      <ArrowRight size={13} class="writing-target-arrow" />
      {#if writing.mode === 'create'}
        <FilePlus2 size={14} />
        <Input class="writing-path-input" aria-label="新 QS 文件路径" placeholder="src/game/scenes/chapter.qs" bind:value={writing.path} disabled={writing.busy} />
      {:else}
        <FileCode2 size={14} />
        <span class="writing-target-path" title={writing.path}>{writing.relativePath || '尚未关联源文件'}</span>
        <span class="writing-scope">{writing.mode === 'append' ? '文件末尾' : scope}</span>
      {/if}
    </div>
    {#if writing.mode === 'create'}<p class="writing-path-hint">路径相对于项目目录，父目录需已存在。</p>{/if}

    <div class="writing-tabs" role="tablist" aria-label="写入内容">
      <button type="button" id="writing-tab-manuscript" role="tab" aria-selected={tab === 'manuscript'} aria-controls="writing-manuscript" tabindex={tab === 'manuscript' ? 0 : -1} class:active={tab === 'manuscript'} onclick={() => tab = 'manuscript'} onkeydown={switchTab}>稿件</button>
      <button type="button" id="writing-tab-preview" role="tab" aria-selected={tab === 'preview'} aria-controls="writing-preview" tabindex={tab === 'preview' ? 0 : -1} class:active={tab === 'preview'} disabled={!writing.preview} onclick={() => tab = 'preview'} onkeydown={switchTab}>修改预览</button>
      <span class="writing-manuscript-origin" title={origin}>{origin}</span>
      <span class="writing-word-count">{writing.prose.replace(/\s/gu, '').length.toLocaleString()} 字</span>
    </div>

    <div class="writing-dialog-body">
      <div id="writing-manuscript" class="writing-manuscript" role="tabpanel" aria-labelledby="writing-tab-manuscript" hidden={tab !== 'manuscript'}>
        <Textarea class="writing-prose" aria-label="回写稿件" placeholder="在这里调整要写入项目的正文…" bind:value={writing.prose} disabled={writing.busy} oninput={() => tab = 'manuscript'} />
      </div>
      <div id="writing-preview" class="writing-preview" role="tabpanel" aria-labelledby="writing-tab-preview" hidden={tab !== 'preview'}>
        {#if writing.preview}<WritingDiff before={writing.mode === 'create' ? '' : writing.base?.text ?? ''} after={writing.preview} />{/if}
      </div>
    </div>
    {#if !writing.context}<p class="writing-error" role="status">请先在编辑器中打开要写入的项目。</p>{/if}
    {#if writing.mismatch}<p class="writing-error" role="alert">此写作任务属于另一个项目，请切换到对应项目后再写入。</p>{/if}
    {#if writing.error}<p class="writing-error" role="alert">{writing.error}</p>
    {:else if writing.busy || writing.preview}
      <p class="writing-status" role="status">{#if writing.busy}<LoaderCircle size={14} class="writing-spinner" />{:else}<Check size={14} />{/if}<span>{writing.busy ? writing.message || '正在准备…' : writing.message}</span></p>
    {/if}
    <footer class="writing-dialog-footer">
      {#if writing.base}<Button size="sm" variant="ghost" disabled={writing.busy || !writing.prose || writing.mismatch} onclick={revise}><Sparkles size={14} />建立 AI 改写任务</Button>{/if}
      {#if writing.preview}
        <Button size="sm" disabled={writing.busy || writing.mismatch} onclick={apply}><Check size={14} />应用到项目</Button>
      {:else}
        <Button size="sm" disabled={writing.busy || !writing.canPreview || writing.mismatch} onclick={preview}>
          {#if writing.busy}<LoaderCircle size={14} class="writing-spinner" />{:else}<ArrowRight size={14} />{/if}{writing.busy ? '正在准备' : '预览修改'}
        </Button>
      {/if}
    </footer>
  </div>
</dialog>
<ProjectContextDialog bind:this={contextDialog} {writing} {workspace} />
