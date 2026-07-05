import { describe, expect, it } from 'vitest'
import {
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection directives and composites', () => {
  it('evaluates QUI conditional branch chains during projection compile', () => {
    const qui = analyzeQuiSource(`
Stack(id: "mode-stack") {
  Text(id: "audio", if: view.mode == "audio") { "Audio" }
  Text(id: "video", else-if: view.mode == "video") { "Video" }
  Text(id: "fallback", else) { "Default" }
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      context: {
        view: {
          mode: 'video',
        },
      },
    })).toEqual(withDefaultVisible({
      root: {
        id: 'mode-stack',
        kind: 'Stack',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'video',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            text: 'Video',
          },
        ],
      },
    }))
  })

  it('expands keyed QUI loops with template context before native projection', () => {
    const qui = analyzeQuiSource(`
Column(id: "choices") {
  Button(
    for: (choice, index) in view.choices.items,
    key: choice.id,
    label: choice.label,
    action: choice.select(choice.id),
    width: 320,
    height: 48
  ) {
    Text(id: "choice-index") { index }
  }
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      context: {
        view: {
          choices: {
            items: [
              { id: 'start', label: 'Start' },
              { id: 'settings', label: 'Settings' },
            ],
          },
        },
      },
    })).toEqual(withDefaultVisible({
      root: {
        id: 'choices',
        kind: 'Column',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'Button:start',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 320, height: 48 },
            text: 'Start',
            intent: {
              event: 'choice/select',
              choiceId: 'start',
              action: 'select',
              metadata: {
                arg0: 'start',
              },
            },
            children: [
              {
                id: 'choice-index:start',
                kind: 'Text',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: '0',
              },
            ],
          },
          {
            id: 'Button:settings',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 320, height: 48 },
            text: 'Settings',
            intent: {
              event: 'choice/select',
              choiceId: 'settings',
              action: 'select',
              metadata: {
                arg0: 'settings',
              },
            },
            children: [
              {
                id: 'choice-index:settings',
                kind: 'Text',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: '1',
              },
            ],
          },
        ],
      },
    }))
  })

  it('evaluates the native QUI expression subset during projection compile', () => {
    const qui = analyzeQuiSource(`
Column(id: "expr-root") {
  Panel(
    id: "wide-panel",
    if: view.width >= 1280 && !settings.compact,
    width: view.width >= 1280 ? 640 : 320,
    height: view.count < 4 ? 120 : 60
  ) {
    Text(id: "headline") { view.title ?? "Untitled" }
  }

  Button(
    for: item in [{ id: "save", label: "Save" }, { id: "load", label: view.altLabel ?? "Load" }],
    key: item.id,
    show: item.id != "load" || settings.showLoad,
    label: item.label,
    action: ui.open(item.id == "save" ? "save-menu" : "load-menu"),
    width: view.width > 1000 ? 260 : 160
  )
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      context: {
        settings: {
          compact: false,
          showLoad: true,
        },
        view: {
          altLabel: 'Load Game',
          count: 3,
          title: undefined,
          width: 1440,
        },
      },
    })).toEqual(withDefaultVisible({
      root: {
        id: 'expr-root',
        kind: 'Column',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'wide-panel',
            kind: 'Panel',
            bounds: { x: 0, y: 0, width: 640, height: 120 },
            children: [
              {
                id: 'headline',
                kind: 'Text',
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                text: 'Untitled',
              },
            ],
          },
          {
            id: 'Button:save',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 260, height: 0 },
            text: 'Save',
            intent: {
              event: 'ui/intent',
              action: 'open',
              metadata: {
                arg0: 'save-menu',
              },
            },
          },
          {
            id: 'Button:load',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 260, height: 0 },
            text: 'Load Game',
            intent: {
              event: 'ui/intent',
              action: 'open',
              metadata: {
                arg0: 'load-menu',
              },
            },
          },
        ],
      },
    }))
  })

  it('flattens imported composite QUI components into foundational surface nodes', () => {
    const dialog = analyzeQuiSource(`
Stack(id: props.id ?? "dialog") {
  Backdrop(id: "dialog-backdrop", action: ui.close(), width: 1920, height: 1080)
  Panel(
    id: "dialog-panel",
    width: props.panelWidth ?? 640,
    height: props.panelHeight ?? 420
  ) {
    slot header {
      Text(id: "dialog-title") { props.title ?? "Dialog" }
    }
    slot body {}
    slot footer {}
  }
}
`)
    const drawer = analyzeQuiSource(`
Panel(id: "drawer-panel", width: props.width ?? 420, height: 1080) {
  Text(id: "drawer-title") { props.title }
  slot body {}
}
`)
    const qui = analyzeQuiSource(`
import component "./Dialog.qui";
import component "./Drawer.qui";

Stack(id: "ui-root") {
  Dialog(
    if: view.overlays.settings,
    key: "settings-dialog",
    id: "settings-dialog",
    title: "Settings",
    panelWidth: 640,
    panelHeight: 420
  ) {
    slot body {
      Button(id: "settings-close", label: "Close", action: ui.close())
    }
  }

  Drawer(for: drawer in view.drawers, key: drawer.id, title: drawer.title) {
    slot body {
      Text(id: "drawer-extra") { "Extra" }
    }
  }
}
`, {
      lint: {
        strictComponents: true,
      },
    })
    const projection = compileNativeUiSurfaceProjection(qui, {
      components: {
        Dialog: dialog,
        Drawer: drawer,
      },
      context: {
        view: {
          overlays: {
            settings: true,
          },
          drawers: [
            { id: 'inventory', title: 'Inventory' },
          ],
        },
      },
    })

    expect(dialog.diagnostics).toEqual([])
    expect(drawer.diagnostics).toEqual([])
    expect(qui.diagnostics).toEqual([])
    expect(qui.nodes.map(node => node.name)).toEqual([
      'Stack',
      'Dialog',
      'Button',
      'Drawer',
      'Text',
    ])
    expect(projection.root).toEqual(withDefaultVisible({
      id: 'ui-root',
      kind: 'Stack',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      children: [
        {
          id: 'settings-dialog:settings-dialog',
          kind: 'Stack',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          children: [
            {
              id: 'dialog-backdrop:settings-dialog',
              kind: 'Backdrop',
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
              intent: {
                event: 'ui/intent',
                action: 'close',
              },
            },
            {
              id: 'dialog-panel:settings-dialog',
              kind: 'Panel',
              bounds: { x: 0, y: 0, width: 640, height: 420 },
              children: [
                {
                  id: 'dialog-title:settings-dialog',
                  kind: 'Text',
                  bounds: { x: 0, y: 0, width: 0, height: 0 },
                  text: 'Settings',
                },
                {
                  id: 'settings-close:settings-dialog',
                  kind: 'Button',
                  bounds: { x: 0, y: 0, width: 0, height: 0 },
                  text: 'Close',
                  intent: {
                    event: 'ui/intent',
                    action: 'close',
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'drawer-panel:inventory',
          kind: 'Panel',
          bounds: { x: 0, y: 0, width: 420, height: 1080 },
          children: [
            {
              id: 'drawer-title:inventory',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'Inventory',
            },
            {
              id: 'drawer-extra:inventory',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'Extra',
            },
          ],
        },
      ],
    }))
    expect(JSON.stringify(projection)).not.toContain('Dialog')
    expect(JSON.stringify(projection)).not.toContain('Drawer')
  })
})
