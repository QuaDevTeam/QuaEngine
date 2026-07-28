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

// Geometry and colors below mirror the Web main menu (`.vn-title-surface` and
// `.vn-main-menu` in demo/src/game/styles/shell.scss) as measured from a live
// 1920x1080 Chromium render via getBoundingClientRect/getComputedStyle. Keep
// them in sync with that stylesheet: this surface is a second implementation of
// the same screen, so any drift shows up as a visible parity gap.
const MENU_STAGE_WIDTH = 1920
const MENU_STAGE_HEIGHT = 1080
const MENU_COLUMN_X = 130
const MENU_BUTTON_WIDTH = 360
const MENU_BUTTON_HEIGHT = 48
const MENU_BUTTON_FIRST_Y = 483
const MENU_BUTTON_PITCH = 57
// `.vn-title-surface::before` renders the photo at `transform: scale(1.03)`.
const MENU_BACKGROUND_SCALE = 1.03

export function createNativeMainMenuSurface(): Record<string, unknown> {
  const buttons = [
    ['START', 'demo-start-story'],
    ['LOAD', 'demo-open-save-load'],
    ['STORY TREE', 'demo-open-story-tree'],
    ['BACKLOG', 'demo-open-panel', { panel: 'backlog' }],
    ['GALLERY', 'demo-open-panel', { panel: 'gallery' }],
    ['ACHIEVEMENTS', 'demo-open-panel', { panel: 'achievement' }],
    ['CONFIG', 'demo-open-panel', { panel: 'settings' }],
  ] as const
  const backgroundWidth = MENU_STAGE_WIDTH * MENU_BACKGROUND_SCALE
  const backgroundHeight = MENU_STAGE_HEIGHT * MENU_BACKGROUND_SCALE
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
        bounds: { x: 0, y: 0, width: MENU_STAGE_WIDTH, height: MENU_STAGE_HEIGHT },
        visible: true,
        // `.vn-title-surface` base color, behind the photo.
        style: { backgroundColor: 'rgb(3,4,7)' },
        children: [
          {
            id: 'native-main-menu-background',
            kind: 'Image',
            bounds: {
              x: (MENU_STAGE_WIDTH - backgroundWidth) / 2,
              y: (MENU_STAGE_HEIGHT - backgroundHeight) / 2,
              width: backgroundWidth,
              height: backgroundHeight,
            },
            visible: true,
            image: { assetType: 'images', assetName: 'ui/menu-route.jpg' },
            style: {
              objectFit: 'cover',
              filter: { brightness: 0.46, saturate: 0.88 },
            },
          },
          // Matches the Web three-stop title scrim directly.
          {
            id: 'native-main-menu-linear-scrim',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: MENU_STAGE_WIDTH, height: MENU_STAGE_HEIGHT },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'linear',
                angleDegrees: 90,
                stops: [
                  { color: 'rgba(4,5,8,0.94)', position: 0 },
                  { color: 'rgba(4,5,8,0.34)', position: 0.5 },
                  { color: 'rgba(4,5,8,0.84)', position: 1 },
                ],
              },
            },
          },
          // `radial-gradient(circle at 52% 40%, rgba(11,19,30,0.24), rgba(3,4,7,0.78) 64%)`.
          // CSS sizes an unqualified radial gradient to the farthest corner;
          // expressed in quad-width units that is
          // sqrt(0.52^2 + (0.6 * 1080/1920)^2). It paints above the linear
          // scrim, and equal-z nodes keep projection order.
          {
            id: 'native-main-menu-radial-scrim',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: MENU_STAGE_WIDTH, height: MENU_STAGE_HEIGHT },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'radial',
                centerX: 0.52,
                centerY: 0.40,
                radius: 0.6199,
                shape: 'circle',
                stops: [
                  { color: 'rgba(11,19,30,0.24)', position: 0 },
                  { color: 'rgba(3,4,7,0.78)', position: 0.64 },
                ],
              },
            },
          },
          {
            id: 'native-main-menu-title',
            kind: 'Text',
            // Native vertically centres the em box inside these bounds, while
            // the Web positions the line via CSS half-leading (content top
            // 321.08, negative half-leading -24.8, hhea ascent ~1.151em). These
            // bounds are chosen so the rendered baseline lands on the same
            // y=416 as the Web line box without clipping the descender side.
            bounds: { x: MENU_COLUMN_X, y: 268, width: 660, height: 160 },
            visible: true,
            text: '断链纪元',
            style: {
              color: '#fffaf0',
              fontFamily: ['Noto Serif'],
              fontSize: 104,
              // The Web declares 700 but also `font-synthesis: none` with only
              // a 400 face registered, so it renders regular-weight glyphs.
              // Requesting 700 here would synthetically embolden and drift.
              fontWeight: 400,
              lineHeight: 104,
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
            // Nudged 4px up versus the Web rect: native centres the em box
            // while the Web centres the line box, which sits small text a few
            // pixels higher.
            bounds: { x: MENU_COLUMN_X, y: 424, width: 520, height: 28 },
            visible: true,
            text: 'BROKEN LINK ERA',
            style: {
              color: 'rgba(235,204,144,0.78)',
              fontFamily: ['Noto Sans'],
              fontSize: 12,
              letterSpacing: 2.16,
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
          ...buttons.flatMap(([label, action, metadata], index) =>
            nativeMainMenuButtonNodes(label, action, metadata, index)),
        ],
      },
    },
  }
}

function nativeMainMenuButtonNodes(
  label: string,
  action: string,
  metadata: Record<string, string> | undefined,
  index: number,
): Record<string, unknown>[] {
  const id = `native-main-menu-${label.toLowerCase().replaceAll(' ', '-')}`
  const bounds = {
    x: MENU_COLUMN_X,
    y: MENU_BUTTON_FIRST_Y + index * MENU_BUTTON_PITCH,
    width: MENU_BUTTON_WIDTH,
    height: MENU_BUTTON_HEIGHT,
  }
  const baseStyle = {
    backgroundGradient: {
      kind: 'linear',
      angleDegrees: 90,
      stops: [
        { color: 'rgba(9,12,18,0.94)', position: 0 },
        { color: 'rgba(22,26,36,0.74)', position: 1 },
      ],
    },
    borderColor: 'rgba(245,226,190,0.24)',
    borderWidth: 1,
    borderRadius: 0,
    color: 'rgba(255,250,242,0.92)',
    fontFamily: ['Noto Sans'],
    fontSize: 12,
    letterSpacing: 1.56,
    textAlign: 'left',
    // The 7px bottom padding lifts the label to where the Web's line-box
    // centring puts it; native centres the em box, which sits ~3.5px lower.
    padding: { top: 0, right: 18, bottom: 7, left: 20 },
    // Web stacks `inset 0 1px 0 rgba(255,255,255,0.06)` with an outer drop
    // shadow. Native carries one shadow per node, so the outer half lives on
    // the `-outer-shadow` node below.
    boxShadow: {
      offsetX: 0,
      offsetY: 1,
      blurRadius: 0,
      spreadRadius: 0,
      color: 'rgba(255,255,255,0.06)',
      inset: true,
    },
  }
  const hoverStyle = {
    ...baseStyle,
    backgroundGradient: {
      kind: 'linear',
      angleDegrees: 90,
      stops: [
        { color: 'rgba(34,29,22,0.96)', position: 0 },
        { color: 'rgba(27,29,36,0.78)', position: 1 },
      ],
    },
    color: '#ffe8b3',
    boxShadow: {
      offsetX: 0,
      offsetY: 1,
      blurRadius: 0,
      spreadRadius: 0,
      color: 'rgba(255,255,255,0.08)',
      inset: true,
    },
  }
  const activeStyle = {
    ...hoverStyle,
    backgroundGradient: {
      kind: 'linear',
      angleDegrees: 90,
      stops: [
        { color: 'rgba(44,37,26,0.98)', position: 0 },
        { color: 'rgba(32,34,42,0.84)', position: 1 },
      ],
    },
  }
  // `translateX(3px)` on hover/focus in the Web build.
  const hoverBounds = { ...bounds, x: bounds.x + 3 }
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
          color: 'rgba(0,0,0,0.26)',
          inset: false,
        },
      },
    },
    {
      // Web layers the button gradient over an opaque `rgba(9,12,18,0.88)`
      // base. A node with a gradient resolves its background color to
      // transparent, so the base needs its own node.
      id: `${id}-base`,
      kind: 'Box',
      bounds,
      visible: true,
      style: { backgroundColor: 'rgba(9,12,18,0.88)' },
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
        hover: { bounds: hoverBounds, style: hoverStyle },
        active: { bounds: { ...bounds, x: bounds.x + 2, y: bounds.y + 2 }, style: activeStyle },
        focus: { bounds: hoverBounds, style: hoverStyle },
        'focus-visible': {
          bounds: hoverBounds,
          style: { ...hoverStyle, borderColor: '#f0c15a' },
        },
      },
      transitions: [
        // Match shell.scss `cubic-bezier(0.19, 1, 0.22, 1)` for the slide.
        { property: 'transform', durationMs: 160, easing: 'cubic-bezier(0.19, 1, 0.22, 1)' },
        { property: 'background-color', durationMs: 160, easing: 'ease' },
        { property: 'color', durationMs: 160, easing: 'ease' },
        { property: 'border-color', durationMs: 160, easing: 'ease' },
        { property: 'box-shadow', durationMs: 160, easing: 'ease' },
      ],
      style: baseStyle,
    },
    {
      // `.vn-main-menu__actions button::before`: a 3x30 rule inset 8px from the
      // top, one pixel outside the left border. Its 0.48 color is multiplied by
      // the pseudo-element's 0.64 opacity.
      id: `${id}-accent`,
      kind: 'Box',
      bounds: { x: bounds.x - 1, y: bounds.y + 8, width: 3, height: 30 },
      visible: true,
      style: { backgroundColor: 'rgba(245,226,190,0.307)' },
    },
    {
      // `::after`: a 6x6 box showing only its top and right borders, rotated
      // 45deg. That resolves to a `>` about 4.2px wide and 8.5px tall, centred
      // on (right - 20, top + 23).
      id: `${id}-chevron`,
      kind: 'Box',
      role: 'ui-chevron-right',
      bounds: {
        x: bounds.x + bounds.width - 22,
        y: bounds.y + 19,
        width: 5,
        height: 9,
      },
      visible: true,
      style: { backgroundColor: 'rgba(255,250,242,0.313)' },
    },
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

// Stage dimensions shared with createNativeMainMenuSurface.
const SHELL_STAGE_WIDTH = MENU_STAGE_WIDTH
const SHELL_STAGE_HEIGHT = MENU_STAGE_HEIGHT

/**
 * Always-on game-shell vignette overlay (HUD stack, z-index 2).
 *
 * Mirrors `.game-root::before` from shell.scss:
 *   background:
 *     linear-gradient(180deg, rgba(5,5,7,0.24), transparent 18%, transparent 72%, rgba(5,5,7,0.34)),
 *     radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,0.34) 100%);
 *
 * Native projects both gradients with their original ordered stop lists.
 *
 * NOT included / deferred:
 *   - `.game-root::after` (grid scanlines): uses `mix-blend-mode: soft-light`.
 *     The wgpu renderer has no per-command blend-mode pipeline; all Shape draws
 *     composite over-alpha.  Adding scanlines without soft-light would darken
 *     rather than texture the scene, which is worse than omitting them.  Defer
 *     until a dedicated blend-mode pipeline pass is available.
 *   - `backdrop-filter: blur(...)` (used on dialogue toolbar, quick-menu, and
 *     several modal panels in the web build): requires reading already-composited
 *     pixels before drawing the current primitive, which means a mid-frame render-
 *     target copy and a second shader pass.  Defer until the wgpu encoder exposes
 *     a copyTextureToTexture resolve step inside the Safe/Overlay pass.
 */
export function createNativeShellVignetteOverlay(): Record<string, unknown> {
  return {
    visible: true,
    interactive: false,
    overlayStack: 'hud',
    zIndex: 2,
    surface: {
      key: 'demo/native-shell-vignette.qui',
      root: {
        id: 'native-shell-vignette',
        kind: 'Stack',
        bounds: { x: 0, y: 0, width: SHELL_STAGE_WIDTH, height: SHELL_STAGE_HEIGHT },
        visible: true,
        children: [
          // Radial edge vignette: transparent centre → dark corners.
          // CSS: radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,0.34) 100%)
          // Ellipse geometry stays in normalized UV space, so the centered
          // farthest corner radius is sqrt(0.5^2 + 0.5^2).
          {
            id: 'native-shell-vignette-radial',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: SHELL_STAGE_WIDTH, height: SHELL_STAGE_HEIGHT },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'radial',
                centerX: 0.5,
                centerY: 0.5,
                radius: Math.SQRT1_2,
                shape: 'ellipse',
                stops: [
                  { color: 'rgba(0,0,0,0.0)', position: 0.46 },
                  { color: 'rgba(0,0,0,0.34)', position: 1 },
                ],
              },
            },
          },
          // Matches the Web four-stop vertical vignette directly.
          {
            id: 'native-shell-vignette-linear',
            kind: 'Box',
            bounds: { x: 0, y: 0, width: SHELL_STAGE_WIDTH, height: SHELL_STAGE_HEIGHT },
            visible: true,
            style: {
              backgroundGradient: {
                kind: 'linear',
                angleDegrees: 180,
                stops: [
                  { color: 'rgba(5,5,7,0.24)', position: 0 },
                  { color: 'rgba(5,5,7,0.0)', position: 0.18 },
                  { color: 'rgba(5,5,7,0.0)', position: 0.72 },
                  { color: 'rgba(5,5,7,0.34)', position: 1 },
                ],
              },
            },
          },
        ],
      },
    },
  }
}
