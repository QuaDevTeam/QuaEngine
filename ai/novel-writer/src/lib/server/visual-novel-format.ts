import type { WorkflowStage } from '$lib/types'

const proseStages = new Set<WorkflowStage>(['scene_writing', 'editing'])
const speakerDecorationPattern = /[（(【\[{<《「『]/
const speakerSeparatorPattern = /\s[-—–:：]\s|\s\/\s/

export function normalizeVisualNovelMarkdown(stage: WorkflowStage, markdown: string): string {
  if (!proseStages.has(stage)) {
    return markdown
  }

  let inFence = false
  return markdown
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) {
        return line
      }
      if (trimmed.startsWith('```')) {
        inFence = !inFence
        return line
      }
      if (inFence || trimmed.startsWith('#')) {
        return line
      }

      const colonIndex = findDialogueColon(trimmed)
      if (colonIndex >= 0) {
        return normalizeDialogueLine(trimmed, colonIndex)
      }
      return `旁白：${trimmed}`
    })
    .join('\n')
}

function findDialogueColon(line: string): number {
  const fullWidth = line.indexOf('：')
  const halfWidth = line.indexOf(':')
  if (fullWidth < 0) {
    return halfWidth
  }
  if (halfWidth < 0) {
    return fullWidth
  }
  return Math.min(fullWidth, halfWidth)
}

function normalizeDialogueLine(line: string, colonIndex: number): string {
  const rawSpeaker = line.slice(0, colonIndex).trim()
  const content = line.slice(colonIndex + 1).trimStart()
  const { speaker, decoration } = splitSpeakerDecoration(rawSpeaker)
  const normalizedSpeaker = speaker || '旁白'
  const normalizedContent = decoration ? `${decoration}${content}` : content
  return `${normalizedSpeaker}：${normalizedContent}`
}

function splitSpeakerDecoration(rawSpeaker: string): { speaker: string, decoration: string } {
  const bracketIndex = rawSpeaker.search(speakerDecorationPattern)
  const separatorIndex = rawSpeaker.search(speakerSeparatorPattern)
  const cutIndex = [bracketIndex, separatorIndex]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (cutIndex === undefined) {
    return { speaker: rawSpeaker, decoration: '' }
  }

  return {
    speaker: rawSpeaker.slice(0, cutIndex).trim(),
    decoration: rawSpeaker.slice(cutIndex).trim(),
  }
}
