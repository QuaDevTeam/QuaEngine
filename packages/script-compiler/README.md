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
    @PlaySound('hello.mp3')
    Jack: Hello world!
    
    @UseSprite('john_happy.png')  
    @PlayBGM('background.mp3')
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
// vite.config.ts
import { defineConfig } from 'vite'
import { quaScriptPlugin } from '@quajs/script-compiler'

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
    @RunFunction(functionName, params)
    Jack: I said it.
    
    John: That's not what we talked about before.
    
    @UseCharacterSprite('xx.png')
    Jack: Yes, but I said it ${time}.
  `)
}
```

**Output:**
```typescript
import { dialogue, runFunction } from '@quajs/engine'
import { useCharacterSprite } from '@quajs/character'

const { Jack, John } = useCharacter('Jack', 'John')

function part1() {
  const time = 'minutes ago'
  dialogue([
    {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      run: () => {
        runFunction(functionName, params)
        Jack.speak('I said it.')
      }
    },
    {
      uuid: "550e8400-e29b-41d4-a716-446655440001", 
      run: () => {
        John.speak('That\'s not what we talked about before.')
      }
    },
    {
      uuid: "550e8400-e29b-41d4-a716-446655440002",
      run: () => {
        useCharacterSprite('xx.png')
        Jack.speak(`Yes, but I said it ${time}.`)
      }
    }
  ])
}
```

## Available Decorators

| Decorator | Function | Module |
|-----------|----------|---------|
| `@PlaySound(asset)` | `playSound` | `@quajs/engine` |
| `@PlayBGM(asset)` | `playBGM` | `@quajs/engine` |
| `@Dub(asset)` | `dub` | `@quajs/engine` |
| `@RunFunction(fn, ...args)` | `runFunction` | `@quajs/engine` |
| `@SetVolume(type, value)` | `setVolume` | `@quajs/engine` |
| `@UseSprite(asset)` | `useSprite` | `@quajs/character` |
| `@UseCharacterSprite(asset)` | `useCharacterSprite` | `@quajs/character` |

## Configuration

### Compiler Options

```typescript
interface CompilerOptions {
  generateUUID?: boolean        // Generate UUIDs for steps (default: true)
  preserveDecorators?: boolean  // Keep original decorators (default: false)
  outputFormat?: 'esm' | 'cjs'  // Output module format (default: 'esm')
}
```

### Custom Decorator Mappings

```typescript
const customMappings = {
  'MyDecorator': {
    function: 'myFunction',
    module: '@my/package',
    transform: (args) => args.map(arg => arg.toUpperCase())
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