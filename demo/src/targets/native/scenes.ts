import { createCharacter } from '@quajs/character'
import type { createDemoEngineRuntime } from '../../game/runtime-shared'

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
