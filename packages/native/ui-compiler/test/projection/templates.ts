import { describe, expect, it } from 'vitest'
import {
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'
import { withDefaultVisible } from './helpers'

describe('@quajs/native-ui-compiler projection templates', () => {
  it('projects keyed QUI loops with stable ids and canonical choice intents', () => {
    const qui = analyzeQuiSource(`
Column(id: "choices", width: 300, height: 200) {
  Button(
    id: "choice-button",
    for: (choice, index) in view.choices.items,
    key: choice.id,
    label: choice.label,
    action: choice.select(choice.id),
    y: index,
    width: 220,
    height: 32
  )
}
`)

    expect(qui.diagnostics).toEqual([])
    expect(compileNativeUiSurfaceProjection(qui, {
      context: {
        view: {
          choices: {
            items: [
              { id: 'stay', label: 'Stay' },
              { id: 'leave', label: 'Leave' },
            ],
          },
        },
      },
    })).toEqual(withDefaultVisible({
      root: {
        id: 'choices',
        kind: 'Column',
        bounds: { x: 0, y: 0, width: 300, height: 200 },
        children: [
          {
            id: 'choice-button:stay',
            kind: 'Button',
            bounds: { x: 0, y: 0, width: 220, height: 32 },
            text: 'Stay',
            intent: {
              event: 'choice/select',
              choiceId: 'stay',
              action: 'select',
              metadata: {
                arg0: 'stay',
              },
            },
          },
          {
            id: 'choice-button:leave',
            kind: 'Button',
            bounds: { x: 0, y: 1, width: 220, height: 32 },
            text: 'Leave',
            intent: {
              event: 'choice/select',
              choiceId: 'leave',
              action: 'select',
              metadata: {
                arg0: 'leave',
              },
            },
          },
        ],
      },
    }))
  })

  it('projects adjacent QUI conditional branches from authoring context', () => {
    const qui = analyzeQuiSource(`
Stack(id: "mode-label") {
  Text(if: view.mode == "audio") { "Audio" }
  Text(else-if: view.mode == "video") { "Video" }
  Text(else) { "Default" }
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
        id: 'mode-label',
        kind: 'Stack',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        children: [
          {
            id: 'Text:3:2',
            kind: 'Text',
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            text: 'Video',
          },
        ],
      },
    }))
  })
})
