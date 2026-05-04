import { describe, expect, it } from 'vitest'
import { QuaScriptTransformer } from '../src/core/transformer'

describe('quaScriptTransformer', () => {
  it('should transform simple qs template literal', () => {
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
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", ')
    expect(result).toContain('speakWithEngine(ctx.engine, "John", ')
    expect(result).toContain('uuid')
    expect(result).toContain('run:')
  })

  it('should transform dialogue with decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlaySound('hello.mp3')
          @SetSprite('jack_happy.png')
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('ctx.engine.playSound("hello.mp3")')
    expect(result).toContain('spriteWithEngine(ctx.engine, "Jack", "jack_happy.png")')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello world!")')
  })

  it('should transform character decorators through character helpers and engine state', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @ShowCharacter('Jack', 'jack_idle.png', 'neutral', 40, 80, 2)
          @MoveCharacter('Jack', 55, 80, 1.1)
          @SetExpression('happy', 'Jack')
          @HideCharacter('Jack')
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('showWithEngine(ctx.engine, "Jack", {')
    expect(result).toContain('sprite: "jack_idle.png"')
    expect(result).toContain('expression: "neutral"')
    expect(result).toContain('position: {')
    expect(result).toContain('x: 40')
    expect(result).toContain('y: 80')
    expect(result).toContain('layer: 2')
    expect(result).toContain('moveWithEngine(ctx.engine, "Jack", {')
    expect(result).toContain('scale: 1.1')
    expect(result).toContain('expressionWithEngine(ctx.engine, "Jack", "happy")')
    expect(result).toContain('hideWithEngine(ctx.engine, "Jack")')
    expect(result).toMatch(/import.*speakWithEngine.*showWithEngine.*hideWithEngine.*moveWithEngine.*expressionWithEngine.*from.*@quajs\/character/s)
    expect(result).not.toMatch(/import.*show,.*from.*@quajs\/character/s)
  })

  it('should require an explicit character for action-only character decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetSprite('jack_happy.png')

          Jack: Hello world!
        \`)
      }
    `

    expect(() => transformer.transformSource(source)).toThrow('@SetSprite requires an explicit character')
  })

  it('should require a sprite asset for sprite decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetSprite()
          Jack: Hello world!
        \`)
      }
    `

    expect(() => transformer.transformSource(source)).toThrow('@SetSprite requires asset')
  })

  it('should transform background decorators through engine state', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetBackground('classroom.png')
          @ClearBackground()
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('ctx.engine.setBackground("classroom.png")')
    expect(result).toContain('ctx.engine.clearBackground()')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello world!")')
  })

  it('should add required imports', () => {
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

    // Engine decorators are invoked through ctx.engine, not imported as free functions.
    expect(result).not.toMatch(/import.*playSound.*from.*@quajs\/engine/)
    expect(result).not.toMatch(/import.*dialogue.*from.*@quajs\/engine/)
    expect(result).toMatch(/import.*speakWithEngine.*from.*@quajs\/character/)
  })

  it('should handle template expressions in dialogue', () => {
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
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", ')
    // Template expressions should be handled properly
    expect(result).toContain('name') // Variable reference should be preserved
  })

  it('should not transform code without qs template literals', () => {
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

  it('should handle multiple qs templates in same file', () => {
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

    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "First part!")')
    expect(result).toContain('speakWithEngine(ctx.engine, "John", "Second part!")')
  })

  it('should transform choices into engine-owned choice state and wait for selection', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          Jack: Choose.
          - Go outside -> outside
          - Stay home -> home if flags.canStayHome
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('await ctx.engine.showChoices(choices)')
    expect(result).toContain('await ctx.engine.waitFor("user/choice_select"')
    expect(result).toContain('await ctx.engine.clearChoices()')
    expect(result).toContain('ctx.choice = selected')
    expect(result).toContain('target: "outside"')
    expect(result).toContain('target: "home"')
    expect(result).toContain('enabled: flags.canStayHome')
  })
})
