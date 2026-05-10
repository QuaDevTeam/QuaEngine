import { animationDecoratorMappings } from '@quajs/plugin-animation'
import { backgroundDecoratorMappings } from '@quajs/plugin-background'
import { describe, expect, it } from 'vitest'
import { createPluginAwareTransformerAsync } from '../src'
import { QuaScriptTransformer } from '../src/core/transformer'
import { mergeDecoratorMappings } from '../src/core/types'

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

  it('should transform dialogue with decorators', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlayVoice('hello.mp3')
          @SetSprite('jack_happy.png')
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('playVoiceWithEngine(ctx.engine, "hello.mp3",')
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

  it('should transform background decorators through the background plugin', () => {
    const transformer = createBackgroundTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetBackground('classroom.png', 'fade', 300, 'ease-out')
          @VideoBackground('rain.mp4', true, true, 0.4, 'rain.png', 'crossfade', 500)
          @SetLayeredBackground('fade', 200)
          @BackgroundLayer('sky', 'sky.png', 0, 0, 1, 1, 0)
          @BackgroundLayerTransition('sky', 'fade', 180)
          @BackgroundTransition('wipe', 240)
          @ClearBackground()
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('setBackgroundWithEngine(ctx.engine, "classroom.png", {')
    expect(result).toContain('type: "fade"')
    expect(result).toContain('duration: 300')
    expect(result).toContain('easing: "ease-out"')
    expect(result).toContain('setVideoBackgroundWithEngine(ctx.engine, "rain.mp4", {')
    expect(result).toContain('loop: true')
    expect(result).toContain('muted: true')
    expect(result).toContain('volume: 0.4')
    expect(result).toContain('poster: "rain.png"')
    expect(result).toContain('setLayeredBackgroundWithEngine(ctx.engine, [], {')
    expect(result).toContain('addBackgroundLayerWithEngine(ctx.engine, {')
    expect(result).toContain('id: "sky"')
    expect(result).toContain('assetName: "sky.png"')
    expect(result).toContain('transitionBackgroundLayerWithEngine(ctx.engine, "sky", {')
    expect(result).toContain('transitionBackgroundWithEngine(ctx.engine, {')
    expect(result).toContain('clearBackgroundWithEngine(ctx.engine)')
    expect(result).toMatch(/import.*setBackgroundWithEngine.*clearBackgroundWithEngine.*setVideoBackgroundWithEngine.*setLayeredBackgroundWithEngine.*addBackgroundLayerWithEngine.*transitionBackgroundWithEngine.*transitionBackgroundLayerWithEngine.*from.*@quajs\/plugin-background/s)
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello world!")')
  })

  it('should require a background asset for set background decorators', () => {
    const transformer = createBackgroundTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetBackground()
          Jack: Hello world!
        \`)
      }
    `

    expect(() => transformer.transformSource(source)).toThrow('@SetBackground requires asset')
  })

  it('does not treat background decorators as compiler built-ins', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetBackground('classroom.png')
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).not.toContain('setBackgroundWithEngine')
    expect(result).not.toContain('ctx.engine.setBackground')
  })

  it('should add required imports', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlayVoice('hello.mp3')
          Jack: Hello!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    // Engine decorators are invoked through ctx.engine, not imported as free functions.
    expect(result).not.toMatch(/import.*playVoiceWithEngine.*from.*@quajs\/engine/)
    expect(result).not.toMatch(/import.*dialogue.*from.*@quajs\/engine/)
    expect(result).toMatch(/import.*speakWithEngine.*from.*@quajs\/character/)
    expect(result).toContain('from "@quajs/plugin-audio"')
    expect(result).toContain('playVoiceWithEngine')
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

  it('should transform named animation definitions from decorator timelines', () => {
    const transformer = createAnimationTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @DefineAnimation('character.enter-left', 480)
          @Key('position.x', 0, -180)
          @Key('position.x', 480, 40)

          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('registerAnimationWithEngine(ctx.engine, {')
    expect(result).toContain('id: "character.enter-left"')
    expect(result).toContain('duration: 480')
    expect(result).toContain('target: "self"')
    expect(result).toContain('property: "position.x"')
    expect(result).toMatch(/import.*registerAnimationWithEngine.*from.*@quajs\/plugin-animation/s)
  })

  it('should transform anonymous dialogue timelines with omitted self resolved to the speaker', () => {
    const transformer = createAnimationTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @Timeline(360, true)
          @Key('position.x', 0, -180)
          @Key('position.x', 360, 0)
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('playTimelineWithEngine(ctx.engine, {')
    expect(result).toContain('target: "self"')
    expect(result).toContain('defaultTarget: "character:Jack"')
    expect(result).toContain('wait: true')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello world!")')
  })

  it('should transform play animation decorators with binding strings and wait flag', () => {
    const transformer = createAnimationTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlayAnimation('character.enter-left', 'actor=character:Alice', true)
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('playAnimationWithEngine(ctx.engine, "character.enter-left", {')
    expect(result).toContain('bindings: ["actor=character:Alice"]')
    expect(result).toContain('defaultTarget: "character:Jack"')
    expect(result).toContain('wait: true')
  })

  it('should apply dialogue self target to play animation decorators without bindings', () => {
    const transformer = createAnimationTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @PlayAnimation('character.enter-left', true)
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('playAnimationWithEngine(ctx.engine, "character.enter-left", {')
    expect(result).toContain('defaultTarget: "character:Jack"')
    expect(result).not.toContain('bindings:')
  })

  it('should reject omitted key targets on action-only anonymous timelines', () => {
    const transformer = createAnimationTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @Timeline(360)
          @Key('position.x', 0, -180)

          Jack: Hello world!
        \`)
      }
    `

    expect(() => transformer.transformSource(source)).toThrow('@Key with an omitted target is ambiguous')
  })
})

function createBackgroundTransformer(): QuaScriptTransformer {
  return new QuaScriptTransformer(mergeDecoratorMappings(backgroundDecoratorMappings))
}

function createAnimationTransformer(): QuaScriptTransformer {
  return new QuaScriptTransformer(mergeDecoratorMappings(animationDecoratorMappings))
}
