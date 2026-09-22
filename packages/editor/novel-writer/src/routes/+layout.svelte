<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Toaster } from '$lib/components/ui/sonner'
  import '../app.css'

  let { children }: { children?: Snippet } = $props()
</script>

{@render children?.()}
<Toaster position="top-right" />
