# QuaScript Compiler

A TypeScript-first DSL compiler for QuaEngine that transforms QuaScript dialogue syntax into executable TypeScript modules and importable standalone `.qs` files.

## Features

- **Simple Dialogue Syntax**: Write natural dialogue using `Character: Text` format
- **Decorator System**: Use `@Decorator()` syntax for actions and effects
- **Decorator Auto-Collection**: Discover plugin decorators from project metadata by default, with an opt-out switch
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

### Decorator Resolution

QuaScript decorator names are resolved in this order:

1. built-in engine decorators
2. explicit `decoratorMappings`
3. decorators activated by value imports in the current file
4. auto-collected plugin decorators discovered from package metadata

Plugins no longer inject custom compiler modules into QuaScript. They may only contribute decorator metadata and runtime functions. If a plugin decorator is neither registered explicitly, imported in the current `.qs`/host module, nor auto-collected, compilation fails with an unknown decorator error.

When you want local, explicit wiring inside a standalone `.qs` file, import any value from the plugin module in `<script lang="ts">`:

```qs
<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground('classroom.png')
Yuki: Ready.
```

To disable project-wide automatic decorator collection, set `decorators.autoCollect: false` in QuaScript tooling config, set `autoCollectDecorators: false` in the Vite/plugin API, or pass `--no-auto-collect-decorators` to the CLI.

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
      autoCollectDecorators: true,
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
qua-script compile scene1.qs

# Specify output file
qua-script -i scene1.ts -o scene1.compiled.ts
qua-script compile scene1.qs --no-auto-collect-decorators

# Generate a TypeScript arbitrary-extension declaration
qua-script scene1.qs --declaration

# Lint and format QuaScript files
qua-script lint "src/**/*.qs"
qua-script lint "src/**/*.qs" --json --max-warnings 0
qua-script lint "src/**/*.qs" --fix
qua-script format "src/**/*.qs" --check
qua-script format "src/**/*.qs" --write
```

`qua-script lint` always runs parser/document and style lint. When `@quajs/language-server` is resolvable from the current project it also runs virtual TypeScript diagnostics and project/story diagnostics. If the language server cannot be loaded, the CLI prints a warning and falls back to parser/style lint only instead of silently omitting project diagnostics.

`qua-script format` is conservative: it preserves `<script lang="ts">` and `<script setup lang="ts">` content byte-for-byte, trims DSL trailing whitespace, collapses excessive blank lines, attaches decorators to their target statement, preserves line-ending policy, and inserts a final newline by default.

QuaScript tooling reads configuration from `quascript.config.json`, `qua.config.json#quascript`, or `package.json#quascript`:

```json
{
  "decorators": {
    "autoCollect": true,
    "mappings": {
      "SetBackground": {
        "function": "setBackgroundWithEngine",
        "module": "@quajs/plugin-background"
      }
    }
  },
  "lint": {
    "rules": {
      "QS_STYLE_TRAILING_WHITESPACE": "error",
      "QS_STYLE_MULTIPLE_BLANK_LINES": "warning",
      "QS_STYLE_DECORATOR_SPACING": "warning",
      "QS_STYLE_FINAL_NEWLINE": "warning"
    }
  },
  "format": {
    "maxBlankLines": 1,
    "insertFinalNewline": true
  },
  "files": {
    "include": ["src/**/*.qs"],
    "exclude": ["node_modules/**", "dist/**", ".git/**", ".qua/**", "coverage/**"]
  }
}
```

`decorators.autoCollect` and `decorators.mappings` are shared by the CLI, Vite compilation, language server, and VS Code extension so editor semantics stay aligned with build-time compilation.

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
| `@PlaySFX(asset, options?)`                                       | `playSFXWithEngine`               | `@quajs/plugin-audio` |
| `@PlayAmbient(asset, options?)`                                   | `playAmbientWithEngine`           | `@quajs/plugin-audio` |
| `@SetAudioGain(target, gainDbOrCurve, options?)`                  | `setAudioGainWithEngine`          | `@quajs/plugin-audio` |
| `@SetAudioEq(target, bands, options?)`                            | `setAudioEqWithEngine`            | `@quajs/plugin-audio` |
| `@SetAudioAutomation(target, propertyPath, curve, options?)`      | `setAudioAutomationWithEngine`    | `@quajs/plugin-audio` |
| `@StopAudio(target?, options?)`                                   | `stopAudioWithEngine`             | `@quajs/plugin-audio` |
| `@StopSFX(options?)`                                              | `stopSFXWithEngine`               | `@quajs/plugin-audio` |
| `@StopAmbient(options?)`                                          | `stopAmbientWithEngine`           | `@quajs/plugin-audio` |
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
