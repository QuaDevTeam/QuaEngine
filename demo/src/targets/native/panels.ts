import type { createDemoEngineRuntime } from '../../game/runtime-shared'
import { DEMO_GALLERY_CATALOG_ID } from '../../game/content/gallery'

type DemoRuntime = Awaited<ReturnType<typeof createDemoEngineRuntime>>

export type NativeDemoPanel = 'achievement' | 'backlog' | 'gallery' | 'scene' | 'settings'

export async function openNativeDemoPanel(runtime: DemoRuntime, panel: NativeDemoPanel): Promise<void> {
  await closeNativeDemoPanels(runtime)
  switch (panel) {
    case 'settings':
      await runtime.engine.showUI('settings', {
        scene: {
          id: 'native-settings',
          presentation: 'overlay',
          overlay: { overlayStack: 'overlay', zIndex: 60 },
        },
      })
      break
    case 'backlog':
      await runtime.backlog.setVisible(true, {
        overlayStack: 'overlay',
        zIndex: 50,
        scene: {
          id: 'native-backlog',
          presentation: 'overlay',
          overlay: { defaultChrome: false, overlayStack: 'overlay', zIndex: 50 },
        },
      })
      break
    case 'gallery':
      await runtime.gallery.openScene({
        catalogId: DEMO_GALLERY_CATALOG_ID,
        entryId: 'cg.title',
        overlayStack: 'overlay',
        zIndex: 70,
      })
      break
    case 'achievement':
      await runtime.achievement.unlockAchievement('first-signal', { source: 'native-demo' })
      await runtime.achievement.openBoard({
        achievementId: 'first-signal',
        groupId: 'demo',
        overlayStack: 'overlay',
        zIndex: 80,
      })
      break
    case 'scene':
      break
  }
}

export async function closeNativeDemoPanels(runtime: DemoRuntime): Promise<void> {
  await Promise.all([
    runtime.engine.hideUI('settings'),
    runtime.backlog.setVisible(false),
    runtime.gallery.closeScene(),
    runtime.achievement.closeBoard(),
  ])
}

export function isNativeDemoPanel(value: unknown): value is NativeDemoPanel {
  return value === 'achievement'
    || value === 'backlog'
    || value === 'gallery'
    || value === 'scene'
    || value === 'settings'
}
