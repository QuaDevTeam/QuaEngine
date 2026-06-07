<script lang="ts">
  import { BookOpen, Settings } from 'lucide-svelte'
  import Button from '$components/ui/Button.svelte'

  export let onOpenSettings: () => void
</script>

<header class="topbar">
  <div class="topbar-title">
    <span class="topbar-mark">
      <BookOpen size={17} />
    </span>
    <div>
      <h1>Novel Writer</h1>
    </div>
  </div>
  <div class="topbar-actions">
    <Button aria-label="设置" title="设置" variant="ghost" size="icon" onclick={onOpenSettings}>
      <Settings size={17} />
    </Button>
  </div>
</header>
