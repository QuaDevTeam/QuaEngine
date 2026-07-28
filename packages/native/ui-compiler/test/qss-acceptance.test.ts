import type { NativeQssResolvedNodeStyle } from '../src'
import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  nativeQssProperties,
  resolveNativeQssDeclarations,
} from '../src'

interface QssAcceptanceCase {
  expected: NativeQssResolvedNodeStyle
  invalidDeclaration: string
  validDeclarations: readonly string[]
}

const qssAcceptanceCases: Record<string, QssAcceptanceCase> = {
  'align-items': {
    validDeclarations: ['align-items: flex-end'],
    invalidDeclaration: 'align-items: baseline',
    expected: { layout: { alignItems: 'flex-end' }, style: {} },
  },
  'background-color': {
    validDeclarations: ['background-color: #abcdef'],
    invalidDeclaration: 'background-color: rgb(256, 0, 0)',
    expected: { style: { backgroundColor: '#abcdef' } },
  },
  'background-image': {
    validDeclarations: ['background-image: asset("ui/panel.png", "images")'],
    invalidDeclaration: 'background-image: asset("../escape.png")',
    expected: { style: { backgroundImage: { assetName: 'ui/panel.png', assetType: 'images' } } },
  },
  'background-position': {
    validDeclarations: ['background-position: 25% 75%'],
    invalidDeclaration: 'background-position: 120% center',
    expected: { style: { backgroundPosition: { x: 0.25, y: 0.75 } } },
  },
  'background-size': {
    validDeclarations: ['background-size: scale-down'],
    invalidDeclaration: 'background-size: repeat',
    expected: { style: { backgroundSize: 'scale-down' } },
  },
  'border-color': {
    validDeclarations: ['border-color: rgba(1, 2, 3, 0.4)'],
    invalidDeclaration: 'border-color: rgb(300, 0, 0)',
    expected: { style: { borderColor: 'rgba(1, 2, 3, 0.4)' } },
  },
  'border-radius': {
    validDeclarations: ['border-radius: 8px'],
    invalidDeclaration: 'border-radius: -1px',
    expected: { style: { borderRadius: 8 } },
  },
  'border-style': {
    validDeclarations: ['border-style: none'],
    invalidDeclaration: 'border-style: dashed',
    expected: { style: { borderStyle: 'none' } },
  },
  'border-width': {
    validDeclarations: ['border-width: 2px'],
    invalidDeclaration: 'border-width: -1px',
    expected: { style: { borderWidth: 2 } },
  },
  'bottom': {
    validDeclarations: ['bottom: 12px'],
    invalidDeclaration: 'bottom: -2px',
    expected: { bounds: { bottom: 12 }, style: {} },
  },
  'box-shadow': {
    validDeclarations: ['box-shadow: 0 18px 48px 2px rgba(0,0,0,0.32)'],
    invalidDeclaration: 'box-shadow: 0 4px 12px #000, 0 8px 20px #000',
    expected: {
      style: {
        boxShadow: {
          blurRadius: 48,
          color: 'rgba(0,0,0,0.32)',
          inset: false,
          offsetX: 0,
          offsetY: 18,
          spreadRadius: 2,
        },
      },
    },
  },
  'box-sizing': {
    validDeclarations: ['width: 20px', 'padding: 4px 6px', 'border-width: 1px', 'box-sizing: content-box'],
    invalidDeclaration: 'box-sizing: padding-box',
    expected: {
      bounds: { width: 34 },
      style: {
        borderWidth: 1,
        padding: { top: 4, right: 6, bottom: 4, left: 6 },
      },
    },
  },
  'color': {
    validDeclarations: ['color: currentColor'],
    invalidDeclaration: 'color: hsl(0, 0, 0)',
    expected: { style: { color: 'currentColor' } },
  },
  'column-gap': {
    validDeclarations: ['column-gap: 16px'],
    invalidDeclaration: 'column-gap: calc(1px)',
    expected: { layout: { columnGap: 16 }, style: {} },
  },
  'display': {
    validDeclarations: ['display: none'],
    invalidDeclaration: 'display: block',
    expected: { style: {}, visible: false },
  },
  'filter': {
    validDeclarations: [
      'filter: blur(12px) contrast(1.2)',
      // Must be last so the final value matches `expected`.
      'filter: brightness(46%) saturate(0.88)',
    ],
    invalidDeclaration: 'filter: drop-shadow(2px 2px 4px black)',
    expected: { style: { filter: { brightness: 0.46, saturate: 0.88 } } },
  },
  'font-family': {
    validDeclarations: ['font-family: "Inter", system-ui'],
    invalidDeclaration: 'font-family: ,',
    expected: { style: { fontFamily: ['Inter', 'system-ui'] } },
  },
  'font-size': {
    validDeclarations: ['font-size: 18px'],
    invalidDeclaration: 'font-size: -1px',
    expected: { style: { fontSize: 18 } },
  },
  'font-style': {
    validDeclarations: ['font-style: italic'],
    invalidDeclaration: 'font-style: oblique',
    expected: { style: { fontStyle: 'italic' } },
  },
  'font-weight': {
    validDeclarations: ['font-weight: 600'],
    invalidDeclaration: 'font-weight: heavy',
    expected: { style: { fontWeight: 600 } },
  },
  'gap': {
    validDeclarations: ['gap: 8px 12px'],
    invalidDeclaration: 'gap: 1px 2px 3px',
    expected: { layout: { rowGap: 8, columnGap: 12 }, style: {} },
  },
  'height': {
    validDeclarations: ['height: 48px'],
    invalidDeclaration: 'height: -1px',
    expected: { bounds: { height: 48 }, style: {} },
  },
  'inset': {
    validDeclarations: ['inset: 1px 2px 3px 4px'],
    invalidDeclaration: 'inset: 1px 2px 3px 4px 5px',
    expected: { bounds: { x: 4, y: 1, right: 2, bottom: 3 }, style: {} },
  },
  'justify-content': {
    validDeclarations: ['justify-content: space-evenly'],
    invalidDeclaration: 'justify-content: stretch',
    expected: { layout: { justifyContent: 'space-evenly' }, style: {} },
  },
  'left': {
    validDeclarations: ['left: -12px'],
    invalidDeclaration: 'left: calc(2px)',
    expected: { bounds: { x: -12 }, style: {} },
  },
  'letter-spacing': {
    validDeclarations: ['letter-spacing: normal'],
    invalidDeclaration: 'letter-spacing: -1px',
    expected: { style: { letterSpacing: 0 } },
  },
  'line-height': {
    validDeclarations: ['line-height: 1.25'],
    invalidDeclaration: 'line-height: -1',
    expected: { style: { lineHeight: 1.25 } },
  },
  'margin': {
    validDeclarations: ['margin: 2px 4px 6px 8px'],
    invalidDeclaration: 'margin: 1px 2px 3px 4px 5px',
    expected: { layout: { margin: { top: 2, right: 4, bottom: 6, left: 8 } }, style: {} },
  },
  'margin-bottom': {
    validDeclarations: ['margin-bottom: 7px'],
    invalidDeclaration: 'margin-bottom: -1px',
    expected: { layout: { margin: { top: 0, right: 0, bottom: 7, left: 0 } }, style: {} },
  },
  'margin-left': {
    validDeclarations: ['margin-left: 7px'],
    invalidDeclaration: 'margin-left: -1px',
    expected: { layout: { margin: { top: 0, right: 0, bottom: 0, left: 7 } }, style: {} },
  },
  'margin-right': {
    validDeclarations: ['margin-right: 7px'],
    invalidDeclaration: 'margin-right: -1px',
    expected: { layout: { margin: { top: 0, right: 7, bottom: 0, left: 0 } }, style: {} },
  },
  'margin-top': {
    validDeclarations: ['margin-top: 7px'],
    invalidDeclaration: 'margin-top: -1px',
    expected: { layout: { margin: { top: 7, right: 0, bottom: 0, left: 0 } }, style: {} },
  },
  'max-height': {
    validDeclarations: ['height: 80px', 'max-height: 40px'],
    invalidDeclaration: 'max-height: -1px',
    expected: { bounds: { height: 40 }, style: {} },
  },
  'max-width': {
    validDeclarations: ['width: 80px', 'max-width: 40px'],
    invalidDeclaration: 'max-width: -1px',
    expected: { bounds: { width: 40 }, style: {} },
  },
  'min-height': {
    validDeclarations: ['height: 10px', 'min-height: 20px'],
    invalidDeclaration: 'min-height: -1px',
    expected: { bounds: { height: 20 }, style: {} },
  },
  'min-width': {
    validDeclarations: ['width: 10px', 'min-width: 20px'],
    invalidDeclaration: 'min-width: -1px',
    expected: { bounds: { width: 20 }, style: {} },
  },
  'object-fit': {
    validDeclarations: ['object-fit: contain'],
    invalidDeclaration: 'object-fit: stretch',
    expected: { style: { objectFit: 'contain' } },
  },
  'object-position': {
    validDeclarations: ['object-position: right top'],
    invalidDeclaration: 'object-position: 120% center',
    expected: { style: { objectPosition: { x: 1, y: 0 } } },
  },
  'opacity': {
    validDeclarations: ['opacity: 1.4'],
    invalidDeclaration: 'opacity: none',
    expected: { style: { opacity: 1 } },
  },
  'overflow': {
    validDeclarations: ['overflow: hidden'],
    invalidDeclaration: 'overflow: clip',
    expected: { clipChildren: true, style: {} },
  },
  'padding': {
    validDeclarations: ['padding: 1px 2px 3px 4px'],
    invalidDeclaration: 'padding: 1px 2px 3px 4px 5px',
    expected: { style: { padding: { top: 1, right: 2, bottom: 3, left: 4 } } },
  },
  'padding-bottom': {
    validDeclarations: ['padding-bottom: 7px'],
    invalidDeclaration: 'padding-bottom: -1px',
    expected: { style: { padding: { top: 0, right: 0, bottom: 7, left: 0 } } },
  },
  'padding-left': {
    validDeclarations: ['padding-left: 7px'],
    invalidDeclaration: 'padding-left: -1px',
    expected: { style: { padding: { top: 0, right: 0, bottom: 0, left: 7 } } },
  },
  'padding-right': {
    validDeclarations: ['padding-right: 7px'],
    invalidDeclaration: 'padding-right: -1px',
    expected: { style: { padding: { top: 0, right: 7, bottom: 0, left: 0 } } },
  },
  'padding-top': {
    validDeclarations: ['padding-top: 7px'],
    invalidDeclaration: 'padding-top: -1px',
    expected: { style: { padding: { top: 7, right: 0, bottom: 0, left: 0 } } },
  },
  'pointer-events': {
    validDeclarations: ['pointer-events: none'],
    invalidDeclaration: 'pointer-events: disabled',
    expected: { interactive: false, style: {} },
  },
  'position': {
    validDeclarations: ['position: absolute'],
    invalidDeclaration: 'position: fixed',
    expected: { layout: { position: 'absolute' }, style: {} },
  },
  'right': {
    validDeclarations: ['right: 10px'],
    invalidDeclaration: 'right: -2px',
    expected: { bounds: { right: 10 }, style: {} },
  },
  'row-gap': {
    validDeclarations: ['row-gap: 8px'],
    invalidDeclaration: 'row-gap: -1px',
    expected: { layout: { rowGap: 8 }, style: {} },
  },
  'text-align': {
    validDeclarations: ['text-align: justify'],
    invalidDeclaration: 'text-align: start',
    expected: { style: { textAlign: 'justify' } },
  },
  'text-decoration': {
    validDeclarations: ['text-decoration: underline'],
    invalidDeclaration: 'text-decoration: blink',
    expected: { style: { textDecoration: 'underline' } },
  },
  'text-overflow': {
    validDeclarations: ['text-overflow: ellipsis'],
    invalidDeclaration: 'text-overflow: fade',
    expected: { style: { textOverflow: 'ellipsis' } },
  },
  'text-shadow': {
    validDeclarations: ['text-shadow: 0 2px 10px rgba(0,0,0,0.72)'],
    invalidDeclaration: 'text-shadow: 0 2px 8px #000, 0 4px 16px #000',
    expected: {
      style: {
        textShadow: {
          blurRadius: 10,
          color: 'rgba(0,0,0,0.72)',
          inset: false,
          offsetX: 0,
          offsetY: 2,
          spreadRadius: 0,
        },
      },
    },
  },
  'text-transform': {
    validDeclarations: ['text-transform: uppercase'],
    invalidDeclaration: 'text-transform: titlecase',
    expected: { style: { textTransform: 'uppercase' } },
  },
  'transform': {
    validDeclarations: [
      // Single declaration with rotate + translate + scale so the resolver
      // produces a single combined output (rotate goes to both style.rotateDeg
      // and layout.transform.rotateDeg per the resolver contract).
      'transform: rotate(30deg) translate(12px, -4px) scale(1.5, 0.5)',
    ],
    invalidDeclaration: 'transform: skew(10deg)',
    expected: {
      layout: {
        transform: {
          originX: 0.5,
          originY: 0.5,
          rotateDeg: 30,
          scaleX: 1.5,
          scaleY: 0.5,
          translateX: 12,
          translateY: -4,
        },
      },
      style: { rotateDeg: 30 },
    },
  },
  'transform-origin': {
    validDeclarations: ['transform-origin: right bottom'],
    invalidDeclaration: 'transform-origin: 120% center',
    expected: {
      layout: {
        transform: {
          originX: 1,
          originY: 1,
          scaleX: 1,
          scaleY: 1,
          translateX: 0,
          translateY: 0,
        },
      },
      style: {},
    },
  },
  'transition': {
    validDeclarations: [
      // cubic-bezier strings must parse — put them before the expected entry
      // so the last declaration wins and matches `expected`.
      'transition: transform 220ms cubic-bezier(0.19, 1, 0.22, 1)',
      'transition: transform 180ms ease-out, background-color 0.16s ease',
    ],
    invalidDeclaration: 'transition: transform 8s spring',
    expected: {
      style: {},
      transitions: [
        { durationMs: 180, easing: 'ease-out', property: 'transform' },
        { durationMs: 160, easing: 'ease', property: 'background-color' },
      ],
    },
  },
  'translate': {
    validDeclarations: ['translate: 10px -3px'],
    invalidDeclaration: 'translate: calc(1px) 0',
    expected: {
      layout: {
        transform: {
          originX: 0.5,
          originY: 0.5,
          scaleX: 1,
          scaleY: 1,
          translateX: 10,
          translateY: -3,
        },
      },
      style: {},
    },
  },
  'scale': {
    validDeclarations: ['scale: 1.25 0.75'],
    invalidDeclaration: 'scale: -1',
    expected: {
      layout: {
        transform: {
          originX: 0.5,
          originY: 0.5,
          scaleX: 1.25,
          scaleY: 0.75,
          translateX: 0,
          translateY: 0,
        },
      },
      style: {},
    },
  },
  'top': {
    validDeclarations: ['top: -4px'],
    invalidDeclaration: 'top: calc(1px)',
    expected: { bounds: { y: -4 }, style: {} },
  },
  'visibility': {
    validDeclarations: ['visibility: hidden'],
    invalidDeclaration: 'visibility: collapse',
    expected: { style: {}, visible: false },
  },
  'white-space': {
    validDeclarations: ['white-space: pre-wrap'],
    invalidDeclaration: 'white-space: preserve',
    expected: { style: { whiteSpace: 'pre-wrap' } },
  },
  'width': {
    validDeclarations: ['width: 180px'],
    invalidDeclaration: 'width: -4px',
    expected: { bounds: { width: 180 }, style: {} },
  },
  'z-index': {
    validDeclarations: ['z-index: 12'],
    invalidDeclaration: 'z-index: 1.5',
    expected: { style: {}, zIndex: 12 },
  },
}

describe('@quajs/native-ui-compiler QSS acceptance matrix', () => {
  it('keeps native-wgpu registry features covered by acceptance fixtures', () => {
    const nativeWgpuProperties = nativeQssProperties
      .filter(property => property.nativeWgpu)
      .map(property => property.name)
      .sort()

    expect(Object.keys(qssAcceptanceCases).sort()).toEqual(nativeWgpuProperties)
  })

  it.each(Object.entries(qssAcceptanceCases))('accepts and resolves %s', (property, acceptance) => {
    expect(acceptance.validDeclarations.some(declaration => declaration.startsWith(`${property}:`))).toBe(true)

    const document = analyzeQssSource(sourceFor(acceptance.validDeclarations))

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual(acceptance.expected)
  })

  it.each(Object.entries(qssAcceptanceCases))('diagnoses and omits invalid %s values', (_property, acceptance) => {
    const document = analyzeQssSource(sourceFor([acceptance.invalidDeclaration]))

    expect(document.diagnostics).toEqual([
      expect.objectContaining({ code: 'QSS_INVALID_VALUE' }),
    ])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({ style: {} })
  })
})

function sourceFor(declarations: readonly string[]): string {
  return `Button {\n${declarations.map(declaration => `  ${declaration};`).join('\n')}\n}\n`
}
