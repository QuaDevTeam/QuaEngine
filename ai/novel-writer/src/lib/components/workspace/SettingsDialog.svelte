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
  export let maxRevisionLoops = ''
  export let savingConfig = false
  export let onSaveConfig: () => void | Promise<void>
</script>

<dialog bind:this={dialog} class="modal-dialog">
  <form
    class="modal-panel stack"
    onsubmit={(e) => { e.preventDefault(); void onSaveConfig() }}
  >
    <div class="split-row">
      <div>
        <h2>设置</h2>
        <p>模型、搜索和默认运行参数。</p>
      </div>
      <Button aria-label="关闭" size="icon" variant="ghost" onclick={() => dialog?.close()}>
        <X size={16} />
      </Button>
    </div>

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
      <label class="form-field">
        <span>模型</span>
        <select bind:value={deepSeekModel} class="form-select">
          <option value="deepseek-v4-pro">deepseek-v4-pro</option>
          <option value="deepseek-v4-flash">deepseek-v4-flash</option>
        </select>
      </label>
      <label class="form-field">
        <span>推理强度</span>
        <select bind:value={defaultReasoningEffort} class="form-select">
          <option value="high">high</option>
          <option value="max">max</option>
        </select>
      </label>
      <label class="form-field">
        <span>默认最大修复循环</span>
        <Input bind:value={maxRevisionLoops} type="number" />
      </label>
    </div>

    <div class="dialog-actions">
      <Button type="button" variant="secondary" onclick={() => dialog?.close()}>取消</Button>
      <Button type="submit" disabled={savingConfig}>保存设置</Button>
    </div>
  </form>
</dialog>
