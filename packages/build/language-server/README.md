# @quajs/language-server

Language Server Protocol support for QuaScript `.qs` files.

The server reuses `@quajs/script-compiler` document parsing so editor diagnostics and build-time compilation share the same syntax model. It provides:

- `.qs` structure diagnostics for `<script lang="ts">` and `<script setup lang="ts">`
- compiler-semantic diagnostics for decorator activation and feature-owned compile-time validation
- source-mapped virtual TypeScript documents for module script, setup script, `${...}`, choice `if`, and decorator args
- TypeScript semantic diagnostics, completions, hover, and go-to-definition through the TypeScript language service
- decorator completions and hover from the same active decorator set used by the compiler
- decorator argument completions from package-local `quajs.language` metadata
- character completions from current-file speakers and `assets/characters/*`
- project/story diagnostics and completions from story declarations, including `@ChapterSelect` metadata used by the story tree

Feature-specific completions should be contributed by the owning feature package instead of being hardcoded in the core compiler.

## Editor Integrations

`@quajs/language-server/editor` exposes reusable editor metadata for non-VS Code hosts:

```ts
import {
  quascriptShikiLanguage,
  registerQuaScriptMonacoLanguage,
} from '@quajs/language-server/editor'
```

Monaco can use the Monarch tokenizer and language configuration directly:

```ts
import { registerQuaScriptMonacoLanguage } from '@quajs/language-server/editor'
import * as monaco from 'monaco-editor'

registerQuaScriptMonacoLanguage(monaco)
```

Shiki can use the TextMate-compatible grammar:

```ts
import { quascriptShikiLanguage } from '@quajs/language-server/editor'
import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  langs: [quascriptShikiLanguage],
  themes: ['github-light'],
})
```

The editor sub-entry intentionally does not depend on Monaco or Shiki. It only publishes QuaScript language ids, file extensions, Monaco language configuration, Monaco Monarch rules, TextMate/Shiki grammar, and shared snippets. Full semantic tooling still comes from the LSP server or helper APIs exported by the root package.

## Plugin Language Contributions

Feature packages can contribute editor behavior through package metadata:

```json
{
  "quajs": {
    "language": {
      "decorators": {
        "SetBackground": {
          "args": [
            {
              "name": "asset",
              "assetRoots": ["assets/images"],
              "assetExtensions": [".png", ".webp"]
            },
            {
              "name": "transition",
              "values": ["instant", "fade", "crossfade"]
            }
          ]
        }
      }
    }
  }
}
```

The language server owns only the generic schema and completion plumbing. Asset directories, static argument values, and character-name hints stay in the package that owns the decorator.

Current feature packages use this path for background assets, story graph/chapter select metadata, inventory item ids/options, audio arguments, gallery/achievement entries, and other package-owned decorator hints.

## Tooling Config

The language server respects QuaScript tooling config from `quascript.config.json`, `qua.config.json#quascript`, `package.json#quascript`, and VS Code `quascript.*` settings. Decorator resolution can be synchronized with build-time compilation through:

```json
{
  "decorators": {
    "autoCollect": false,
    "mappings": {
      "SetBackground": {
        "function": "setBackgroundWithEngine",
        "module": "@quajs/plugin-background"
      }
    }
  }
}
```
