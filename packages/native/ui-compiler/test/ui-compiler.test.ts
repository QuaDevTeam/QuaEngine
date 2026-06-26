import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { NativeUiSurfaceProjection } from '../src'
import {
  analyzeNativeUiDocument,
  analyzeQssSource,
  analyzeQuiSource,
  collectNativeUiSurfaceProjectionRequirements,
  compileNativeUiSurfaceProjection,
  createNativeUiSurfaceCompatibilityFromDocuments,
  createNativeUiSurfaceCompatibilityFromProjection,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
  parseQuiActionDescriptor,
  resolveNativeQssDeclarations,
} from '../src'

const SHARED_SURFACE_FRAME_FIXTURE = fileURLToPath(
  new URL('../../test-fixtures/renderer/qui-qss-surface-frame.json', import.meta.url),
)

describe('@quajs/native-ui-compiler', () => {
  it('exposes native-wgpu QUI and QSS capability feature lists', () => {
    expect(nativeWgpuQuiComponentNames()).toContain('Button')
    expect(nativeWgpuQuiComponentNames()).toContain('RichText')
    expect(nativeWgpuQuiComponentNames()).toContain('Scroll')
    expect(nativeWgpuQssFeatureNames()).toContain('background-color')
    expect(nativeWgpuQssFeatureNames()).toContain('background-image')
    expect(nativeWgpuQssFeatureNames()).toContain('background-position')
    expect(nativeWgpuQssFeatureNames()).toContain('background-size')
    expect(nativeWgpuQssFeatureNames()).toContain('border-style')
    expect(nativeWgpuQssFeatureNames()).toContain('bottom')
    expect(nativeWgpuQssFeatureNames()).toContain('display')
    expect(nativeWgpuQssFeatureNames()).toContain('height')
    expect(nativeWgpuQssFeatureNames()).toContain('inset')
    expect(nativeWgpuQssFeatureNames()).toContain('left')
    expect(nativeWgpuQssFeatureNames()).toContain('font-style')
    expect(nativeWgpuQssFeatureNames()).toContain('letter-spacing')
    expect(nativeWgpuQssFeatureNames()).toContain('max-height')
    expect(nativeWgpuQssFeatureNames()).toContain('max-width')
    expect(nativeWgpuQssFeatureNames()).toContain('min-height')
    expect(nativeWgpuQssFeatureNames()).toContain('min-width')
    expect(nativeWgpuQssFeatureNames()).toContain('object-fit')
    expect(nativeWgpuQssFeatureNames()).toContain('opacity')
    expect(nativeWgpuQssFeatureNames()).toContain('overflow')
    expect(nativeWgpuQssFeatureNames()).toContain('padding')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-bottom')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-left')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-right')
    expect(nativeWgpuQssFeatureNames()).toContain('padding-top')
    expect(nativeWgpuQssFeatureNames()).toContain('right')
    expect(nativeWgpuQssFeatureNames()).toContain('text-decoration')
    expect(nativeWgpuQssFeatureNames()).toContain('text-overflow')
    expect(nativeWgpuQssFeatureNames()).toContain('text-transform')
    expect(nativeWgpuQssFeatureNames()).toContain('top')
    expect(nativeWgpuQssFeatureNames()).toContain('visibility')
    expect(nativeWgpuQssFeatureNames()).toContain('white-space')
    expect(nativeWgpuQssFeatureNames()).toContain('width')
    expect(nativeWgpuQssFeatureNames()).toContain('z-index')
  })

  it('parses QUI imports, nodes, and safe directives', () => {
    const document = analyzeQuiSource(`
import style "./menu.qss";
import tokens "./theme.tokens.json";

Stack {
  Text(if: view.mode == "audio") { "Audio" }
  Button(action: ui.close()) { Text { "Close" } }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.imports.map(item => item.kind)).toEqual(['style', 'tokens'])
    expect(document.nodes.map(node => node.name)).toEqual(['Stack', 'Text', 'Button', 'Text'])
    expect(document.props.map(prop => prop.name)).toContain('if')
    expect(document.props.map(prop => prop.name)).toContain('action')
  })

  it('normalizes QUI action descriptors for native intent projection', () => {
    const document = analyzeQuiSource(`
Column {
  Button(action: ui.open("settings")) { Text { "Settings" } }
  Button(action: ui.close()) { Text { "Close" } }
  Button(action: choice.select(choice.id)) { Text { choice.label } }
  Button(action: save.load("slot-1")) { Text { "Load" } }
  Button(action: settings.update(settings.audio.enabled)) { Text { "Apply" } }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.actions.map(action => ({
      namespace: action.namespace,
      name: action.name,
      event: action.event,
      action: action.action,
      arguments: action.arguments,
    }))).toEqual([
      {
        namespace: 'ui',
        name: 'open',
        event: 'ui/intent',
        action: 'open',
        arguments: [{ kind: 'literal', source: '"settings"', value: 'settings' }],
      },
      {
        namespace: 'ui',
        name: 'close',
        event: 'ui/intent',
        action: 'close',
        arguments: [],
      },
      {
        namespace: 'choice',
        name: 'select',
        event: 'choice/select',
        action: 'select',
        arguments: [{ kind: 'reference', source: 'choice.id' }],
      },
      {
        namespace: 'save',
        name: 'load',
        event: 'ui/intent',
        action: 'save.load',
        arguments: [{ kind: 'literal', source: '"slot-1"', value: 'slot-1' }],
      },
      {
        namespace: 'settings',
        name: 'update',
        event: 'ui/intent',
        action: 'settings.update',
        arguments: [{ kind: 'reference', source: 'settings.audio.enabled' }],
      },
    ])

    expect(parseQuiActionDescriptor('ui.open("gallery", true, 3)')).toMatchObject({
      namespace: 'ui',
      name: 'open',
      event: 'ui/intent',
      action: 'open',
      arguments: [
        { kind: 'literal', value: 'gallery' },
        { kind: 'literal', value: true },
        { kind: 'literal', value: 3 },
      ],
    })
  })

  it('builds a structured QUI tree with per-node props, actions, classes, and slots', () => {
    const document = analyzeQuiSource(`
Panel.dialog(id: "settings") {
  slot header { Text { "Settings" } }
  slot footer {
    Button.primary(action: ui.close(), key: "close") { Text { "Close" } }
  }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.tree).toHaveLength(1)
    expect(document.tree[0]).toMatchObject({
      kind: 'component',
      name: 'Panel',
      classes: ['dialog'],
      props: [
        expect.objectContaining({ name: 'id', value: '"settings"' }),
      ],
      actions: [],
      children: [
        expect.objectContaining({
          kind: 'slot',
          name: 'header',
          children: [
            expect.objectContaining({
              kind: 'component',
              name: 'Text',
              children: [],
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'slot',
          name: 'footer',
          children: [
            expect.objectContaining({
              kind: 'component',
              name: 'Button',
              classes: ['primary'],
              props: [
                expect.objectContaining({ name: 'action', value: 'ui.close()' }),
                expect.objectContaining({ name: 'key', value: '"close"' }),
              ],
              actions: [
                expect.objectContaining({
                  event: 'ui/intent',
                  action: 'close',
                }),
              ],
            }),
          ],
        }),
      ],
    })
  })

  it('derives flat QUI component nodes from the structured tree', () => {
    const document = analyzeQuiSource('Panel.dialog { slot Header { Button.primary { Text { "Open" } } } }', {
      lint: {
        strictComponents: true,
      },
    })

    expect(document.nodes.map(node => node.name)).toEqual(['Panel', 'Button', 'Text'])
    expect(document.nodes.flatMap(node => node.classes)).toEqual(['dialog', 'primary'])
    expect(document.nodes.map(node => node.name)).not.toContain('Header')
    expect(document.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_UNKNOWN_COMPONENT',
      }),
    ]))
  })

  it('rejects unsupported QUI action descriptors before projection', () => {
    const document = analyzeQuiSource(`
Column {
  Button(action: ui.open(resolvePanel())) { Text { "Bad call" } }
  Button(action: choice.jump(choice.id)) { Text { "Bad choice" } }
  Button(action: ui.close(,)) { Text { "Bad comma" } }
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_UNSAFE_EXPRESSION',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'QUI_INVALID_ACTION_DESCRIPTOR',
        severity: 'error',
      }),
    ]))
  })

  it('accepts keyed QUI loop rendering with item and index bindings', () => {
    const document = analyzeQuiSource(`
Column {
  Button(
    for: (choice, index) in view.choices.items,
    key: choice.id,
    action: choice.select(choice.id)
  ) {
    Text { choice.label }
    Text { index }
  }
}
`)

    expect(document.diagnostics).toEqual([])
    expect(document.props.find(prop => prop.name === 'for')?.value).toBe('(choice, index) in view.choices.items')
    expect(document.props.find(prop => prop.name === 'key')?.groupId).toBe(document.props.find(prop => prop.name === 'for')?.groupId)
  })

  it('requires stable keys for QUI loop rendering', () => {
    const document = analyzeQuiSource(`
Column {
  Button(for: choice in view.choices.items, action: choice.select(choice.id)) {
    Text { choice.label }
  }
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_LOOP_KEY_MISSING',
        severity: 'error',
      }),
    ])
  })

  it('accepts adjacent QUI conditional branch chains', () => {
    const document = analyzeQuiSource(`
Stack {
  Text(if: view.mode == "audio") { "Audio" }
  Text(else-if: view.mode == "video") { "Video" }
  Text(else) { "Default" }
}
`)

    expect(document.diagnostics).toEqual([])
  })

  it('rejects orphaned QUI else branches', () => {
    const document = analyzeQuiSource(`
Stack {
  Text(else) { "Default" }
  Text(else-if: view.ready) { "Ready" }
}
`)

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_CONDITIONAL_BRANCH_ORPHANED',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'QUI_CONDITIONAL_BRANCH_ORPHANED',
        severity: 'error',
      }),
    ])
  })

  it('rejects duplicate QUI directives on the same node', () => {
    const document = analyzeQuiSource('Button(action: ui.close(), action: ui.confirm()) { Text { "Close" } }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_DUPLICATE_DIRECTIVE',
        severity: 'error',
      }),
    ])
  })

  it('rejects component children inside text-only QUI leaves', () => {
    const document = analyzeQuiSource('Text { Button(action: ui.close()) { Text { "Close" } } }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        severity: 'error',
      }),
    ])
  })

  it('rejects child content inside no-content QUI leaves', () => {
    const document = analyzeQuiSource('Image(src: assets.hero) { Text { "Hero" } }')

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        severity: 'error',
      }),
    ]))
  })

  it('rejects unsafe QUI asset references before projection', () => {
    const document = analyzeQuiSource([
      'Image(src: "../escape.png")',
      'Image(src: "https://cdn.example/hero.png")',
      'Image(src: assets.hero)',
      'Panel(image: "/absolute.png", asset-type: "../bad") {}',
    ].join('\n'))
    const projection = compileNativeUiSurfaceProjection(document)

    expect(document.diagnostics.filter(item => item.code === 'QUI_INVALID_ASSET_REFERENCE')).toHaveLength(5)
    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_INVALID_ASSET_REFERENCE',
        message: expect.stringContaining('package-relative literal asset path'),
      }),
      expect.objectContaining({
        code: 'QUI_INVALID_ASSET_REFERENCE',
        message: expect.stringContaining('asset-type'),
      }),
    ]))
    expect(projection.root.children?.flatMap(node => node.image ? [node.image] : [])).toEqual([])
  })

  it('projects safe literal QUI asset references', () => {
    const document = analyzeQuiSource('Image(src: "ui/poster.png", asset-type: "images")')
    const projection = compileNativeUiSurfaceProjection(document)

    expect(document.diagnostics).toEqual([])
    expect(projection.root?.image).toEqual({
      assetName: 'ui/poster.png',
      assetType: 'images',
    })
  })

  it('validates named QUI slots against the parent component registry', () => {
    const valid = analyzeQuiSource(`
Panel {
  slot header { Text { "Title" } }
  slot body { Text { props.body } }
}
`)
    const invalid = analyzeQuiSource('Button { slot header { Text { "Title" } } }')

    expect(valid.diagnostics).toEqual([])
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_UNKNOWN_SLOT',
        severity: 'error',
      }),
    ])
  })

  it('rejects orphaned and duplicate QUI slot blocks', () => {
    const document = analyzeQuiSource(`
slot header { Text { "Title" } }
Panel {
  slot body { Text { "Body" } }
  slot body { Text { "Duplicate" } }
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QUI_SLOT_ORPHANED',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'QUI_DUPLICATE_SLOT',
        severity: 'error',
      }),
    ]))
  })

  it('rejects unsafe QUI expressions before runtime package evaluation', () => {
    const document = analyzeQuiSource('Text(if: view.ready = true) { "Ready" }')

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_UNSAFE_EXPRESSION',
        severity: 'error',
      }),
    ])
  })

  it('validates QSS selector subset and native-wgpu property gates', () => {
    const document = analyzeQssSource(`
Panel::part(header), Button.primary:hover {
  background-color: #10141f;
  padding: 12px;
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
  border-width: -1px;
  border-radius: calc(4px);
  border-style: dashed;
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
  border-style: dashed;
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
  border-width: 0;
  border-radius: 0px;
  border-style: none;
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

    expect(invalid.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(33)
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([
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

  it('compiles static QUI and QSS into native UI surface projection JSON', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu", x: 10, y: 20, width: 520, height: 320) {
  Text.title(id: "title", x: 32, y: 28, width: 240, height: 44) { "Main Menu" }
  Image.poster(id: "poster", src: "ui/poster.png", x: 40, y: 96, width: 180, height: 112)
  Button.primary(id: "close", label: "Close", action: ui.close(), x: 340, y: 236, width: 120, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel {
  background-color: #101820;
}
Panel.dialog {
  border-color: #5ac8fa;
  border-radius: 14px;
  border-width: 2px;
  padding: 20px 24px;
}
#title {
  color: #f7f3e8;
  font-size: 34px;
  padding: 2px 4px;
  z-index: 8;
}
Button.primary {
  background-color: #f0c15a;
  color: #18130a;
  font-weight: bold;
  padding: 8px 14px 10px 16px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      contentPackageId: 'runtime.ui',
      qss,
      requiredRuntimePackages: ['base', 'runtime.fonts', 'base'],
    })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 10, y: 20, width: 520, height: 320 },
        provenance: {
          contentPackageId: 'runtime.ui',
          requiredRuntimePackages: ['base', 'runtime.fonts'],
        },
        style: {
          backgroundColor: '#101820',
          borderColor: '#5ac8fa',
          borderRadius: 14,
          borderWidth: 2,
          padding: { top: 20, right: 24, bottom: 20, left: 24 },
        },
        children: [
          {
            id: 'title',
            kind: 'Text',
            bounds: { x: 32, y: 28, width: 240, height: 44 },
            zIndex: 8,
            text: 'Main Menu',
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
            style: {
              color: '#f7f3e8',
              fontSize: 34,
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
            },
          },
          {
            id: 'poster',
            kind: 'Image',
            bounds: { x: 40, y: 96, width: 180, height: 112 },
            image: {
              assetType: 'images',
              assetName: 'ui/poster.png',
            },
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
          },
          {
            id: 'close',
            kind: 'Button',
            bounds: { x: 340, y: 236, width: 120, height: 48 },
            text: 'Close',
            intent: {
              event: 'ui/intent',
              action: 'close',
            },
            provenance: {
              contentPackageId: 'runtime.ui',
              requiredRuntimePackages: ['base', 'runtime.fonts'],
            },
            style: {
              backgroundColor: '#f0c15a',
              color: '#18130a',
              fontWeight: 'bold',
              padding: { top: 8, right: 14, bottom: 10, left: 16 },
            },
          },
        ],
      },
    })
  })

  it('derives native UI surface compatibility metadata from QUI and QSS documents', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Image.poster(src: "ui/poster.png", asset-type: "images")
  Button.primary(action: ui.close()) { Text { "Close" } }
}
`)
    const qss = analyzeQssSource(`
Panel.dialog {
  background-color: #101820;
  background-image: asset("ui/panel-bg.png", "images");
  border-radius: 12px;
}
Button.primary {
  color: #18130a;
  font-size: 22px;
}
`)
    const compatibility = createNativeUiSurfaceCompatibilityFromDocuments(qui, {
      qss,
      rendererVersionRange: '^0.1.0',
      optionalCapabilities: ['native-wgpu.video@1'],
    })

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compatibility).toMatchObject({
      packageName: '@quajs/native-renderer',
      versionRange: '^0.1.0',
      capabilities: ['native-wgpu.ui.surface@1'],
      optionalCapabilities: ['native-wgpu.video@1'],
      nativeCode: false,
    })
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens', 'images']))
    expect(compatibility.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
  })

  it('derives native UI surface compatibility metadata from resolved projections', () => {
    const projection = compileNativeUiSurfaceProjection(
      analyzeQuiSource(`
Panel.dialog(id: "menu", image: "ui/panel.png") {
  Text.title { "Main Menu" }
  Button.primary(action: ui.close()) { Text { "Close" } }
}
`),
      {
        contentPackageId: 'runtime.ui',
        qss: analyzeQssSource(`
Panel.dialog {
  background-color: #101820;
  background-image: asset("ui/panel-bg.png", "images");
  border-radius: 12px;
}
Button.primary {
  color: #18130a;
  font-size: 22px;
}
`),
        requiredRuntimePackages: ['base'],
      },
    )
    const compatibility = createNativeUiSurfaceCompatibilityFromProjection(projection, {
      rendererVersionRange: '^0.1.0',
      optionalCapabilities: ['native-wgpu.video@1'],
    })

    expect(compatibility).toMatchObject({
      packageName: '@quajs/native-renderer',
      versionRange: '^0.1.0',
      capabilities: ['native-wgpu.ui.surface@1'],
      optionalCapabilities: ['native-wgpu.video@1'],
      nativeCode: false,
    })
    expect(compatibility.assetKinds).toEqual(expect.arrayContaining(['qui', 'qss', 'tokens', 'images']))
    expect(compatibility.quiComponents).toEqual(['Button', 'Panel', 'Text'])
    expect(compatibility.qssFeatures).toEqual([
      'background-color',
      'background-image',
      'border-radius',
      'color',
      'font-size',
    ])
    expect([
      ...(compatibility.capabilities || []),
      ...(compatibility.optionalCapabilities || []),
    ]).not.toContain('native-wgpu.audio@1')
  })

  it('uses QSS geometry as bounds fallback while QUI props stay authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Button.primary(id: "qss-button", label: "From QSS")
  Button.secondary(id: "right-button", label: "Right")
  Button.primary(id: "override-button", label: "Override", x: 140, y: 96, width: 120, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel.dialog {
  left: 12px;
  top: 18px;
  width: 300px;
  height: 160px;
}
Button.primary {
  left: 40px;
  top: 52px;
  width: 100px;
  height: 44px;
  min-width: 128px;
  max-height: 40px;
}
Button.secondary {
  right: 18px;
  bottom: 20px;
  width: 96px;
  height: 36px;
}
#override-button {
  left: 1px;
  right: 96px;
  top: 2px;
  bottom: 96px;
  width: 3px;
  height: 4px;
  min-width: 260px;
  max-height: 12px;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 12, y: 18, width: 300, height: 160 },
        children: [
          {
            id: 'qss-button',
            kind: 'Button',
            bounds: { x: 40, y: 52, width: 128, height: 40 },
            text: 'From QSS',
          },
          {
            id: 'right-button',
            kind: 'Button',
            bounds: { x: 198, y: 122, width: 96, height: 36 },
            text: 'Right',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 140, y: 96, width: 120, height: 48 },
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS display none as node visibility fallback while QUI show stays authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Text.notice(id: "hidden-text") { "Hidden by display" }
  Button.primary(id: "override-button", label: "Override", show: true)
}
`)
    const qss = analyzeQssSource(`
Text.notice {
  display: none;
  visibility: visible;
}
Button.primary {
  display: none;
}
Panel.dialog {
  visibility: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          {
            id: 'hidden-text',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: false,
            text: 'Hidden by display',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: true,
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS visibility as node visibility fallback while QUI show stays authoritative', () => {
    const qui = analyzeQuiSource(`
Panel.dialog(id: "menu") {
  Text.notice(id: "hidden-text") { "Hidden by QSS" }
  Button.primary(id: "override-button", label: "Override", show: true)
}
`)
    const qss = analyzeQssSource(`
Text.notice {
  visibility: hidden;
}
Button.primary {
  visibility: hidden;
}
Panel.dialog {
  visibility: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: true,
        children: [
          {
            id: 'hidden-text',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: false,
            text: 'Hidden by QSS',
          },
          {
            id: 'override-button',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            visible: true,
            text: 'Override',
          },
        ],
      },
    })
  })

  it('uses QSS overflow as child clip metadata in compiled projection', () => {
    const qui = analyzeQuiSource(`
Panel.clip(id: "menu") {
  Button.primary(id: "inside", label: "Inside")
}
Panel.open(id: "drawer") {
  Button.primary(id: "outside", label: "Outside")
}
`)
    const qss = analyzeQssSource(`
Panel.clip {
  overflow: hidden;
}
Panel.open {
  overflow: visible;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss, rootId: 'root' })).toEqual({
      root: {
        id: 'root',
        kind: 'Fragment',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'menu',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            clipChildren: true,
            children: [
              {
                id: 'inside',
                kind: 'Button',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: 'Inside',
              },
            ],
          },
          {
            id: 'drawer',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            clipChildren: false,
            children: [
              {
                id: 'outside',
                kind: 'Button',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: 'Outside',
              },
            ],
          },
        ],
      },
    })
  })

  it('matches the shared Rust renderer JSON fixture for compiled QUI and QSS surfaces', () => {
    const qui = analyzeQuiSource(`
Panel.compiled(id: "menu", x: 32, y: 24, width: 520, height: 392) {
  Text.title(id: "title", x: 64, y: 58, width: 360, height: 56) { "Compiled Menu" }
  Image.poster(id: "poster", src: "ui/poster.png", x: 64, y: 132, width: 180, height: 112)
  Button.primary(id: "open-settings", label: "Settings", action: ui.open("settings"), x: 340, y: 330, width: 136, height: 48)
}
`)
    const qss = analyzeQssSource(`
Panel.compiled {
  background-color: #101820;
  background-image: asset("ui/panel.png");
  background-position: right top;
  background-size: contain;
  border-color: #5ac8fa;
  border-radius: 12px;
  border-width: 2px;
  padding: 18px 22px;
}
#title {
  color: #f7f3e8;
  font-family: "Qua Sans", "Fallback Serif";
  font-size: 34px;
  font-weight: bold;
  line-height: 44px;
  padding: 2px 4px 6px;
  text-align: center;
  z-index: 8;
}
Image.poster {
  object-fit: cover;
}
Button.primary {
  background-color: #f0c15a;
  color: #18130a;
  font-weight: 700;
  padding: 8px 14px 10px 16px;
}
`)
    const fixture = JSON.parse(readFileSync(SHARED_SURFACE_FRAME_FIXTURE, 'utf8')) as {
      view: {
        ui: {
          overlays: Array<{
            surface: {
              root: unknown
            }
          }>
        }
      }
    }

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      contentPackageId: 'runtime.ui',
      qss,
      requiredRuntimePackages: ['base', 'runtime.fonts'],
    }).root)
      .toEqual(fixture.view.ui.overlays[0].surface.root)
  })

  it('keeps the native-wgpu registry compatible with the shared resolved surface fixture', () => {
    const fixture = JSON.parse(readFileSync(SHARED_SURFACE_FRAME_FIXTURE, 'utf8')) as {
      view: {
        ui: {
          overlays: Array<{
            surface: NativeUiSurfaceProjection
          }>
        }
      }
    }
    const requirements = collectNativeUiSurfaceProjectionRequirements(fixture.view.ui.overlays[0].surface)
    const supportedComponents = new Set(nativeWgpuQuiComponentNames())
    const supportedQssFeatures = new Set(nativeWgpuQssFeatureNames())

    expect(requirements.assetKinds).toEqual(expect.arrayContaining(['fonts', 'images']))
    expect(requirements.intentEvents).toEqual(['ui/intent'])
    expect(requirements.projectionFields).toEqual(expect.arrayContaining([
      'bounds',
      'children',
      'image',
      'intent',
      'kind',
      'provenance',
      'text',
    ]))
    expect(requirements.quiComponents).toEqual(['Button', 'Image', 'Panel', 'Text'])
    expect(requirements.qssFeatures).toEqual(expect.arrayContaining([
      'background-color',
      'background-image',
      'background-position',
      'background-size',
      'border-color',
      'border-radius',
      'border-width',
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'object-fit',
      'padding',
      'text-align',
      'z-index',
    ]))
    expect(requirements.quiComponents.filter(component => !supportedComponents.has(component))).toEqual([])
    expect(requirements.qssFeatures.filter(feature => !supportedQssFeatures.has(feature))).toEqual([])
  })

  it('separates resolved projection fields from QSS features when collecting surface requirements', () => {
    const requirements = collectNativeUiSurfaceProjectionRequirements({
      root: {
        id: 'scroll',
        kind: 'Scroll',
        bounds: { x: 0, y: 0, width: 320, height: 240 },
        clipChildren: true,
        opacity: 0.5,
        scrollOffsetX: 12,
        scrollOffsetY: 24,
        visible: false,
        zIndex: 4,
        children: [
          {
            id: 'content',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 320, height: 240 },
          },
        ],
      },
    })

    expect(requirements.projectionFields).toEqual(expect.arrayContaining([
      'bounds',
      'children',
      'clipChildren',
      'kind',
      'opacity',
      'scrollOffsetX',
      'scrollOffsetY',
      'visible',
    ]))
    expect(requirements.qssFeatures).toEqual(['overflow', 'z-index'])
    expect(requirements.qssFeatures).not.toContain('opacity')
    expect(requirements.qssFeatures).not.toContain('visibility')
  })

  it('applies native QSS selector specificity and ancestor matching during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button.primary(id: "direct", label: "Direct")
  Column {
    Button.primary(id: "nested", label: "Nested")
  }
}
`)
    const qss = analyzeQssSource(`
Button { color: #aaaaaa; }
.primary { color: #bbbbbb; }
Panel Button.primary { color: #cccccc; }
Panel > Button.primary { color: #dddddd; }
#nested { color: #eeeeee; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const direct = projection.root?.children?.[0]
    const nested = projection.root?.children?.[1]?.children?.[0]

    expect(direct?.style).toEqual({ color: '#dddddd' })
    expect(nested?.style).toEqual({ color: '#eeeeee' })
  })

  it('ignores malformed native QSS selector chains during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button(id: "target", label: "Target")
}
`)
    const qss = analyzeQssSource(`
Panel > { color: #ff0000; }
> Button { color: #00ff00; }
Panel > > Button { color: #0000ff; }
Panel > Button { color: #101010; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const target = projection.root?.children?.[0]

    expect(target?.style).toEqual({ color: '#101010' })
  })

  it('rejects browser-only QSS selectors and values', () => {
    const document = analyzeQssSource(`
Button:nth-child(2) {
  background-image: url("https://example.test/panel.png");
}
`)

    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_SELECTOR' }),
      expect.objectContaining({ code: 'QSS_UNSUPPORTED_VALUE' }),
    ]))
  })

  it('detects document kind by language id or file path', () => {
    expect(analyzeNativeUiDocument('Button {}', { languageId: 'qua-ui' }).kind).toBe('qui')
    expect(analyzeNativeUiDocument('Button { color: #fff; }', { filePath: 'menu.qss' }).kind).toBe('qss')
  })

  it('formats native UI documents idempotently enough for LSP formatting', () => {
    const formattedQui = formatNativeUiDocument('Stack{\nText { "Hi" }\n}', {
      filePath: 'menu.qui',
      format: { insertFinalNewline: true },
    })
    const formattedQss = formatNativeUiDocument('Button{color:#fff;}', {
      filePath: 'menu.qss',
      format: { insertFinalNewline: true },
    })

    expect(formattedQui).toContain('Stack{')
    expect(formattedQui.endsWith('\n')).toBe(true)
    expect(formattedQss).toBe('Button {\n  color: #fff;\n}\n')
  })

  it('returns completions and hover metadata from the shared registry', () => {
    const completions = getNativeUiCompletions('', 0, { filePath: 'menu.qui' })
    const hover = getNativeUiHover('Button {}', 1, { filePath: 'menu.qui' })

    expect(completions.some(item => item.label === 'Button')).toBe(true)
    expect(hover?.contents).toContain('Button')
    expect(hover?.contents).toContain('Content: children')
    expect(hover?.contents).toContain('Slots: default')
  })

  it('returns QSS value completions and hovers from property metadata', () => {
    const backgroundSize = 'Panel { background-size:  }'
    const backgroundImage = 'Panel { background-image:  }'
    const backgroundPosition = 'Panel { background-position:  }'
    const objectFit = 'Image { object-fit:  }'
    const textAlign = 'Text { text-align:  }'
    const textOverflow = 'Text { text-overflow:  }'
    const textTransform = 'Text { text-transform:  }'
    const hoverSource = 'Panel { background-size: contain; }'

    expect(getNativeUiCompletions(backgroundSize, backgroundSize.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['cover', 'contain', 'fill', 'none', 'scale-down']))
    expect(getNativeUiCompletions(backgroundImage, backgroundImage.indexOf(' }'), { filePath: 'menu.qss' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          label: 'asset("...")',
          insertText: 'asset("$1")',
          kind: 'value',
        }),
      ]))
    expect(getNativeUiCompletions(backgroundPosition, backgroundPosition.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['left top', 'center', 'right bottom', '50% 50%']))
    expect(getNativeUiCompletions(objectFit, objectFit.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['cover', 'contain', 'scale-down']))
    expect(getNativeUiCompletions(textAlign, textAlign.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['left', 'center', 'right', 'justify']))
    expect(getNativeUiCompletions(textOverflow, textOverflow.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['clip', 'ellipsis']))
    expect(getNativeUiCompletions(textTransform, textTransform.indexOf(' }'), { filePath: 'menu.qss' }).map(item => item.label))
      .toEqual(expect.arrayContaining(['none', 'uppercase', 'lowercase', 'capitalize']))

    const hover = getNativeUiHover(hoverSource, hoverSource.indexOf('contain') + 2, { filePath: 'menu.qss' })
    expect(hover?.contents).toContain('contain')
    expect(hover?.contents).toContain('background-size')
    expect(hover?.contents).toContain('Native wgpu: supported')
  })
})
