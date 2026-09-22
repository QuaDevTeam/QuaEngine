<script lang="ts">
  import type { ArtifactRef } from '$lib/types'
  import { artifactStatusInfo } from '$lib/client/workspace'

  export let artifacts: ArtifactRef[]
  export let selectedArtifactId = ''
  export let onSelectArtifact: (artifactId: string) => void
</script>

<div class="artifact-strip">
  {#each artifacts as artifact}
    {@const status = artifactStatusInfo(artifact.status)}
    <button
      class:active={artifact.id === selectedArtifactId}
      class="artifact-chip"
      type="button"
      onclick={() => onSelectArtifact(artifact.id)}
    >
      <span class="dot {status.tone}"></span>
      {artifact.title}
    </button>
  {/each}
</div>
