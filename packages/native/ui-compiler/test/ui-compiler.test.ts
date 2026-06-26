import { describe, expect, it } from 'vitest'
import {
  analyzeNativeUiDocument,
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
  formatNativeUiDocument,
  getNativeUiCompletions,
  getNativeUiHover,
  nativeWgpuQssFeatureNames,
  nativeWgpuQuiComponentNames,
  parseQuiActionDescriptor,
  resolveNativeQssDeclarations,
} from '../src'

describe('@quajs/native-ui-compiler', () => {
  it('exposes native-wgpu QUI and QSS capability feature lists', () => {
    expect(nativeWgpuQuiComponentNames()).toContain('Button')
    expect(nativeWgpuQuiComponentNames()).toContain('RichText')
    expect(nativeWgpuQuiComponentNames()).toContain('Scroll')
    expect(nativeWgpuQssFeatureNames()).toContain('background-color')
    expect(nativeWgpuQssFeatureNames()).toContain('background-image')
    expect(nativeWgpuQssFeatureNames()).toContain('background-position')
    expect(nativeWgpuQssFeatureNames()).toContain('background-size')
    expect(nativeWgpuQssFeatureNames()).toContain('object-fit')
    expect(nativeWgpuQssFeatureNames()).toContain('opacity')
    expect(nativeWgpuQssFeatureNames()).toContain('z-index')
    expect(nativeWgpuQssFeatureNames()).not.toContain('padding')
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

    expect(document.diagnostics).toEqual([
      expect.objectContaining({
        code: 'QUI_INVALID_CHILDREN',
        severity: 'error',
      }),
    ])
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
  width: 10vw;
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
  border-width: 1px;
  color: #f6f8ff;
  font-family: "Inter", system-ui;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.25;
  object-fit: cover;
  opacity: 1.4;
  text-align: center;
  z-index: 12;
}
`)

    expect(document.diagnostics).toEqual([])
    expect(resolveNativeQssDeclarations(document.rules[0].declarations)).toEqual({
      zIndex: 12,
      style: {
        backgroundColor: '#10141f',
        backgroundImage: { assetType: 'images', assetName: 'ui/panel.png' },
        backgroundPosition: { x: 1, y: 1 },
        backgroundSize: 'contain',
        borderColor: '#31415f',
        borderRadius: 8,
        borderWidth: 1,
        color: '#f6f8ff',
        fontFamily: ['Inter', 'system-ui'],
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 1.25,
        objectFit: 'cover',
        opacity: 1,
        textAlign: 'center',
      },
    })
  })

  it('omits invalid QSS declaration values from resolved surface style IR', () => {
    const document = analyzeQssSource(`
Button {
  border-width: -1px;
  border-radius: calc(4px);
  font-weight: heavy;
  object-fit: stretch;
  opacity: none;
  text-align: start;
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
  font-weight: heavy;
  object-fit: stretch;
  opacity: none;
  text-align: start;
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
  font-weight: 0;
  object-fit: scale-down;
  opacity: 0;
  text-align: justify;
  z-index: 0;
  background-image: asset("ui/panel.png");
  background-position: 0% 100%;
  background-size: none;
}
`)

    expect(invalid.diagnostics.filter(item => item.code === 'QSS_INVALID_VALUE')).toHaveLength(10)
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
}
#title {
  color: #f7f3e8;
  font-size: 34px;
  z-index: 8;
}
Button.primary {
  background-color: #f0c15a;
  color: #18130a;
  font-weight: bold;
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(qss.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, { qss })).toEqual({
      root: {
        id: 'menu',
        kind: 'Panel',
        bounds: { x: 10, y: 20, width: 520, height: 320 },
        style: {
          backgroundColor: '#101820',
          borderColor: '#5ac8fa',
          borderRadius: 14,
          borderWidth: 2,
        },
        children: [
          {
            id: 'title',
            kind: 'Text',
            bounds: { x: 32, y: 28, width: 240, height: 44 },
            zIndex: 8,
            text: 'Main Menu',
            style: {
              color: '#f7f3e8',
              fontSize: 34,
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
            style: {
              backgroundColor: '#f0c15a',
              color: '#18130a',
              fontWeight: 'bold',
            },
          },
        ],
      },
    })
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

    const hover = getNativeUiHover(hoverSource, hoverSource.indexOf('contain') + 2, { filePath: 'menu.qss' })
    expect(hover?.contents).toContain('contain')
    expect(hover?.contents).toContain('background-size')
    expect(hover?.contents).toContain('Native wgpu: supported')
  })
})
