<script lang="ts">
  import { Sparkles } from 'lucide-svelte'

  export let title: string
  export let description: string
</script>

<div class="empty-state">
  <div class="empty-state-inner">
    <span class="empty-state-mark">
      <Sparkles size={26} />
    </span>
    <h2>{title}</h2>
    <p class="muted">{description}</p>
  </div>
</div>
