import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  resolveNativeQssDeclarations,
} from '../src'

describe('@quajs/native-ui-compiler QSS authoring', () => {
  it('validates QSS selector subset and native-wgpu property gates', () => {
    const document = analyzeQssSource(`
Panel::part(header), Button.primary:hover {
  background-color: #10141f;
  padding: 12px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  margin: 10vw;
}
`)

    expect(document.rules).toHaveLength(1)
    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_UNIT' }),
    ]))
  })

  it('resolves safe panel and text shadows into structured native style IR', () => {
    const document = analyzeQssSource(`
Panel {
  box-shadow: 0 18px 48px 2px rgba(0,0,0,0.32);
  text-shadow: 0 2px 10px #000a;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations).style).toMatchObject({
      boxShadow: {
        blurRadius: 48,
        color: 'rgba(0,0,0,0.32)',
        inset: false,
        offsetX: 0,
        offsetY: 18,
        spreadRadius: 2,
      },
      textShadow: {
        blurRadius: 10,
        color: '#000a',
        inset: false,
        offsetX: 0,
        offsetY: 2,
        spreadRadius: 0,
      },
    })
  })

  it('accepts inset and negative box spread while rejecting multiple text shadows', () => {
    const document = analyzeQssSource(`
Panel {
  box-shadow: inset 0 2px 8px -3px #000;
  text-shadow: 0 2px 8px #000, 0 4px 16px #000;
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(1)
    expect(resolveNativeQssDeclarations(document.rules[0].declarations).style.boxShadow).toEqual({
      blurRadius: 8,
      color: '#000',
      inset: true,
      offsetX: 0,
      offsetY: 2,
      spreadRadius: -3,
    })
  })

  it('accepts opacity as a native-wgpu QSS feature', () => {
    const document = analyzeQssSource(`
Panel {
  opacity: 0.64;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.rules[0].declarations.map(item => item.name)).toContain('opacity')
  })

  it('accepts z-index as native-wgpu projection metadata', () => {
    const document = analyzeQssSource(`
Layer {
  z-index: 10;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.rules[0].declarations.map(item => item.name)).toContain('z-index')
  })

  it('preserves and distributes ordered multi-stop gradient positions', () => {
    const document = analyzeQssSource(`
Panel.linear {
  background-image: linear-gradient(90deg, #010203 10%, #223344, #fefefe 90%);
}
Panel.radial {
  background-image: radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,0.34) 100%);
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations).style.backgroundGradient).toEqual({
      angleDegrees: 90,
      kind: 'linear',
      stops: [
        { color: '#010203', position: 0.1 },
        { color: '#223344', position: 0.5 },
        { color: '#fefefe', position: 0.9 },
      ],
    })
    expect(resolveNativeQssDeclarations(document.rules[1].declarations).style.backgroundGradient).toEqual({
      centerX: 0.5,
      centerY: 0.5,
      kind: 'radial',
      radius: Math.SQRT1_2,
      shape: 'ellipse',
      stops: [
        { color: 'transparent', position: 0.46 },
        { color: 'rgba(0,0,0,0.34)', position: 1 },
      ],
    })
  })

  it('rejects decreasing or hard-stop gradient positions before projection', () => {
    const document = analyzeQssSource(`
Panel.decreasing {
  background-image: linear-gradient(#000 70%, #fff 20%);
}
Panel.hard-stop {
  background-image: radial-gradient(circle, #000 40%, #fff 40%);
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(2)
    for (const rule of document.rules) {
      expect(resolveNativeQssDeclarations(rule.declarations).style.backgroundGradient).toBeUndefined()
    }
  })

  it('resolves position declarations into compiler-only layout metadata', () => {
    const document = analyzeQssSource(`
Button {
  position: absolute;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      layout: {
        position: 'absolute',
      },
      style: {},
    })
  })

  it('resolves structural alignment declarations into compiler-only layout metadata', () => {
    const document = analyzeQssSource(`
Row {
  justify-content: space-between;
  align-items: center;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      layout: {
        justifyContent: 'space-between',
        alignItems: 'center',
      },
      style: {},
    })
  })

  it('diagnoses invalid structural alignment declarations before projection', () => {
    const document = analyzeQssSource(`
Row {
  justify-content: stretch;
  align-items: baseline;
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(2)
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('diagnoses invalid position declarations before projection', () => {
    const document = analyzeQssSource(`
Button {
  position: fixed;
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({ code: 'QSS_INVALID_VALUE' }),
    ])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('resolves margin declarations into compiler-only layout metadata', () => {
    const document = analyzeQssSource(`
Button {
  margin: 2px 4px;
  margin-top: 8px;
  margin-left: 10px;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      layout: {
        margin: {
          top: 8,
          right: 4,
          bottom: 2,
          left: 10,
        },
      },
      style: {},
    })
  })

  it('diagnoses invalid margin declarations before projection', () => {
    const document = analyzeQssSource(`
Button {
  margin: 1px 2px 3px 4px 5px;
  margin-left: -1px;
  margin-right: calc(1px);
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(3)
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('resolves gap declarations into compiler-only layout metadata', () => {
    const document = analyzeQssSource(`
Row {
  gap: 8px 12px;
  row-gap: 4px;
  column-gap: 16px;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      layout: {
        rowGap: 4,
        columnGap: 16,
      },
      style: {},
    })
  })

  it('diagnoses invalid gap declarations before projection', () => {
    const document = analyzeQssSource(`
Row {
  gap: 1px 2px 3px;
  row-gap: -1px;
  column-gap: calc(1px);
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(3)
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('resolves pointer-events into compiler-only intent metadata', () => {
    const document = analyzeQssSource(`
Button.disabled-hit {
  pointer-events: none;
}
Button.enabled-hit {
  pointer-events: auto;
}
Button.invalid-hit {
  pointer-events: disabled;
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(1)
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      interactive: false,
      style: {},
    })
    expect(resolveNativeQssDeclarations(document.rules[1].declarations)).toEqual({
      interactive: true,
      style: {},
    })
    expect(resolveNativeQssDeclarations(document.rules[2].declarations)).toEqual({
      style: {},
    })
  })

  it('applies content-box sizing to QSS fallback bounds before projection', () => {
    const document = analyzeQssSource(`
Button {
  width: 100px;
  height: 40px;
  min-width: 120px;
  max-width: 140px;
  padding: 5px 10px;
  border-width: 2px;
  box-sizing: content-box;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      bounds: {
        width: 144,
        height: 54,
      },
      style: {
        borderWidth: 2,
        padding: { top: 5, right: 10, bottom: 5, left: 10 },
      },
    })
  })

  it('diagnoses invalid box-sizing declarations before projection', () => {
    const document = analyzeQssSource(`
Button {
  box-sizing: padding-box;
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({ code: 'QSS_INVALID_VALUE' }),
    ])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('resolves native-wgpu QSS declarations into surface style IR', () => {
    const document = analyzeQssSource(`
Button.primary {
  background-color: #10141f;
  background-image: asset("ui/panel.png");
  background-position: right bottom;
  background-size: contain;
  border-color: #31415f;
  border-radius: 8px;
  border-style: solid;
  border-width: 1px;
  color: #f6f8ff;
  font-family: "Inter", system-ui;
  font-size: 18px;
  font-style: italic;
  font-weight: 600;
  inset: 4px 8px 16px 12px;
  letter-spacing: 1.5px;
  line-height: 1.25;
  left: -12px;
  max-height: 40px;
  max-width: 160px;
  min-height: 56px;
  min-width: 220px;
  object-fit: cover;
  object-position: right top;
  opacity: 1.4;
  overflow: hidden;
  padding: 12px 20px;
  padding-left: 24px;
  right: 10px;
  text-align: center;
  text-decoration: underline;
  text-overflow: ellipsis;
  text-transform: uppercase;
  top: 32px;
  bottom: 18px;
  visibility: hidden;
  white-space: pre-wrap;
  width: 180px;
  height: 48px;
  z-index: 12;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      bounds: { x: -12, y: 32, width: 220, height: 56, right: 10, bottom: 18 },
      clipChildren: true,
      visible: false,
      zIndex: 12,
      style: {
        backgroundColor: '#10141f',
        backgroundImage: { assetType: 'images', assetName: 'ui/panel.png' },
        backgroundPosition: { x: 1, y: 1 },
        backgroundSize: 'contain',
        borderColor: '#31415f',
        borderRadius: 8,
        borderStyle: 'solid',
        borderWidth: 1,
        color: '#f6f8ff',
        fontFamily: ['Inter', 'system-ui'],
        fontSize: 18,
        fontStyle: 'italic',
        fontWeight: 600,
        letterSpacing: 1.5,
        lineHeight: 1.25,
        objectFit: 'cover',
        objectPosition: { x: 1, y: 0 },
        opacity: 1,
        padding: { top: 12, right: 20, bottom: 12, left: 24 },
        textAlign: 'center',
        textDecoration: 'underline',
        textOverflow: 'ellipsis',
        textTransform: 'uppercase',
        whiteSpace: 'pre-wrap',
      },
    })
  })

  it('omits invalid QSS declaration values from resolved surface style IR', () => {
    const document = analyzeQssSource(`
Button {
  background-color: url("native.dll");
  border-width: -1px;
  box-sizing: padding-box;
  border-radius: calc(4px);
  border-color: ../native.dll;
  border-style: dashed;
  color: rgb(300, 0, 0);
  display: block;
  font-style: oblique;
  font-weight: heavy;
  letter-spacing: -1px;
  height: -1px;
  inset: 1px 2px 3px 4px 5px;
  left: calc(2px);
  max-height: -20px;
  max-width: -10px;
  min-height: calc(10px);
  min-width: -8px;
  object-fit: stretch;
  object-position: 120% center;
  opacity: none;
  overflow: clip;
  padding: 1px 2px 3px 4px 5px;
  padding-left: -4px;
  right: -2px;
  text-align: start;
  text-decoration: blink;
  text-overflow: fade;
  text-transform: titlecase;
  top: calc(1px);
  bottom: calc(2px);
  visibility: collapse;
  white-space: preserve;
  width: -4px;
  z-index: 1.5;
  background-image: asset("../escape.png");
  background-position: 10px 20px;
  background-size: repeat;
}
`, {
      lint: {
        allowPreviewFeatures: true,
      },
    })

    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      style: {},
    })
  })

  it('rejects segmented and native-payload QSS asset references before projection', () => {
    const document = analyzeQssSource(`
Panel.empty-segment {
  background-image: asset("ui//panel.png");
}
Panel.dot-segment {
  background-image: asset("ui/./panel.png");
}
Panel.trailing-slash {
  background-image: asset("ui/panel.png/");
}
Panel.native-payload {
  background-image: asset("ui/native.dll");
}
Panel.backslash {
  background-image: asset("ui\\panel.png");
}
`)

    expect(document.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(5)
    for (const rule of document.rules) {
      expect(resolveNativeQssDeclarations(rule.declarations)).toEqual({
        style: {},
      })
    }
  })

  it('diagnoses invalid native-wgpu QSS declaration values before projection', () => {
    const invalid = analyzeQssSource(`
Button {
  border-width: -1px;
  box-sizing: padding-box;
  border-radius: calc(4px);
  border-color: ../native.dll;
  border-style: dashed;
  color: rgb(300, 0, 0);
  display: block;
  font-style: oblique;
  font-weight: heavy;
  letter-spacing: -1px;
  height: -1px;
  inset: 1px 2px 3px 4px 5px;
  left: calc(2px);
  max-height: -20px;
  max-width: -10px;
  min-height: calc(10px);
  min-width: -8px;
  object-fit: stretch;
  object-position: 120% center;
  opacity: none;
  overflow: clip;
  padding: 1px 2px 3px 4px 5px;
  padding-left: -4px;
  right: -2px;
  text-align: start;
  text-decoration: blink;
  text-overflow: fade;
  text-transform: titlecase;
  top: calc(1px);
  bottom: calc(2px);
  visibility: collapse;
  white-space: preserve;
  width: -4px;
  z-index: 1.5;
  background-image: asset("../escape.png");
  background-position: 10px 20px;
  background-size: repeat;
}
`)
    const valid = analyzeQssSource(`
Button {
  background-color: transparent;
  border-width: 0;
  border-radius: 0px;
  border-color: rgba(1, 2, 3, 0.4);
  border-style: none;
  color: currentColor;
  display: none;
  font-style: normal;
  font-weight: 0;
  letter-spacing: normal;
  height: 24px;
  inset: 0 1px 2px 3px;
  left: -12px;
  max-height: 64px;
  max-width: 320px;
  min-height: 20px;
  min-width: 120px;
  object-fit: scale-down;
  object-position: 25% 75%;
  opacity: 0;
  overflow: visible;
  padding: 12px 16px;
  padding-left: 20px;
  right: 24px;
  text-align: justify;
  text-decoration: line-through;
  text-overflow: clip;
  text-transform: capitalize;
  top: 0;
  bottom: 12px;
  visibility: visible;
  white-space: nowrap;
  width: 240px;
  z-index: 0;
  background-image: asset("ui/panel.png");
  background-position: 0% 100%;
  background-size: none;
}
`)

    expect(invalid.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(37)
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('border-color must be a safe native color literal'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('color must be a safe native color literal'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('background-image'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('background-position'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('object-position'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('background-size supports cover'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('border-style supports solid or none'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('display currently supports none'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('font-style supports normal or italic'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('letter-spacing must be normal'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('inset supports one to four'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('max-height must be a non-negative logical px'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('min-width must be a non-negative logical px'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('padding supports'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('right must be a non-negative logical px'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('bottom must be a non-negative logical px'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('text-decoration supports none'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('text-overflow supports clip'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('text-transform supports none'),
      }),
      expect.objectContaining({
        code: 'QSS_INVALID_VALUE',
        message: expect.stringContaining('white-space supports normal'),
      }),
    ]))
    expect(valid.diagnostics).toEqual([])
  })
})
