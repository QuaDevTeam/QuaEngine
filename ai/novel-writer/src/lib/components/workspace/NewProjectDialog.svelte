<script lang="ts">
  import { FileText, RotateCcw, X } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import Input from '$components/ui/Input.svelte'
  import Switch from '$components/ui/Switch.svelte'
  import Textarea from '$components/ui/Textarea.svelte'
  import type { RunMode } from '$lib/types'

  export let dialog: HTMLDialogElement | undefined
  export let projectTitle = ''
  export let projectBrief = ''
  export let projectMode: RunMode = 'step'
  export let projectMaxRevisionLoops = ''
  export let seedWorldbuilding = ''
  export let seedWorldbuildingModificationInstructions = ''
  export let seedCharacters = ''
  export let seedCharactersModificationInstructions = ''
  export let seedOutline = ''
  export let seedOutlineModificationInstructions = ''
  export let allowExpertSeedChanges = false
  export let projectCreateError = ''
  export let hasProjectDraft = false
  export let creating = false
  export let onCreateProject: () => void | Promise<void>
  export let onResetDraft: () => void
  let advancedOpen = false
  let resetConfirmOpen = false

  async function submitProject() {
    resetConfirmOpen = false
    await onCreateProject()
  }

  function confirmResetDraft() {
    onResetDraft()
    advancedOpen = false
    resetConfirmOpen = false
  }
</script>

<dialog bind:this={dialog} class="modal-dialog" onclose={() => (resetConfirmOpen = false)}>
  <form
    class="modal-panel stack"
    onsubmit={(e) => { e.preventDefault(); void submitProject() }}
  >
    <div class="split-row">
      <div>
        <h2>新建项目</h2>
        <p>为新的视觉小说创作会话设定初始需求。</p>
      </div>
      <div class="dialog-header-actions">
        <Button
          aria-label="重置草稿"
          title="重置草稿"
          size="sm"
          variant="ghost"
          disabled={!hasProjectDraft || creating}
          onclick={() => (resetConfirmOpen = true)}
        >
          <RotateCcw size={14} />重置
        </Button>
        <Button aria-label="关闭" size="icon" variant="ghost" onclick={() => dialog?.close()}>
          <X size={16} />
        </Button>
      </div>
    </div>

    {#if resetConfirmOpen}
      <div class="inline-confirm" role="alert">
        <span>确认清空当前新建项目草稿？</span>
        <div class="inline-confirm-actions">
          <Button size="sm" variant="ghost" onclick={() => (resetConfirmOpen = false)}>取消</Button>
          <Button size="sm" variant="destructive" onclick={confirmResetDraft}>确认清空</Button>
        </div>
      </div>
    {/if}

    <label class="form-field">
      <span>作品标题</span>
      <Input bind:value={projectTitle} placeholder="例：异世界恋爱物语" />
    </label>

    <label class="form-field">
      <span>原始需求</span>
      <Textarea bind:value={projectBrief} rows={6} placeholder="题材、篇幅、风格、禁区或参考作品…" />
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
      <summary>高级选项：预输入已有构思</summary>
      <div class="stack">
        <p class="small muted">这些内容会作为固定项目基础信息保存，并交给对应专家使用；上下文压缩时也会优先保留。</p>
        <div class="toggle-row">
          <Switch id="allow-expert-seed-changes" bind:checked={allowExpertSeedChanges} aria-label="允许专家修改设定" />
          <span>
            <label for="allow-expert-seed-changes">允许专家修改设定</label>
            <small>{allowExpertSeedChanges ? '专家可以基于预设和修改指示进行合理修改，并继续扩写。' : '专家会先执行明确修改指示，除此之外只能丰富和完善预设。'}</small>
          </span>
        </div>
        <label class="form-field">
          <span>已有世界观</span>
          <Textarea bind:value={seedWorldbuilding} rows={5} placeholder="世界规则、时代背景、地点、组织、力量体系或真实世界参考…" />
        </label>
        <label class="form-field">
          <span>世界观修改指示</span>
          <Textarea bind:value={seedWorldbuildingModificationInstructions} rows={3} placeholder="希望如何调整或补强世界规则、地点、组织、力量体系…" />
        </label>
        <label class="form-field">
          <span>已有角色信息</span>
          <Textarea bind:value={seedCharacters} rows={5} placeholder="主角、配角、关系、动机、弧光、口吻、禁忌设定…" />
        </label>
        <label class="form-field">
          <span>角色设定修改指示</span>
          <Textarea bind:value={seedCharactersModificationInstructions} rows={3} placeholder="希望如何调整人物关系、弧光、口吻、外貌或配角配置…" />
        </label>
        <label class="form-field">
          <span>已有大纲</span>
          <Textarea bind:value={seedOutline} rows={6} placeholder="章节/场景顺序、关键转折、结局方向、必须保留的桥段…" />
        </label>
        <label class="form-field">
          <span>大纲修改指示</span>
          <Textarea bind:value={seedOutlineModificationInstructions} rows={3} placeholder="希望如何调整章节顺序、分支、转折、结局或必须保留桥段…" />
        </label>
      </div>
    </details>

    {#if projectCreateError}
      <div class="form-error" role="alert">{projectCreateError}</div>
    {/if}

    <div class="dialog-actions">
      <Button type="button" variant="secondary" onclick={() => dialog?.close()}>取消</Button>
      <Button type="submit" disabled={creating || !projectTitle.trim() || !projectBrief.trim()}>
        <FileText size={14} />创建并启动
      </Button>
    </div>
  </form>
</dialog>
