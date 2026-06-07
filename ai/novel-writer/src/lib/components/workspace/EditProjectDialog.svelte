<script lang="ts">
  import { Save, X } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import Input from '$components/ui/Input.svelte'
  import Switch from '$components/ui/Switch.svelte'
  import Textarea from '$components/ui/Textarea.svelte'
  import type { ProjectInputChange, RunMode } from '$lib/types'

  export let dialog: HTMLDialogElement | undefined
  export let projectTitle = ''
  export let projectBrief = ''
  export let projectMode: RunMode = 'step'
  export let projectMaxRevisionLoops = ''
  export let seedWorldbuilding = ''
  export let seedCharacters = ''
  export let seedOutline = ''
  export let allowExpertSeedChanges = false
  export let saving = false
  export let error = ''
  export let lastChangedFields: ProjectInputChange[] = []
  export let revisionStarted = false
  export let onSaveProject: () => void | Promise<void>

  let advancedOpen = true

  async function submitProjectEdit() {
    await onSaveProject()
  }
</script>

<dialog bind:this={dialog} class="modal-dialog">
  <form
    class="modal-panel stack"
    onsubmit={(e) => { e.preventDefault(); void submitProjectEdit() }}
  >
    <div class="split-row">
      <div>
        <h2>编辑项目输入</h2>
        <p>保存后只会在内容真正变化时触发修订，并尽量保留已有产物。</p>
      </div>
      <Button aria-label="关闭" size="icon" variant="ghost" onclick={() => dialog?.close()}>
        <X size={16} />
      </Button>
    </div>

    <label class="form-field">
      <span>作品标题</span>
      <Input bind:value={projectTitle} />
    </label>

    <label class="form-field">
      <span>原始需求</span>
      <Textarea bind:value={projectBrief} rows={6} />
    </label>

    <div class="form-grid">
      <label class="form-field">
        <span>运行模式</span>
        <select bind:value={projectMode} class="form-select">
          <option value="step">单步确认</option>
          <option value="yolo">YOLO 自动完成</option>
        </select>
      </label>
      <label class="form-field">
        <span>最大修复循环</span>
        <Input bind:value={projectMaxRevisionLoops} type="number" />
      </label>
    </div>

    <details class="advanced-options" bind:open={advancedOpen}>
      <summary>高级选项：已有构思</summary>
      <div class="stack">
        <div class="toggle-row">
          <Switch id="edit-allow-expert-seed-changes" bind:checked={allowExpertSeedChanges} aria-label="允许专家修改设定" />
          <span>
            <label for="edit-allow-expert-seed-changes">允许专家修改设定</label>
            <small>{allowExpertSeedChanges ? '专家可以基于预设进行合理修改，并继续扩写。' : '专家只能丰富和完善，预设内容与细节不可修改。'}</small>
          </span>
        </div>
        <label class="form-field">
          <span>已有世界观</span>
          <Textarea bind:value={seedWorldbuilding} rows={5} />
        </label>
        <label class="form-field">
          <span>已有角色信息</span>
          <Textarea bind:value={seedCharacters} rows={5} />
        </label>
        <label class="form-field">
          <span>已有大纲</span>
          <Textarea bind:value={seedOutline} rows={6} />
        </label>
      </div>
    </details>

    {#if lastChangedFields.length}
      <div class="change-summary">
        <strong>{revisionStarted ? '已启动修订流程' : '已保存修改'}</strong>
        <span>变更字段：{lastChangedFields.map(change => change.label).join('、')}</span>
      </div>
    {/if}

    {#if error}
      <div class="form-error" role="alert">{error}</div>
    {/if}

    <div class="dialog-actions">
      <Button type="button" variant="secondary" onclick={() => dialog?.close()}>取消</Button>
      <Button type="submit" disabled={saving || !projectTitle.trim() || !projectBrief.trim()}>
        <Save size={14} />保存
      </Button>
    </div>
  </form>
</dialog>
