import { describe, test, expect } from 'vitest'
import { QuaScriptTransformer } from '../src/transformer'

describe('QuaScriptTransformer', () => {
  test('should transform simple qs template literal', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      import { dialogue } from '@quajs/engine';
      
      function scene1() {
        dialogue(qs\`
          Jack: Hello world!
          John: How are you?
        \`)
      }
    `
    
    const result = transformer.transformSource(source)
    
    // Should contain dialogue array transformation
    expect(result).toContain('dialogue([')
    expect(result).toContain('Jack.speak(')
    expect(result).toContain('John.speak(')
    expect(result).toContain('uuid')
    expect(result).toContain('run:')
  })

  test('should transform dialogue with decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlaySound('hello.mp3')
          @UseSprite('jack_happy.png')
          Jack: Hello world!
        \`)
      }
    `
    
    const result = transformer.transformSource(source)
    
    expect(result).toContain('playSound("hello.mp3")')
    expect(result).toContain('useSprite("jack_happy.png")')
    expect(result).toContain('Jack.speak("Hello world!")')
  })

  test('should add required imports', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlaySound('hello.mp3')
          Jack: Hello!
        \`)
      }
    `
    
    const result = transformer.transformSource(source)
    
    // Should add imports for used functions
    expect(result).toMatch(/import.*playSound.*from.*@quajs\/engine/)
    expect(result).toMatch(/import.*dialogue.*from.*@quajs\/engine/)
  })

  test('should handle template expressions in dialogue', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        const name = 'World'
        dialogue(qs\`
          Jack: Hello \${name}!
        \`)
      }
    `
    
    const result = transformer.transformSource(source)
    
    // Should preserve template literal structure
    expect(result).toContain('Jack.speak(')
    // Template expressions should be handled properly
    expect(result).toContain('name') // Variable reference should be preserved
  })

  test('should not transform code without qs template literals', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function normalFunction() {
        console.log('Hello world!')
        const template = \`Hello \${name}!\`
        return template
      }
    `
    
    const result = transformer.transformSource(source)
    
    // Should remain mostly unchanged since no qs templates
    // Note: Babel might reformat the code slightly
    expect(result).toContain('console.log(')
    expect(result).toContain('const template')
    expect(result).not.toContain('dialogue([')
  })

  test('should handle multiple qs templates in same file', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function part1() {
        dialogue(qs\`
          Jack: First part!
        \`)
      }
      
      function part2() {
        dialogue(qs\`
          John: Second part!
        \`)
      }
    `
    
    const result = transformer.transformSource(source)
    
    expect(result).toMatch(/Jack\.speak\("First part!"\)/)
    expect(result).toMatch(/John\.speak\("Second part!"\)/)
  })
})