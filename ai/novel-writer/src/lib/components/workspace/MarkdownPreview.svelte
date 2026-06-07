<script lang="ts">
  export let markdown = ''

  $: lines = markdown.split('\n')

  function headingClass(line: string): string {
    if (line.startsWith('### ')) return 'doc-h doc-h3'
    if (line.startsWith('## ')) return 'doc-h doc-h2'
    if (line.startsWith('# ')) return 'doc-h doc-h1'
    return ''
  }

  function headingText(line: string): string {
    return line.replace(/^#{1,6}\s+/, '')
  }
</script>

<div class="doc-preview">
  {#each lines as line}
    {#if line.startsWith('#')}
      <div class={headingClass(line)}>{headingText(line)}</div>
    {:else if line.includes('：') && !line.startsWith('-')}
      <div class="dialogue-line">
        <span class="speaker">{line.split('：')[0]}</span>
        <span>{line.slice(line.indexOf('：') + 1)}</span>
      </div>
    {:else if line.trim()}
      <p>{line}</p>
    {:else}
      <div class="blank-line"></div>
    {/if}
  {/each}
</div>
