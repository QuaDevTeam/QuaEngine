import { audioDecoratorMappings, scriptCompiler as audioScriptCompiler } from '@quajs/plugin-audio/script-compiler'
import { describe, expect, it } from 'vitest'
import { createPluginAwareTransformerAsync } from '../src'
import { QuaScriptParser } from '../src/core/parser'

describe('quaScript Integration Tests', () => {
  it('complete transformation workflow', async () => {
    const source = `
      function scene1() {
        const playerName = 'Hero'
        dialogue(qs\`
          @AudioChapter('chapter-1', { voiceMap: { 'chapter-1:1': 'voice/intro', 'chapter-1:2': 'voice/intro-2' }, bgm: 'bgm/opening' })
          @PlayBGM('bgm/opening')
          @PlayVoice('voice/intro')
          Jack: Hello \${playerName}!
          @LineId('chapter-1:2')
          @PlayVoice('voice/intro-2')
          John: Nice to meet you.
        \`)
      }
    `

    const transformer = await createPluginAwareTransformerAsync(audioDecoratorMappings, {
      decoratorCompilers: audioScriptCompiler.compilers,
      projectRoot: undefined,
    })
    const result = transformer.transformSource(source)

    // Should contain the transformed dialogue array
    expect(result).toContain('dialogue([')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", ')
    expect(result).toContain('speakWithEngine(ctx.engine, "John", ')
    expect(result).toContain('configureAudioChapterWithEngine(ctx.engine, "chapter-1", ')
    expect(result).toContain('playBGMWithEngine(ctx.engine, "bgm/opening", ')
    expect(result).toContain('playVoiceWithEngine(ctx.engine, "voice/intro", ')
    expect(result).toContain('uuid')

    // Should add required imports. Engine decorators are invoked via ctx.engine.
    expect(result).not.toMatch(/import.*playVoiceWithEngine.*from.*"@quajs\/engine"/)
    expect(result).not.toMatch(/import.*dialogue.*from.*"@quajs\/engine"/)
    expect(result).toMatch(/import.*speakWithEngine.*from.*"@quajs\/character"/)
    expect(result).toContain('from "@quajs/plugin-audio"')
    expect(result).toContain('configureAudioChapterWithEngine')
    expect(result).toContain('playBGMWithEngine')
    expect(result).toContain('playVoiceWithEngine')
  })

  it('parser handles complex script structure', () => {
    const parser = new QuaScriptParser()
    const script = `
      @AudioChapter('chapter-2', { bgm: 'bgm/theme' })
      @SetAudioGain('bgm', 0.5)
      @PlayBGM('theme.mp3')
      
      Jack: Welcome to the story!
      
      @SetSprite('john_thinking.png')
      John: This is interesting \${playerThought}.
      
      @PlayVoice('click.wav')
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
    const johnStep = dialogueSteps.find((step) => {
      const content = step.content as any
      return content.character === 'John' && content.templateExpressions?.includes('playerThought')
    })
    expect(johnStep).toBeTruthy()
  })

  it('handles edge cases gracefully', () => {
    const parser = new QuaScriptParser()

    // Empty script
    expect(parser.parse('').steps).toHaveLength(0)

    // Only decorators
    const decoratorOnly = parser.parse('@PlayVoice("test.mp3")')
    expect(decoratorOnly.steps).toHaveLength(1)
    expect(decoratorOnly.steps[0].type).toBe('action')

    // Only dialogue
    const dialogueOnly = parser.parse('Jack: Hello world!')
    expect(dialogueOnly.steps).toHaveLength(1)
    expect(dialogueOnly.steps[0].type).toBe('dialogue')
  })

  it('preserves original imports and adds new ones', async () => {
    const source = `
      import { someFunction } from './utils'
      import { dialogue } from '@quajs/engine'
      
      function scene1() {
        dialogue(qs\`
          @PlayVoice('test.mp3')
          Jack: Hello!
        \`)
      }
    `

    const transformer = await createPluginAwareTransformerAsync(audioDecoratorMappings, {
      decoratorCompilers: audioScriptCompiler.compilers,
      projectRoot: undefined,
    })
    const result = transformer.transformSource(source)

    // Should preserve original imports (note Babel may change quote style)
    expect(result).toMatch(/import.*someFunction.*from.*['"]\.\/utils['"]/)

    // Should not duplicate dialogue import and should not import engine methods.
    expect(result).not.toMatch(/import.*playVoiceWithEngine.*from.*['"]@quajs\/engine['"]/)

    // Should contain transformed dialogue
    expect(result).toContain('dialogue([')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello!")')
    expect(result).toContain('playVoiceWithEngine(ctx.engine, "test.mp3", ')
  })
})
