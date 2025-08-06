import { describe, test, expect } from 'vitest'
import { QuaScriptParser } from '../src/parser'
import { QuaScriptTransformer } from '../src/transformer'

describe('QuaScript Integration Tests', () => {
  test('complete transformation workflow', () => {
    const source = `
      function scene1() {
        const playerName = 'Hero'
        dialogue(qs\`
          @PlaySound('intro.mp3')
          Jack: Hello \${playerName}!
          John: Nice to meet you.
        \`)
      }
    `

    const transformer = new QuaScriptTransformer()
    const result = transformer.transformSource(source)

    // Should contain the transformed dialogue array
    expect(result).toContain('dialogue([')
    expect(result).toContain('Jack.speak(')
    expect(result).toContain('John.speak(')
    expect(result).toContain('playSound("intro.mp3")')
    expect(result).toContain('uuid')

    // Should add required imports
    expect(result).toMatch(/import.*playSound.*from.*"@quajs\/engine"/)
    expect(result).toMatch(/import.*dialogue.*from.*"@quajs\/engine"/)
  })

  test('parser handles complex script structure', () => {
    const parser = new QuaScriptParser()
    const script = `
      @SetVolume('bgm', 0.5)
      @PlayBGM('theme.mp3')
      
      Jack: Welcome to the story!
      
      @UseSprite('john_thinking.png')
      John: This is interesting \${playerThought}.
      
      @PlaySound('click.wav')
      Jack: What do you think?
    `

    const result = parser.parse(script)
    
    // The parser should handle gaps and create appropriate steps
    // We expect at least the dialogue steps plus action steps
    expect(result.steps.length).toBeGreaterThanOrEqual(3)
    
    expect(result.characters.size).toBe(2)
    expect(result.characters.has('Jack')).toBe(true)
    expect(result.characters.has('John')).toBe(true)

    // Check that we have dialogue steps
    const dialogueSteps = result.steps.filter(step => step.type === 'dialogue')
    expect(dialogueSteps.length).toBeGreaterThanOrEqual(3)

    // Find John's dialogue with template expression
    const johnStep = dialogueSteps.find(step => {
      const content = step.content as any
      return content.character === 'John' && content.templateExpressions?.includes('playerThought')
    })
    expect(johnStep).toBeTruthy()
  })

  test('handles edge cases gracefully', () => {
    const parser = new QuaScriptParser()
    
    // Empty script
    expect(parser.parse('').steps).toHaveLength(0)
    
    // Only decorators
    const decoratorOnly = parser.parse('@PlaySound("test.mp3")')
    expect(decoratorOnly.steps).toHaveLength(1)
    expect(decoratorOnly.steps[0].type).toBe('action')
    
    // Only dialogue
    const dialogueOnly = parser.parse('Jack: Hello world!')
    expect(dialogueOnly.steps).toHaveLength(1)
    expect(dialogueOnly.steps[0].type).toBe('dialogue')
  })

  test('preserves original imports and adds new ones', () => {
    const source = `
      import { someFunction } from './utils'
      import { dialogue } from '@quajs/engine'
      
      function scene1() {
        dialogue(qs\`
          @PlaySound('test.mp3')
          Jack: Hello!
        \`)
      }
    `

    const transformer = new QuaScriptTransformer()
    const result = transformer.transformSource(source)

    // Should preserve original imports (note Babel may change quote style)
    expect(result).toMatch(/import.*someFunction.*from.*['"]\.\/utils['"]/)
    
    // Should not duplicate dialogue import but should add playSound
    expect(result).toMatch(/import.*playSound.*from.*['"]@quajs\/engine['"]/)
    
    // Should contain transformed dialogue
    expect(result).toContain('dialogue([')
    expect(result).toContain('Jack.speak("Hello!")')
    expect(result).toContain('playSound("test.mp3")')
  })
})