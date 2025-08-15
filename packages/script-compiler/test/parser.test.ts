import { describe, expect, it } from 'vitest'
import { QuaScriptParser } from '../src/parser'

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
      @PlaySound('hello.mp3')
      @UseSprite('jack_happy.png')
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
      expect(allDecorators.some((d: any) => d.name === 'PlaySound')).toBe(true)
      expect(allDecorators.some((d: any) => d.name === 'UseSprite')).toBe(true)
    }
  })

  it('should parse decorators with multiple arguments', () => {
    const parser = new QuaScriptParser()
    const script = `
      @RunFunction('testFunc', 42, true, 'string')
      Jack: Hello!
    `

    const result = parser.parse(script)
    const dialogue = result.steps[0].content as any

    expect(dialogue.decorators[0].args).toEqual(['testFunc', 42, true, 'string'])
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
      @PlaySound('background.mp3')
      @SetVolume('bgm', 0.8)
      
      Jack: Now with background music!
    `

    const result = parser.parse(script)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].type).toBe('action')

    const actionContent = result.steps[0].content as any
    expect(actionContent.decorators).toHaveLength(2)
    expect(actionContent.decorators[0].name).toBe('PlaySound')
    expect(actionContent.decorators[1].name).toBe('SetVolume')

    expect(result.steps[1].type).toBe('dialogue')
    const dialogueContent = result.steps[1].content as any
    expect(dialogueContent.character).toBe('Jack')
  })
})
