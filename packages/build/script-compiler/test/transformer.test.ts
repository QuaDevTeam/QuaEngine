import { parse } from '@babel/parser'
import { animationDecoratorMappings } from '@quajs/plugin-animation'
import { audioDecoratorMappings } from '@quajs/plugin-audio'
import { backgroundDecoratorMappings } from '@quajs/plugin-background'
import { describe, expect, it } from 'vitest'
import { compileQuaScriptModuleToTs, createPluginAwareTransformerAsync, extractQuaScriptStoryDeclaration, generateQuaScriptModuleDeclaration } from '../src'
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

  it('should parse qs templates in files with TypeScript decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      @sealed
      class Scene {}

      function scene1() {
        dialogue(qs\`
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('@sealed')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack", "Hello world!")')
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

  it('should compile standalone qs files as importable script factories', () => {
    const result = compileQuaScriptModuleToTs(`
      Jack: Hello \${scope.playerName}!
      - Continue -> next if scope.unlocked
    `, { hotReload: false })

    expect(result).toContain('export default function createQuaScript(scope: Record<string, unknown> = {}): GameStep[]')
    expect(result).toContain('speakWithEngine(ctx.engine, "Jack"')
    expect(result).toContain('scope.playerName')
    expect(result).toContain('enabled: scope.unlocked')
  })

  it('generates stable runtime module step ids for dynamic QuaScript packages', () => {
    const source = `
      Jack: Hello runtime package.
      - Continue -> next
    `
    const first = compileQuaScriptModuleToTs(source, {
      hotReload: false,
      runtimeModule: {
        moduleId: 'runtime.chapter1',
        version: '1.0.0',
        stableSeed: 'build-42',
      },
    })
    const second = compileQuaScriptModuleToTs(source, {
      hotReload: false,
      runtimeModule: {
        moduleId: 'runtime.chapter1',
        version: '1.0.0',
        stableSeed: 'build-42',
      },
    })
    const changedSeed = compileQuaScriptModuleToTs(source, {
      hotReload: false,
      runtimeModule: {
        moduleId: 'runtime.chapter1',
        version: '1.0.0',
        stableSeed: 'build-43',
      },
    })

    const ids = (code: string) => Array.from(code.matchAll(/uuid: "(qs:runtime\.chapter1:[^"]+)"/g), match => match[1])

    expect(ids(first)).toHaveLength(2)
    expect(ids(first)).toEqual(ids(second))
    expect(ids(first)).not.toEqual(ids(changedSeed))
  })

  it('should compile typed qs files with module and setup scripts', () => {
    const result = compileQuaScriptModuleToTs(`
<script lang="ts">
import { canContinue, formatName } from './logic.ts'

export interface Scope {
  playerName: string
  unlocked: boolean
}
</script>

<script setup lang="ts">
const displayName = formatName(scope.playerName)
</script>

Yuki: Hello \${formatName(displayName)}!
- Continue -> next if canContinue(scope.playerName) && scope.unlocked
    `, { hotReload: false })

    expect(result).toContain('import { canContinue, formatName } from \'./logic.ts\'')
    expect(result).toContain('export interface Scope')
    expect(result).toContain('export default function createQuaScript(scope: Scope): GameStep[]')
    expect(result).toContain('const displayName = formatName(scope.playerName)')
    expect(result).toContain('resolveQuaText(ctx, ["Hello ", formatName(displayName), "!"])')
    expect(result).toContain('enabled: canContinue(scope.playerName) && scope.unlocked')
  })

  it('compiles QuaScript text expressions as async text parts with translation helpers', () => {
    const result = compileQuaScriptModuleToTs(`
      Yuki: \${$t('intro.greeting', { name: scope.playerName })}!
      - \${Promise.resolve('Continue')} -> next
    `, { hotReload: false })

    expect(result).toContain('import { resolveQuaText } from "@quajs/engine";')
    expect(result).toContain('const $t = (key, options) => ctx.t(key, options)')
    expect(result).toContain('const t = $t')
    expect(result).toContain('await resolveQuaText(ctx, ["", $t(\'intro.greeting\', {')
    expect(result).toContain('name: scope.playerName')
    expect(result).toContain('text: await resolveQuaText(ctx, ["", Promise.resolve(\'Continue\'), ""])')
  })

  it('should generate per-file qs declarations', () => {
    const result = generateQuaScriptModuleDeclaration(`
<script lang="ts">
export interface Scope {
  playerName: string
}
</script>

Yuki: Hello \${scope.playerName}
    `)

    expect(result).toContain('export interface Scope')
    expect(result).toContain('declare const createQuaScript: (scope: Scope) => GameStep[];')
  })

  it('compiles audio compile-time decorators through the default registry', () => {
    const result = compileQuaScriptModuleToTs(`
      @AudioChapter('chapter-1', { voiceMap: { intro: 'voice/intro.ogg' } })
      @LineId('intro')
      @PlayVoice()
      @PlaySFX('sfx/click.ogg')
      @PlayAmbient('ambient/rain.ogg', { id: 'rain' })
      @StopSFX()
      @StopAmbient()
      Yuki: Hello with mapped voice.
    `, {
      decoratorMappings: audioDecoratorMappings,
      hotReload: false,
    })

    expect(result).toContain('configureAudioChapterWithEngine(ctx.engine, "chapter-1"')
    expect(result).toContain('playVoiceWithEngine(ctx.engine, "voice/intro.ogg"')
    expect(result).toContain('playSFXWithEngine(ctx.engine, "sfx/click.ogg"')
    expect(result).toContain('playAmbientWithEngine(ctx.engine, "ambient/rain.ogg"')
    expect(result).toContain('stopSFXWithEngine(ctx.engine, "sfx"')
    expect(result).toContain('stopAmbientWithEngine(ctx.engine, "ambient"')
    expect(result).not.toContain('lineIdDirective')
  })

  it('compiles engine save/load decorators through ctx.engine', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SaveToSlot('slot-1', { name: 'Before choice' })
          @QuickSave()
          @AutoSave({ reason: 'chapter-end' })
          Jack: Save here.
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('ctx.engine.saveToSlot("slot-1", {')
    expect(result).toContain('name: "Before choice"')
    expect(result).toContain('ctx.engine.quickSave()')
    expect(result).toContain('ctx.engine.autoSave({')
    expect(result).toContain('reason: "chapter-end"')
  })

  it('stops the current step after engine load decorators', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @QuickLoad()
          Jack: This should not overwrite the loaded state.
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toMatch(/await ctx\.engine\.quickLoad\(\);\s*return;\s*await speakWithEngine/)
  })

  it('loads story graph and backlog decorators from plugin package metadata', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const source = `
      function scene1() {
        dialogue(qs\`
          @Chapter('chapter-1')
          @StoryTimeline('route-a')
          @Entry('nightReturn')
          @NoBacklog
          Jack: Hidden line.
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('setStoryMetadataWithEngine(ctx.engine, {')
    expect(result).toContain('chapterId: "chapter-1"')
    expect(result).toContain('timelineId: "route-a"')
    expect(result).toContain('entryId: "nightReturn"')
    expect(result).toContain('setBacklogPolicyWithEngine(ctx.engine, {')
    expect(result).toContain('include: false')
    expect(result).toContain('from "@quajs/story-graph"')
    expect(result).toContain('from "@quajs/plugin-backlog"')
  })

  it('compiles entry decorators into step story metadata', () => {
    const transformer = new QuaScriptTransformer()
    const result = transformer.transformSource(`
      function scene1() {
        dialogue(qs\`
          @Scene('dorm')
          @Entry('nightReturn')
          Yuki: Back home.
        \`)
      }
    `)

    expect(result).toContain('metadata: {')
    expect(result).toContain('point: {')
    expect(result).toContain('sceneId: "dorm"')
    expect(result).toContain('entryId: "nightReturn"')
  })

  it('keeps entry metadata active across story declarations', () => {
    const story = extractQuaScriptStoryDeclaration(`
@Scene('library')
@Entry('main')

@Node('library.enter', { title: 'Library' })
Yuki: We arrived.
- Continue -> #afterIntro
    `, { moduleId: 'runtime.story.library', runtimePackageId: 'runtime.story' })

    expect(story.entries[0]).toEqual(expect.objectContaining({
      id: 'main',
      point: expect.objectContaining({ sceneId: 'library', entryId: 'main' }),
    }))
    expect(story.nodes[0].point).toEqual(expect.objectContaining({
      sceneId: 'library',
      entryId: 'main',
      nodeId: 'library.enter',
      scriptModuleId: 'runtime.story.library',
      contentPackageId: 'runtime.story',
    }))
    expect(story.choices[0].point).toEqual(expect.objectContaining({
      sceneId: 'library',
      entryId: 'main',
      nodeId: 'library.enter',
    }))
  })

  it('adds runtime package provenance to story asset refs in declarations', () => {
    const story = extractQuaScriptStoryDeclaration(`
@Scene('library', { thumbnail: image('story/library-scene.png') })
@Entry('main', { thumbnail: image('story/library-entry.png') })
@Node('library.enter', { title: 'Library', thumbnail: image('story/library.png') })
Yuki: We arrived.
    `, { moduleId: 'runtime.story.library', runtimePackageId: 'runtime.story' })

    expect(story.scenes[0].metadata?.thumbnail).toEqual({ type: 'images', name: 'story/library-scene.png', runtimePackageId: 'runtime.story' })
    expect(story.entries?.[0].metadata?.thumbnail).toEqual({ type: 'images', name: 'story/library-entry.png', runtimePackageId: 'runtime.story' })
    expect(story.nodes[0].presentation?.thumbnail).toEqual({ type: 'images', name: 'story/library.png', runtimePackageId: 'runtime.story' })
  })

  it('resets lower-level story declaration metadata when scene changes', () => {
    const story = extractQuaScriptStoryDeclaration(`
@Scene('library')
@Entry('main')
@Node('library.enter')
Yuki: We arrived.

@Scene('dorm')
@Node('dorm.start')
Yuki: Back home.
    `)

    expect(story.nodes[0].point).toEqual(expect.objectContaining({
      sceneId: 'library',
      entryId: 'main',
      nodeId: 'library.enter',
    }))
    expect(story.nodes[1].point).toEqual(expect.objectContaining({
      sceneId: 'dorm',
      nodeId: 'dorm.start',
    }))
    expect(story.nodes[1].point).not.toEqual(expect.objectContaining({
      entryId: 'main',
    }))
  })

  it('rejects invalid script blocks while generating declarations', () => {
    expect(() => generateQuaScriptModuleDeclaration(`
<script>
const value = 1
</script>

Yuki: Hello
    `)).toThrow('<script> blocks in .qs files must use lang="ts".')
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

  it('should transform character motion decorators through animation helpers', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @CharacterEnter('Jack', 'left', 450, { fromX: -240, toX: 40, y: 80 }, true)
          @CharacterFade('Jack', 0, 1, 300, true)
          @CharacterExit('Jack', 'bottom', 350, { x: 40, y: 80 }, true)
          Jack: Hello world!
        \`)
      }
    `

    const result = transformer.transformSource(source)

    expect(result).toContain('playCharacterEnterWithEngine(ctx.engine, "Jack", "left", {')
    expect(result).toContain('duration: 450')
    expect(result).toContain('fromX: -240')
    expect(result).toContain('toX: 40')
    expect(result).toContain('wait: true')
    expect(result).toContain('playCharacterFadeWithEngine(ctx.engine, "Jack", 0, 1, 300, {')
    expect(result).toContain('playCharacterExitWithEngine(ctx.engine, "Jack", "bottom", {')
    expect(result).toMatch(/import.*playCharacterEnterWithEngine.*playCharacterFadeWithEngine.*playCharacterExitWithEngine.*from.*@quajs\/character\/animation/s)
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
          @SetBackground('classroom.png', { transition: { type: 'fade', duration: 300, easing: 'ease-out' }, fit: 'cover' })
          @VideoBackground('rain.mp4', { loop: true, muted: true, volume: 0.4, poster: 'rain.png', transition: { type: 'crossfade', duration: 500 } })
          @SetLayeredBackground({ transition: { type: 'fade', duration: 200 } })
          @BackgroundLayer('sky', 'sky.png', { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 0, composition: { blendMode: 'screen' } })
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
    expect(result).toContain('fit: "cover"')
    expect(result).toContain('setVideoBackgroundWithEngine(ctx.engine, "rain.mp4", {')
    expect(result).toContain('loop: true')
    expect(result).toContain('muted: true')
    expect(result).toContain('volume: 0.4')
    expect(result).toContain('poster: "rain.png"')
    expect(result).toContain('setLayeredBackgroundWithEngine(ctx.engine, [], {')
    expect(result).toContain('addBackgroundLayerWithEngine(ctx.engine, {')
    expect(result).toContain('id: "sky"')
    expect(result).toContain('assetName: "sky.png"')
    expect(result).toContain('blendMode: "screen"')
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

  it('escapes literal template text when emitting dialogue template literals', () => {
    const result = compileQuaScriptModuleToTs(
      'Jack: Path C:\\temp and tick `value` $' + '{scope.playerName}',
      { hotReload: false },
    )

    expect(() => parse(result, {
      sourceType: 'module',
      plugins: ['typescript'],
    })).not.toThrow()
    expect(result).toContain('resolveQuaText(ctx, ["Path C:\\\\temp and tick `value` ", scope.playerName, ""])')
  })

  it('rejects malformed QuaScript TypeScript expressions and decorator arguments', () => {
    expect(() => compileQuaScriptModuleToTs(
      'Jack: Hello $' + '{scope.}',
      { hotReload: false },
    )).toThrow(/Invalid TypeScript expression in QuaScript/)

    expect(() => compileQuaScriptModuleToTs(
      'Jack: Hello $' + '{scope.playerName',
      { hotReload: false },
    )).toThrow(/Unterminated QuaScript interpolation/)

    expect(() => compileQuaScriptModuleToTs(
      '@SetSprite({ broken: })\nJack: Hello',
      { hotReload: false },
    )).toThrow(/Invalid TypeScript decorator arguments/)
  })

  it('rejects malformed decorator arguments inside qs tagged templates', () => {
    const transformer = new QuaScriptTransformer()
    const source = `
      function scene1() {
        dialogue(qs\`
          @SetSprite({ broken: })
          Jack: Hello world!
        \`)
      }
    `

    expect(() => transformer.transformSource(source)).toThrow(/Invalid TypeScript decorator arguments/)
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
    expect(result).toContain('target: {')
    expect(result).toContain('kind: "node"')
    expect(result).toContain('id: "outside"')
    expect(result).toContain('jumpTarget: {')
    expect(result).toContain('storyGraph: {')
    expect(result).toContain('edge: {')
    expect(result).toContain('kind: "choice"')
    expect(result).toContain('to: "outside"')
    expect(result).toContain('enabled: flags.canStayHome')
  })

  it('transforms @Choice decorators with helper targets and presentation metadata', () => {
    const result = compileQuaScriptModuleToTs(`
<script setup lang="ts">
const canEnterLibrary = scope.hasKey
</script>

@Choice('Go library', node('library'), {
  when: canEnterLibrary,
  unavailable: { mode: 'disabled', reason: 'Need key' },
  presentation: { thumbnail: image('story/library.png') }
})
@Choice('Return dorm', scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }))
    `, { hotReload: false })

    expect(result).toContain('import { node, image, scene } from "@quajs/engine"')
    expect(result).toContain('text: "Go library"')
    expect(result).toContain("target: node('library')")
    expect(result).toContain('enabled: canEnterLibrary')
    expect(result).toContain('unavailable: {')
    expect(result).toContain("thumbnail: image('story/library.png')")
    expect(result).toContain("target: scene('dorm', {")
    expect(result).toContain("entry: 'nightReturn'")
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
          @AnimationTimeline(360, true)
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
          @AnimationTimeline(360)
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
