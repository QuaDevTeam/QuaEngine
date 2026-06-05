import type { ViewOverlayStackPlacement, ViewUiSceneProjection } from '@quajs/render-core'

export interface DemoUiSceneOptions extends ViewOverlayStackPlacement {
  defaultChrome?: boolean
  hideHud?: boolean
  hideDialogue?: boolean
}

type DemoOverlayPlacementId = 'gameMenu' | 'saveLoad' | 'backlog' | 'settings' | 'gallery'

export const DEMO_OVERLAY_PLACEMENTS: Record<DemoOverlayPlacementId, ViewOverlayStackPlacement> = {
  gameMenu: { overlayStack: 'overlay', zIndex: 10 },
  saveLoad: { overlayStack: 'overlay', zIndex: 40 },
  backlog: { overlayStack: 'overlay', zIndex: 50 },
  settings: { overlayStack: 'overlay', zIndex: 60 },
  gallery: { overlayStack: 'overlay', zIndex: 70 },
}

export function createUiScene(
  id: string,
  presentation: 'overlay' | 'scene',
  variant: string,
  options: DemoUiSceneOptions = {},
): ViewUiSceneProjection {
  return {
    id,
    presentation,
    overlay: {
      variant,
      defaultChrome: options.defaultChrome ?? false,
      hideHud: options.hideHud ?? true,
      hideDialogue: options.hideDialogue ?? true,
      overlayStack: options.overlayStack,
      stackPriority: options.stackPriority,
      zIndex: options.zIndex,
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
