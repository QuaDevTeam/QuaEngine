import { createCharacter } from '@quajs/character'
import type { createDemoEngineRuntime } from '../../game/runtime-shared'
import { STORY_TREE_NODES } from '../../game/content/story-tree'

type DemoRuntime = Awaited<ReturnType<typeof createDemoEngineRuntime>>

export async function stageWebParityScene(runtime: DemoRuntime): Promise<void> {
  await runtime.background.setBackground('backgrounds/blackout-city.jpg', { fit: 'cover' })
  const lin = createCharacter('lin', {
    displayName: '神代漪',
    speakerStyle: { fontFamily: 'Noto Sans', fontSize: 24, fontWeight: 700 },
    sprite: 'lin/base.png',
    position: { x: 520, y: 650, scale: 1 },
    layer: 2,
  })
  await lin.show()
  await lin.speak({
    kind: 'rich-text',
    blocks: [{ spans: [{ text: '东京的雨。' }] }],
    fontFamily: 'Noto Sans',
    fontSize: 27,
    lineHeight: 36,
  }, { wait: false })
}

export async function stageNativeCoverageScene(runtime: DemoRuntime): Promise<void> {
  await runtime.background.setBackground('backgrounds/blackout-city.jpg', {
    fit: 'cover',
    opacity: 0.92,
  })
  const lin = createCharacter('lin', {
    displayName: 'Lin',
    speakerStyle: { fontFamily: 'Noto Sans', fontSize: 24, fontWeight: 700 },
    sprite: 'lin/focus.png',
    position: { x: 520, y: 650, scale: 1 },
    layer: 2,
  })
  const mara = createCharacter('mara', {
    displayName: 'Mara',
    sprite: 'mara/alert.png',
    position: { x: 1260, y: 650, scale: 1 },
    layer: 3,
  })
  await lin.show()
  await mara.show()
  await lin.speak({
    kind: 'rich-text',
    blocks: [{ spans: [{ text: 'The Tokyo uplink is down. Mara, confirm the last human signal.' }] }],
    fontFamily: 'Noto Sans',
    fontSize: 28,
    lineHeight: 44,
  }, { wait: false })
  await runtime.engine.showChoices([
    { id: 'trace', text: 'TRACE SIGNAL', enabled: true },
    { id: 'hold', text: 'HOLD SILENCE', enabled: true },
  ])
  await runtime.animation.playTimeline({
    id: 'demo.native.mara-breathe',
    duration: 1800,
    loop: true,
    tracks: [{
      target: 'character:mara',
      property: 'position.y',
      keyframes: [
        { at: 0, value: 650 },
        { at: 900, value: 638, easing: 'ease-in-out' },
        { at: 1800, value: 650, easing: 'ease-in-out' },
      ],
    }, {
      target: 'character:mara',
      property: 'opacity',
      keyframes: [
        { at: 0, value: 0.9 },
        { at: 900, value: 1 },
        { at: 1800, value: 0.9 },
      ],
    }],
  }, { wait: false })
}

export function createNativeDemoMenuSurface(): Record<string, unknown> {
  const buttons = [
    ['SCENE', 'scene'],
    ['SETTINGS', 'settings'],
    ['BACKLOG', 'backlog'],
    ['GALLERY', 'gallery'],
    ['ACHIEVEMENTS', 'achievement'],
  ] as const
  return {
    visible: true,
    interactive: true,
    overlayStack: 'hud',
    zIndex: 20,
    surface: {
      key: 'demo/native-control-deck.qui',
      root: {
        id: 'native-control-deck',
        kind: 'Panel',
        bounds: { x: 1510, y: 34, width: 356, height: 356 },
        visible: true,
        style: {
          backgroundColor: 'rgba(5,9,15,0.90)',
          borderColor: 'rgba(113,215,243,0.72)',
          borderWidth: 1,
          borderRadius: 4,
        },
        children: [{
          id: 'native-control-title',
          kind: 'Text',
          bounds: { x: 1540, y: 58, width: 296, height: 38 },
          visible: true,
          text: 'NATIVE CONTROL DECK',
          style: {
            color: '#f8e9bd',
            fontFamily: ['Noto Sans'],
            fontSize: 23,
            fontWeight: 700,
          },
        }, {
          id: 'native-control-subtitle',
          kind: 'Text',
          bounds: { x: 1540, y: 98, width: 296, height: 28 },
          visible: true,
          text: 'FULL PRODUCT QA',
          style: { color: '#9ddff0', fontFamily: ['Noto Sans'], fontSize: 15 },
        }, ...buttons.map(([label, panel], index) => ({
          id: `native-control-${panel}`,
          kind: 'Button',
          bounds: { x: 1540, y: 142 + index * 44, width: 296, height: 36 },
          visible: true,
          text: label,
          intent: {
            event: 'ui/intent',
            action: 'demo-open-panel',
            metadata: { panel, source: 'native-demo' },
          },
          style: {
            backgroundColor: index === 0 ? 'rgba(214,173,85,0.92)' : 'rgba(255,248,234,0.08)',
            borderColor: 'rgba(245,226,190,0.26)',
            borderWidth: 1,
            borderRadius: 3,
            color: index === 0 ? '#17130b' : '#fff8ea',
            fontFamily: ['Noto Sans'],
            fontSize: 15,
            fontWeight: 700,
            textAlign: 'center',
          },
        }))],
      },
    },
  }
}

export function createNativeMainMenuSurface(): Record<string, unknown> {
  const buttons = [
    ['START', 'demo-start-story'],
    ['LOAD', 'demo-open-save-load'],
    ['STORY TREE', 'demo-open-story-tree'],
    ['GALLERY', 'demo-open-panel', { panel: 'gallery' }],
    ['CONFIG', 'demo-open-panel', { panel: 'settings' }],
  ] as const
  return {
    visible: true,
    interactive: true,
    overlayStack: 'modal',
    zIndex: 52,
    surface: {
      key: 'demo/native-main-menu.qui',
      root: {
        id: 'native-main-menu',
        kind: 'Box',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        visible: true,
        style: {
          backgroundColor: 'rgba(4,5,8,0.02)',
        },
        children: [
          {
            id: 'native-main-menu-background',
            kind: 'Image',
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            visible: true,
            image: { assetType: 'images', assetName: 'ui/menu-route.jpg' },
            style: {
              objectFit: 'cover',
              filter: { brightness: 0.46, saturate: 0.88 },
            },
          },
          {
            id: 'native-main-menu-radial-scrim',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'radial',
                startColor: 'rgba(8,10,16,0.16)',
                endColor: 'rgba(3,4,8,0.86)',
                centerX: 0.30,
                centerY: 0.46,
                radius: 0.86,
              },
            },
          },
          {
            id: 'native-main-menu-linear-scrim',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'linear',
                startColor: 'rgba(5,7,12,0.82)',
                endColor: 'rgba(5,7,12,0.06)',
                angleDegrees: 90,
              },
            },
          },
          {
            id: 'native-main-menu-accent',
            kind: 'Box',
            bounds: { x: 196, y: 274, width: 3, height: 494 },
            visible: true,
            style: {
              backgroundColor: 'rgba(245,194,86,0.78)',
              boxShadow: {
                offsetX: 0,
                offsetY: 0,
                blurRadius: 12,
                spreadRadius: 0,
                color: 'rgba(245,194,86,0.34)',
                inset: false,
              },
            },
          },
          {
            id: 'native-main-menu-title',
            kind: 'Text',
            bounds: { x: 220, y: 286, width: 660, height: 112 },
            visible: true,
            text: '断链纪元',
            style: {
              color: '#fffaf0',
              fontFamily: ['Noto Sans'],
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 92,
              textShadow: {
                offsetX: 0,
                offsetY: 2,
                blurRadius: 18,
                spreadRadius: 0,
                color: 'rgba(0,0,0,0.70)',
                inset: false,
              },
            },
          },
          {
            id: 'native-main-menu-subtitle',
            kind: 'Text',
            bounds: { x: 220, y: 414, width: 560, height: 30 },
            visible: true,
            text: 'BROKEN LINK ERA / TOKYO 2048',
            style: {
              color: 'rgba(235,204,144,0.82)',
              fontFamily: ['Noto Sans'],
              fontSize: 14,
              letterSpacing: 2.5,
            },
          },
          ...buttons.flatMap(([label, action, metadata], index) => {
            const id = `native-main-menu-${label.toLowerCase().replaceAll(' ', '-')}`
            const bounds = { x: 220, y: 480 + index * 58, width: 360, height: 48 }
            const baseStyle = {
              backgroundGradient: {
                kind: 'linear',
                startColor: 'rgba(9,12,18,0.96)',
                endColor: 'rgba(25,30,42,0.76)',
                angleDegrees: 90,
              },
              borderColor: 'rgba(245,226,190,0.30)',
              borderWidth: 1,
              borderRadius: 2,
              color: '#fffaf2',
              fontFamily: ['Noto Sans'],
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 1.5,
              textAlign: 'left',
              boxShadow: {
                offsetX: 0,
                offsetY: 1,
                blurRadius: 0,
                spreadRadius: 0,
                color: 'rgba(255,255,255,0.10)',
                inset: true,
              },
            }
            const hoverStyle = {
              ...baseStyle,
              backgroundGradient: {
                kind: 'linear',
                startColor: 'rgba(42,35,25,0.98)',
                endColor: 'rgba(34,35,46,0.82)',
                angleDegrees: 90,
              },
              borderColor: 'rgba(245,226,190,0.52)',
              color: '#ffe8b3',
              boxShadow: {
                offsetX: 0,
                offsetY: 1,
                blurRadius: 8,
                spreadRadius: 0,
                color: 'rgba(255,194,86,0.20)',
                inset: true,
              },
            }
            const activeStyle = {
              ...hoverStyle,
              backgroundGradient: {
                kind: 'linear',
                startColor: 'rgba(60,45,24,0.98)',
                endColor: 'rgba(38,34,38,0.88)',
                angleDegrees: 90,
              },
            }
            return [
              {
                id: `${id}-outer-shadow`,
                kind: 'Box',
                bounds,
                visible: true,
                style: {
                  boxShadow: {
                    offsetX: 0,
                    offsetY: 14,
                    blurRadius: 38,
                    spreadRadius: 0,
                    color: 'rgba(0,0,0,0.30)',
                    inset: false,
                  },
                },
              },
              {
                id,
                kind: 'Button',
                bounds,
                visible: true,
                text: label,
                intent: {
                  event: 'ui/intent',
                  action,
                  ...(metadata ? { metadata } : {}),
                },
                stateStyles: {
                  hover: { bounds: { ...bounds, x: bounds.x + 3 }, style: hoverStyle },
                  active: { bounds: { ...bounds, x: bounds.x + 2, y: bounds.y + 2 }, style: activeStyle },
                  focus: { bounds: { ...bounds, x: bounds.x + 3 }, style: hoverStyle },
                  'focus-visible': {
                    bounds: { ...bounds, x: bounds.x + 3 },
                    style: { ...hoverStyle, borderColor: '#f0c15a' },
                  },
                },
                transitions: [
                  { property: 'transform', durationMs: 160, easing: 'ease-out' },
                  { property: 'background-color', durationMs: 160, easing: 'ease' },
                  { property: 'color', durationMs: 160, easing: 'ease' },
                  { property: 'border-color', durationMs: 160, easing: 'ease' },
                  { property: 'box-shadow', durationMs: 160, easing: 'ease' },
                ],
                style: baseStyle,
              },
              ...nativeMenuChevron(`${id}-chevron`, bounds),
            ]
          }),
        ],
      },
    },
  }
}

function nativeMenuChevron(id: string, bounds: { x: number, y: number, width: number, height: number }): Record<string, unknown>[] {
  const x = bounds.x + bounds.width - 18
  const y = bounds.y + bounds.height / 2 - 7
  const color = 'rgba(255,232,179,0.72)'
  return [
    { id: `${id}-top`, kind: 'Divider', bounds: { x: x, y, width: 6, height: 2 }, visible: true, style: { backgroundColor: color } },
    { id: `${id}-mid`, kind: 'Divider', bounds: { x: x + 4, y: y + 5, width: 5, height: 2 }, visible: true, style: { backgroundColor: color } },
    { id: `${id}-bottom`, kind: 'Divider', bounds: { x: x + 7, y: y + 10, width: 2, height: 2 }, visible: true, style: { backgroundColor: color } },
  ]
}

export function createNativeStoryTreeSurface(): Record<string, unknown> {
  return createNativeMenuOverlaySurface(
    'native-story-tree',
    'ROUTE MAP',
    'STORY TREE',
    STORY_TREE_NODES.map(node => `CH ${node.chapter}  ${node.title} / ${node.description}`),
  )
}

export function createNativeSaveLoadSurface(
  slots: readonly { id: string, name?: string, updatedAt?: number }[],
): Record<string, unknown> {
  const lines = slots.length > 0
    ? slots.map(slot => `${slot.name || slot.id}  ${slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : ''}`.trim())
    : ['NO SAVE DATA']
  return createNativeMenuOverlaySurface('native-save-load', 'ARCHIVE', 'LOAD', lines)
}

function createNativeMenuOverlaySurface(
  id: string,
  eyebrow: string,
  title: string,
  lines: readonly string[],
): Record<string, unknown> {
  return {
    visible: true,
    interactive: true,
    overlayStack: 'modal',
    zIndex: 60,
    surface: {
      key: `demo/${id}.qui`,
      root: {
        id,
        kind: 'Panel',
        bounds: { x: 220, y: 170, width: 780, height: 740 },
        visible: true,
        style: {
          backgroundColor: 'rgba(7,8,12,0.92)',
          borderColor: 'rgba(245,226,190,0.30)',
          borderWidth: 1,
          borderRadius: 2,
          boxShadow: {
            offsetX: 0,
            offsetY: 18,
            blurRadius: 48,
            spreadRadius: 0,
            color: 'rgba(0,0,0,0.42)',
            inset: false,
          },
        },
        children: [
          {
            id: `${id}-eyebrow`,
            kind: 'Text',
            bounds: { x: 270, y: 220, width: 680, height: 24 },
            visible: true,
            text: eyebrow,
            style: { color: '#9ddff0', fontFamily: ['Noto Sans'], fontSize: 13, letterSpacing: 2 },
          },
          {
            id: `${id}-title`,
            kind: 'Text',
            bounds: { x: 270, y: 252, width: 680, height: 54 },
            visible: true,
            text: title,
            style: { color: '#fffaf0', fontFamily: ['Noto Sans'], fontSize: 42, fontWeight: 700 },
          },
          ...lines.map((line, index) => ({
            id: `${id}-line-${index}`,
            kind: 'Text',
            bounds: { x: 270, y: 340 + index * 44, width: 680, height: 30 },
            visible: true,
            text: line,
            style: { color: 'rgba(255,250,242,0.86)', fontFamily: ['Noto Sans'], fontSize: 16 },
          })),
          {
            id: `${id}-close`,
            kind: 'Button',
            bounds: { x: 270, y: 820, width: 180, height: 44 },
            visible: true,
            text: 'CLOSE',
            intent: { event: 'ui/intent', action: 'demo-close-main-overlay' },
            style: {
              backgroundColor: 'rgba(255,248,234,0.08)',
              borderColor: 'rgba(245,226,190,0.26)',
              borderWidth: 1,
              borderRadius: 2,
              color: '#fff8ea',
              fontFamily: ['Noto Sans'],
              fontSize: 13,
              textAlign: 'center',
            },
          },
        ],
      },
    },
  }
}
