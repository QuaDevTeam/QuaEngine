export function createUiScene(id: string, presentation: 'overlay' | 'scene', variant: string): Record<string, unknown> {
  return {
    id,
    presentation,
    overlay: {
      variant,
      hideHud: true,
      hideDialogue: true,
    },
  }
}

export function parseChapterIndex(chapter: string): number {
  const match = chapter.match(/\d+/)
  if (!match) {
    return -1
  }
  const parsed = Number.parseInt(match[0], 10)
  return Number.isFinite(parsed) ? parsed : -1
}

export function slotLabel(slotId: string | undefined): string {
  if (!slotId || slotId === 'quicksave') {
    return '快速存档'
  }
  const match = slotId.match(/^slot-(\d+)$/)
  return match ? `存档 ${match[1]}` : slotId
}
