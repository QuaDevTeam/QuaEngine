# QuaScript Compiler

A TypeScript-based DSL compiler for QuaEngine that transforms QuaScript dialogue syntax into executable JavaScript code.

## Features

- **Simple Dialogue Syntax**: Write natural dialogue using `Character: Text` format
- **Decorator System**: Use `@Decorator()` syntax for actions and effects
- **Template Literals**: Full TypeScript template string support with `${expression}`
- **Vite Plugin**: Seamless integration with Vite-based build systems
- **CLI Tool**: Standalone compiler for build pipelines
- **Type Safety**: Full TypeScript support with proper type definitions

## QuaScript Syntax

### Basic Dialogue

```typescript
function scene1() {
  dialogue(qs`
    Jack: Hello world!
    John: How are you doing?
    Jack: I'm doing great, thanks!
  `)
}
```

### With Decorators

```typescript
function scene1() {
  dialogue(qs`
    @AudioChapter('chapter-1', {
      voiceMap: {
        'chapter-1:1': 'voice/hello',
      },
      bgm: 'bgm/chapter-1',
    })
    @PlayBGM('bgm/chapter-1')
    Jack: Hello world!

    @SetSprite('john_happy.png')
    @PlayVoice('voice/hello')
    John: How are you doing?
  `)
}
```

### With Template Expressions

```typescript
function scene1() {
  const playerName = 'Hero'
  dialogue(qs`
    Jack: Hello ${playerName}!
    John: Nice to meet you, ${playerName}.
  `)
}
```

## Installation

```bash
npm install @quajs/script-compiler
```

## Usage

### Vite Plugin

```typescript
import { quaScriptPlugin } from '@quajs/script-compiler'
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    quaScriptPlugin({
      include: /\.(ts|tsx)$/,
      exclude: /node_modules/
    })
  ]
})
```

### CLI Usage

```bash
# Compile a single file
qua-script scene1.ts

# Specify output file
qua-script -i scene1.ts -o scene1.compiled.ts

# With custom options
qua-script scene1.ts --compiler-options '{"outputFormat":"esm"}'
```

### Programmatic Usage

```typescript
import { QuaScriptTransformer } from '@quajs/script-compiler'

const transformer = new QuaScriptTransformer()
const compiledCode = transformer.transformSource(sourceCode)
```

## Transformation Example

**Input:**

```typescript
import { dialogue } from '@quajs/engine'

function part1() {
  const time = 'minutes ago'
  dialogue(qs`
    @AudioChapter('chapter-1', {
      voiceMap: {
        'chapter-1:1': 'voice/page.wav',
      },
    })
    @PlayVoice('voice/page.wav')
    Jack: I said it.

    John: That's not what we talked about before.

    @SetSprite('xx.png')
    Jack: Yes, but I said it ${time}.
  `)
}
```

**Output:**

```typescript
import { speakWithEngine, spriteWithEngine } from '@quajs/character'
import { configureAudioChapterWithEngine, playVoiceWithEngine } from '@quajs/plugin-audio'

function part1() {
  const time = 'minutes ago'
  dialogue([
    {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      run: async (ctx) => {
        await configureAudioChapterWithEngine(ctx.engine, 'chapter-1', { voiceMap: { 'chapter-1:1': 'voice/page.wav' } })
        await playVoiceWithEngine(ctx.engine, 'voice/page.wav', { lineId: 'chapter-1:1', chapterId: 'chapter-1', characterId: 'Jack' })
        await speakWithEngine(ctx.engine, 'Jack', 'I said it.')
      }
    },
    {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      run: async (ctx) => {
        await speakWithEngine(ctx.engine, 'John', 'That\'s not what we talked about before.')
      }
    },
    {
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      run: async (ctx) => {
        await spriteWithEngine(ctx.engine, 'Jack', 'xx.png')
        await speakWithEngine(ctx.engine, 'Jack', `Yes, but I said it ${time}.`)
      }
    }
  ])
}
```

## Available Decorators

| Decorator | Function | Module |
| --- | --- | --- |
| `@AudioChapter(chapterId, options?)` | `configureAudioChapterWithEngine` | `@quajs/plugin-audio` |
| `@LineId(id)` | `lineIdDirective` | `@quajs/plugin-audio` |
| `@PlayVoice(asset?, options?)` | `playVoiceWithEngine` | `@quajs/plugin-audio` |
| `@PlayBGM(asset, options?)` | `playBGMWithEngine` | `@quajs/plugin-audio` |
| `@SetAudioGain(target, gainDbOrCurve, options?)` | `setAudioGainWithEngine` | `@quajs/plugin-audio` |
| `@SetAudioEq(target, bands, options?)` | `setAudioEqWithEngine` | `@quajs/plugin-audio` |
| `@SetAudioAutomation(target, propertyPath, curve, options?)` | `setAudioAutomationWithEngine` | `@quajs/plugin-audio` |
| `@StopAudio(target?, options?)` | `stopAudioWithEngine` | `@quajs/plugin-audio` |
| `@PauseAudio(target?, options?)` | `pauseAudioWithEngine` | `@quajs/plugin-audio` |
| `@ResumeAudio(target?, options?)` | `resumeAudioWithEngine` | `@quajs/plugin-audio` |
| `@SeekAudio(target?, positionMs, options?)` | `seekAudioWithEngine` | `@quajs/plugin-audio` |
| `@SetSprite(asset, character?)` | `spriteWithEngine` | `@quajs/character` |
| `@ShowCharacter(character, sprite?, expression?, x?, y?, layer?)` | `showWithEngine` | `@quajs/character` |
| `@HideCharacter(character?)` | `hideWithEngine` | `@quajs/character` |
| `@MoveCharacter(character, x?, y?, scale?, rotation?, anchor?)` | `moveWithEngine` | `@quajs/character` |
| `@SetExpression(expression, character?)` | `expressionWithEngine` | `@quajs/character` |

## Configuration

### Compiler Options

```typescript
interface CompilerOptions {
  generateUUID?: boolean // Generate UUIDs for steps (default: true)
  preserveDecorators?: boolean // Keep original decorators (default: false)
  outputFormat?: 'esm' | 'cjs' // Output module format (default: 'esm')
}
```

### Custom Decorator Mappings

```typescript
const customMappings = {
  MyDecorator: {
    function: 'myFunction',
    module: '@my/package',
    transform: args => args.map(arg => arg.toUpperCase())
  }
}

const transformer = new QuaScriptTransformer(customMappings)
```

## API Reference

### Classes

- **QuaScriptParser**: Parses QuaScript DSL into AST
- **QuaScriptTransformer**: Transforms parsed AST to JavaScript code
- **quaScriptPlugin**: Vite plugin for automatic compilation

### Types

- **QuaScriptDialogue**: Dialogue step definition
- **QuaScriptDecorator**: Decorator definition
- **ParsedQuaScript**: Complete parsed script structure
- **CompilerOptions**: Compiler configuration options
- **DecoratorMapping**: Custom decorator mapping configuration
