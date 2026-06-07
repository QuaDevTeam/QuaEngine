<script lang="ts">
  import { MessageSquare, Send } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'
  import Textarea from '$components/ui/Textarea.svelte'
  import { formatEventTime, type PlannerMessage } from '$lib/client/workspace'

  export let messages: PlannerMessage[]
  export let plannerInput = ''
  export let sendingMessage = false
  export let onSendPlannerMessage: () => void | Promise<void>
</script>

<div class="inspector-panel">
  {#if messages.length}
    <div class="chat-log">
      {#each messages as message}
        <div class="chat-message {message.role}">
          <div class="chat-meta">
            {message.role === 'user' ? '你' : '需求专家'} · {formatEventTime(message.timestamp)}
          </div>
          {message.content}
        </div>
      {/each}
    </div>
  {:else}
    <div class="inspector-empty">
      <MessageSquare size={28} />
      <p>向需求专家补充题材、风格或禁区，开始需求确认。</p>
    </div>
  {/if}
  <div class="chat-composer">
    <div class="chat-composer-field">
      <Textarea
        bind:value={plannerInput}
        class="chat-composer-textarea"
        rows={3}
        placeholder="补充题材、风格或禁区..."
      />
      <Button
        aria-label="发送补充需求"
        class="chat-send-button"
        size="icon"
        onclick={onSendPlannerMessage}
        disabled={sendingMessage || !plannerInput.trim()}
      >
        <Send size={15} />
      </Button>
    </div>
  </div>
</div>
