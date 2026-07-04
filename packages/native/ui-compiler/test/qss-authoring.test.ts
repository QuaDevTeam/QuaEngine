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
  box-sizing: border-box;
  margin: 10vw;
}
`)

    expect(document.rules).toHaveLength(1)
    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_TARGET_UNSUPPORTED_FEATURE' }),
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_UNIT' }),
    ]))
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

  it('diagnoses invalid native-wgpu QSS declaration values before projection', () => {
    const invalid = analyzeQssSource(`
Button {
  border-width: -1px;
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

    expect(invalid.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(35)
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
