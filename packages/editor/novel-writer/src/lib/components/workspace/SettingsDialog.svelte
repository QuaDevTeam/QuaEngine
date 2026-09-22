<script lang="ts">
  import { X } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import Input from '$components/ui/Input.svelte'
  import type { PublicNovelWriterConfig } from '$lib/types'

  export let dialog: HTMLDialogElement | undefined
  export let config: PublicNovelWriterConfig
  export let deepSeekApiKey = ''
  export let tavilyApiKey = ''
  export let deepSeekBaseUrl = ''
  export let tavilyBaseUrl = ''
  export let deepSeekModel: PublicNovelWriterConfig['deepSeekModel']
  export let defaultReasoningEffort: PublicNovelWriterConfig['defaultReasoningEffort']
  export let codeModel: PublicNovelWriterConfig['codeModel']
  export let codeReasoningEffort: PublicNovelWriterConfig['codeReasoningEffort']
  export let maxRevisionLoops = ''
  export let savingConfig = false
  export let onSaveConfig: () => void | Promise<void>
</script>

<dialog bind:this={dialog} class="modal-dialog settings-dialog" aria-labelledby="writer-settings-title">
  <form
    class="modal-panel settings-panel"
    onsubmit={(e) => { e.preventDefault(); void onSaveConfig() }}
  >
    <div class="split-row">
      <h2 id="writer-settings-title">设置</h2>
      <Button aria-label="关闭" size="icon" variant="ghost" onclick={() => dialog?.close()}>
        <X size={16} />
      </Button>
    </div>

    <div class="settings-body">
    <fieldset class="settings-section">
      <legend>模型</legend>
      <div class="form-grid">
        <label class="form-field">
          <span id="writing-model-label">写作模型</span>
          <select aria-labelledby="writing-model-label" bind:value={deepSeekModel} class="form-select">
            <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            <option value="deepseek-v4-flash">deepseek-v4-flash</option>
          </select>
        </label>
        <label class="form-field">
          <span id="writing-effort-label">写作推理强度</span>
          <select aria-labelledby="writing-effort-label" bind:value={defaultReasoningEffort} class="form-select">
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </label>
        <label class="form-field">
          <span id="code-model-label">代码模型（QS 适配）</span>
          <select aria-labelledby="code-model-label" bind:value={codeModel} class="form-select">
            <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            <option value="deepseek-v4-flash">deepseek-v4-flash</option>
          </select>
        </label>
        <label class="form-field">
          <span id="code-effort-label">代码推理强度</span>
          <select aria-labelledby="code-effort-label" bind:value={codeReasoningEffort} class="form-select">
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </label>
      </div>
    </fieldset>
    <fieldset class="settings-section">
      <legend>连接</legend>
      <div class="form-grid">
      <label class="form-field">
        <span>DeepSeek API Key</span>
        <Input
          bind:value={deepSeekApiKey}
          type="password"
          placeholder={config.hasDeepSeekApiKey ? '已保存，留空保持不变' : '输入 API Key'}
        />
      </label>
      <label class="form-field">
        <span>Tavily API Key</span>
        <Input
          bind:value={tavilyApiKey}
          type="password"
          placeholder={config.hasTavilyApiKey ? '已保存，留空保持不变' : '输入 API Key'}
        />
      </label>
      <label class="form-field">
        <span>DeepSeek Base URL</span>
        <Input bind:value={deepSeekBaseUrl} />
      </label>
      <label class="form-field">
        <span>Tavily Base URL</span>
        <Input bind:value={tavilyBaseUrl} />
      </label>
      </div>
    </fieldset>
    <fieldset class="settings-section">
      <legend>运行</legend>
      <label class="form-field">
        <span>默认最大修复循环</span>
        <Input bind:value={maxRevisionLoops} type="number" />
      </label>
    </fieldset>

    </div>
    <div class="dialog-actions">
      <Button type="button" variant="secondary" onclick={() => dialog?.close()}>取消</Button>
      <Button type="submit" disabled={savingConfig}>保存设置</Button>
    </div>
  </form>
</dialog>
