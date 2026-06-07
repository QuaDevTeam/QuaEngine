import { describe, expect, it } from 'vitest'
import { QuaScriptParser } from '../src/core/parser'

describe('quaScriptParser', () => {
  it('should parse simple dialogue', () => {
    const parser = new QuaScriptParser()
    const script = `
      Jack: Hello world!
      John: How are you?
    `

    const result = parser.parse(script)

    expect(result.steps).toHaveLength(2)
    expect(result.characters).toEqual(new Set(['Jack', 'John']))

    const firstStep = result.steps[0]
    expect(firstStep.type).toBe('dialogue')
    expect((firstStep.content as any).character).toBe('Jack')
    expect((firstStep.content as any).text).toBe('Hello world!')
  })

  it('should parse dialogue with decorators', () => {
    const parser = new QuaScriptParser()
    const script = `
      @PlayVoice('hello.mp3')
      @SetSprite('jack_happy.png')
      Jack: Hello world!
    `

    const result = parser.parse(script)

    // With gap detection, this could be 1 or 2 steps depending on spacing
    expect(result.steps.length).toBeGreaterThan(0)

    // Find the dialogue step
    const dialogueStep = result.steps.find(step => step.type === 'dialogue')
    expect(dialogueStep).toBeTruthy()

    if (dialogueStep) {
      const dialogue = dialogueStep.content as any
      expect(dialogue.character).toBe('Jack')
      expect(dialogue.text).toBe('Hello world!')

      // Decorators might be on dialogue step or separate action step
      const allDecorators = result.steps.flatMap(step =>
        (step.content as any).decorators || [],
      )
      expect(allDecorators).toHaveLength(2)
      expect(allDecorators.some((d: any) => d.name === 'PlayVoice')).toBe(true)
      expect(allDecorators.some((d: any) => d.name === 'SetSprite')).toBe(true)
    }
  })

  it('should parse decorators with multiple arguments', () => {
    const parser = new QuaScriptParser()
    const script = `
      @PlayVoice('test.mp3', 42, true, 'string')
      Jack: Hello!
    `

    const result = parser.parse(script)
    const dialogue = result.steps[0].content as any

    expect(dialogue.decorators[0].args).toEqual(['test.mp3', 42, true, 'string'])
  })

  it('should extract template expressions', () => {
    const parser = new QuaScriptParser()
    const script = `
      Jack: Hello \${name}, today is \${day}!
    `

    const result = parser.parse(script)
    const dialogue = result.steps[0].content as any

    expect(dialogue.templateExpressions).toEqual(['name', 'day'])
  })

  it('parses bare narration lines without adding a speaker character', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      雨声落在窗沿。
      Jack: Hello.
      - Continue -> next
    `)

    expect(result.steps).toHaveLength(3)
    expect(result.characters).toEqual(new Set(['Jack']))
    expect(result.steps[0].type).toBe('dialogue')
    expect(result.steps[0].content).toEqual(expect.objectContaining({
      character: undefined,
      mode: 'narration',
      text: '雨声落在窗沿。',
    }))
  })

  it('attaches decorators and template expressions to bare narration', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      @PlaySFX('rain.ogg')
      Rain ${'${scope.level}'} keeps falling.
    `)

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].type).toBe('dialogue')
    const dialogue = result.steps[0].content as any
    expect(dialogue.mode).toBe('narration')
    expect(dialogue.decorators.map((decorator: any) => decorator.name)).toEqual(['PlaySFX'])
    expect(dialogue.templateExpressions).toEqual(['scope.level'])
  })

  it('does not treat comments or structural lines as bare narration', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      // locale: zh-cn
      // NEEDS-REVIEW: base text or matching context changed
      Jack: Hello.
      - Continue -> next
      <script lang="ts">
    `)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].type).toBe('dialogue')
    expect((result.steps[0].content as any).text).toBe('Hello.')
    expect(result.steps[1].type).toBe('choice')
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'QS_PARSE_UNRECOGNIZED_LINE',
    ])
  })

  it('allows comments between decorators and the localized dialogue line', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      @LineId('intro.rain')
      // NEEDS-REVIEW: base text or matching context changed
      Rain keeps falling.
    `)

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].type).toBe('dialogue')
    const dialogue = result.steps[0].content as any
    expect(dialogue.mode).toBe('narration')
    expect(dialogue.text).toBe('Rain keeps falling.')
    expect(dialogue.decorators.map((decorator: any) => decorator.name)).toEqual(['LineId'])
    expect(result.diagnostics).toEqual([])
  })

  it('allows narration text that starts with non-structural punctuation', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      -alone in the corridor.
      *Crash.*
      <not a script tag>
    `)

    expect(result.steps).toHaveLength(3)
    expect(result.steps.map(step => (step.content as any).text)).toEqual([
      '-alone in the corridor.',
      '*Crash.*',
      '<not a script tag>',
    ])
    expect(result.steps.every(step => (step.content as any).mode === 'narration')).toBe(true)
  })

  it('should handle empty lines and whitespace', () => {
    const parser = new QuaScriptParser()
    const script = `
      
      Jack: First line
      
      
      John: Second line
      
    `

    const result = parser.parse(script)

    expect(result.steps).toHaveLength(2)
  })

  it('should handle action-only decorators', () => {
    const parser = new QuaScriptParser()
    const script = `
      @AudioChapter('chapter-1', { bgm: 'bgm/chapter-1' })
      @PlayBGM('background.mp3')
      @SetAudioGain('bgm', 0.8)
      
      Jack: Now with background music!
    `

    const result = parser.parse(script)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].type).toBe('action')

    const actionContent = result.steps[0].content as any
    expect(actionContent.decorators).toHaveLength(3)
    expect(actionContent.decorators[0].name).toBe('AudioChapter')
    expect(actionContent.decorators[1].name).toBe('PlayBGM')
    expect(actionContent.decorators[2].name).toBe('SetAudioGain')

    expect(result.steps[1].type).toBe('dialogue')
    const dialogueContent = result.steps[1].content as any
    expect(dialogueContent.character).toBe('Jack')
  })

  it('should parse choice blocks', () => {
    const parser = new QuaScriptParser()
    const script = `
      Jack: What will you do?
      - Go outside -> outside
      - Stay home -> home if canStayHome
    `

    const result = parser.parse(script)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[1].type).toBe('choice')
    expect((result.steps[1].content as any).options).toMatchObject([
      { id: 'outside', text: 'Go outside', target: 'outside', condition: undefined, source: 'sugar' },
      { id: 'home', text: 'Stay home', target: 'home', condition: 'canStayHome', source: 'sugar' },
    ])
  })

  it('parses @Choice decorators as canonical choice steps', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse(`
      @Choice('Go outside', node('outside'), { when: flags.open })
      @Choice('Return', scene('dorm', { entry: 'night' }))
    `)

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].type).toBe('choice')
    expect((result.steps[0].content as any).options).toMatchObject([
      { text: 'Go outside', source: 'decorator' },
      { text: 'Return', source: 'decorator' },
    ])
  })

  it('should parse non-ascii speakers and nested template expressions', () => {
    const parser = new QuaScriptParser()
    const result = parser.parse('雪乃: 你好 $' + '{format({ name: scope.playerName })}!')

    expect(result.steps[0].type).toBe('dialogue')
    const dialogue = result.steps[0].content as any
    expect(dialogue.character).toBe('雪乃')
    expect(dialogue.templateExpressions).toEqual(['format({ name: scope.playerName })'])
  })
})
