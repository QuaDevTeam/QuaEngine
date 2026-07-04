import { describe, expect, it } from 'vitest'
import { offsetAtPosition } from '../src/source-ranges'

describe('@quajs/native-language-server source ranges', () => {
  it('clamps positions past a line to the line content end', () => {
    const source = 'Panel {}\nButton {}'

    expect(offsetAtPosition(source, { line: 0, character: 999 }))
      .toBe(source.indexOf('\n'))
    expect(offsetAtPosition(source, { line: 99, character: 999 }))
      .toBe(source.length)
  })
})
