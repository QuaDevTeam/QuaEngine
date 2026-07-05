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

  it('flattens imported composite QUI components into foundational surface nodes', () => {
    const qui = analyzeQuiSource(`
import component "./Dialog.qui";
import component "./Drawer.qui";

Stack(id: "ui-root") {
  Dialog(if: view.overlays.settings, key: "settings-dialog") {
    Backdrop(id: "settings-backdrop", action: ui.close(), width: 1920, height: 1080)
    Panel(id: "settings-panel", width: 640, height: 420) {
      Text(id: "settings-title") { "Settings" }
      Button(id: "settings-close", label: "Close", action: ui.close())
    }
  }

  Drawer(for: drawer in view.drawers, key: drawer.id) {
    Panel(id: "drawer-panel", width: 420, height: 1080) {
      Text(id: "drawer-title") { drawer.title }
    }
  }
}
`, {
      lint: {
        strictComponents: true,
      },
    })
    const projection = compileNativeUiSurfaceProjection(qui)

    expect(qui.diagnostics).toEqual([])
    expect(qui.nodes.map(node => node.name)).toEqual([
      'Stack',
      'Dialog',
      'Backdrop',
      'Panel',
      'Text',
      'Button',
      'Drawer',
      'Panel',
      'Text',
    ])
    expect(projection.root).toEqual(withDefaultVisible({
      id: 'ui-root',
      kind: 'Stack',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      children: [
        {
          id: 'settings-backdrop',
          kind: 'Backdrop',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          intent: {
            event: 'ui/intent',
            action: 'close',
          },
        },
        {
          id: 'settings-panel',
          kind: 'Panel',
          bounds: { x: 0, y: 0, width: 640, height: 420 },
          children: [
            {
              id: 'settings-title',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'Settings',
            },
            {
              id: 'settings-close',
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
        {
          id: 'drawer-panel',
          kind: 'Panel',
          bounds: { x: 0, y: 0, width: 420, height: 1080 },
          children: [
            {
              id: 'drawer-title',
              kind: 'Text',
              bounds: { x: 0, y: 0, width: 0, height: 0 },
              text: 'drawer.title',
            },
          ],
        },
      ],
    }))
    expect(JSON.stringify(projection)).not.toContain('Dialog')
    expect(JSON.stringify(projection)).not.toContain('Drawer')
  })
})
