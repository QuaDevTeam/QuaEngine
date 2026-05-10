# QuaScript Compiler

A TypeScript-first DSL compiler for QuaEngine that transforms QuaScript dialogue syntax into executable TypeScript modules and importable standalone `.qs` files.

## Features

- **Simple Dialogue Syntax**: Write natural dialogue using `Character: Text` format
- **Decorator System**: Use `@Decorator()` syntax for actions and effects
- **Template Literals**: Full TypeScript template string support with `${expression}`
- **Standalone Modules**: Compile `.qs` files into importable script factories
- **Typed `.qs` Files**: Use `<script lang="ts">`, `<script setup lang="ts">`, and typed `Scope`
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

### Standalone `.qs` Files

```qs
<script lang="ts">
import { formatName } from './logic.ts'

export interface Scope {
  playerName: string
}
</script>

<script setup lang="ts">
const displayName = formatName(scope.playerName)
</script>

@PlayVoice('voice/hello')
Jack: Hello ${displayName}!
```

```typescript
import { dialogue } from '@quajs/engine'
import intro from './intro.qs'

dialogue(intro)
dialogue(intro, { playerName: 'Hero' })
```

Standalone `.qs` compilation targets TypeScript, not JavaScript. The generated factory is typed as `GameStep[]`; if the module script exports `interface Scope` or `type Scope`, that type is used for the `scope` parameter. QuaScript expressions are normal TypeScript expressions, so standalone files should reference scope values explicitly, for example `scope.playerName`.

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
      include: /\.(qs|ts|tsx|js|jsx)$/,
      exclude: /node_modules/
    })
  ]
})
```

### CLI Usage

```bash
# Compile a single file
qua-script scene1.ts
qua-script scene1.qs # writes scene1.compiled.ts

# Specify output file
qua-script -i scene1.ts -o scene1.compiled.ts

# Generate a TypeScript arbitrary-extension declaration
qua-script scene1.qs --declaration
```

### Programmatic Usage

```typescript
import { QuaScriptTransformer } from '@quajs/script-compiler'

const transformer = new QuaScriptTransformer()
const compiledCode = transformer.transformSource(sourceCode)
```

For standalone `.qs` source, use `compileQuaScriptModuleToTs(source)` or `transformer.transformModuleSource(source)`.

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

| Decorator                                                         | Function                          | Module                |
| ----------------------------------------------------------------- | --------------------------------- | --------------------- |
| `@AudioChapter(chapterId, options?)`                              | `configureAudioChapterWithEngine` | `@quajs/plugin-audio` |
| `@LineId(id)`                                                     | `lineIdDirective`                 | `@quajs/plugin-audio` |
| `@PlayVoice(asset?, options?)`                                    | `playVoiceWithEngine`             | `@quajs/plugin-audio` |
| `@PlayBGM(asset, options?)`                                       | `playBGMWithEngine`               | `@quajs/plugin-audio` |
| `@SetAudioGain(target, gainDbOrCurve, options?)`                  | `setAudioGainWithEngine`          | `@quajs/plugin-audio` |
| `@SetAudioEq(target, bands, options?)`                            | `setAudioEqWithEngine`            | `@quajs/plugin-audio` |
| `@SetAudioAutomation(target, propertyPath, curve, options?)`      | `setAudioAutomationWithEngine`    | `@quajs/plugin-audio` |
| `@StopAudio(target?, options?)`                                   | `stopAudioWithEngine`             | `@quajs/plugin-audio` |
| `@PauseAudio(target?, options?)`                                  | `pauseAudioWithEngine`            | `@quajs/plugin-audio` |
| `@ResumeAudio(target?, options?)`                                 | `resumeAudioWithEngine`           | `@quajs/plugin-audio` |
| `@SeekAudio(target?, positionMs, options?)`                       | `seekAudioWithEngine`             | `@quajs/plugin-audio` |
| `@SetSprite(asset, character?)`                                   | `spriteWithEngine`                | `@quajs/character`    |
| `@ShowCharacter(character, sprite?, expression?, x?, y?, layer?)` | `showWithEngine`                  | `@quajs/character`    |
| `@HideCharacter(character?)`                                      | `hideWithEngine`                  | `@quajs/character`    |
| `@MoveCharacter(character, x?, y?, scale?, rotation?, anchor?)`   | `moveWithEngine`                  | `@quajs/character`    |
| `@SetExpression(expression, character?)`                          | `expressionWithEngine`            | `@quajs/character`    |

## Configuration

### Custom Decorator Mappings

```typescript
const customMappings = {
  MyDecorator: {
    function: 'myFunction',
    module: '@my/package'
  }
}

const transformer = new QuaScriptTransformer(customMappings)
```

## API Reference

### Classes

- **QuaScriptParser**: Parses QuaScript DSL into AST
- **QuaScriptTransformer**: Transforms parsed AST to host code and standalone `.qs` TypeScript modules
- **quaScriptPlugin**: Vite plugin for automatic compilation

### Types

- **QuaScriptDialogue**: Dialogue step definition
- **QuaScriptDecorator**: Decorator definition
- **ParsedQuaScript**: Complete parsed script structure
- **DecoratorMapping**: Custom decorator mapping configuration
