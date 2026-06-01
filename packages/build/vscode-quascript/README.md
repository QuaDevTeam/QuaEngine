# QuaScript VSCode Extension

VSCode extension package for QuaScript `.qs` files.

Marketplace extension id: `quajs.quascript`.

It contributes:

- `.qs` language registration
- TextMate grammar for dialogue, choices, decorators, TypeScript script blocks, and `${...}` TypeScript expressions
- QuaScript snippets
- a bundled LSP client/server for lint diagnostics, formatting, completions, hover, go-to-definition, and quick fixes
- story tree and graph inspection, including chapter-selectable nodes marked from `@ChapterSelect`
- QPK/runtime package exploration

Standalone `.qs` files are TypeScript-first: use `<script lang="ts">` for imports/types and `<script setup lang="ts">` for factory-local bindings.

Decorator argument completions are contributed by installed Qua packages through `package.json#quajs.language`, so feature packages own their own asset/value suggestions.

Current package-owned decorator metadata includes story graph, chapter select, background, animation, audio, backlog, gallery, achievement, inventory, character, and character animation decorators when those packages are installed or explicitly mapped.

## Lint And Format

Diagnostics shown in the Problems panel are QuaScript lint results. They include parser/document diagnostics, virtual TypeScript diagnostics, story/project diagnostics, and style diagnostics. Each diagnostic exposes a stable `code` and `source`, such as `QS_STYLE_TRAILING_WHITESPACE` from `quascript/style` or `TS_2339` from `quascript/typescript`.

The language server also provides Format Document. To format on save:

```json
{
  "[quascript]": {
    "editor.formatOnSave": true
  }
}
```

The formatter is intentionally conservative: it preserves `<script lang="ts">` and `<script setup lang="ts">` content byte-for-byte, trims DSL trailing whitespace, collapses excessive blank lines, keeps decorators attached to their target statement, and preserves choice/decorator arguments and TypeScript expressions.

Quick fixes are available for safe style issues:

- remove trailing whitespace
- collapse extra blank lines
- attach decorators to their target statement
- insert final newline

Use `QuaScript: Fix All Auto-fixable Problems` to run `source.fixAll.quascript` for the active document. Use `QuaScript: Restart Language Server` after changing local workspace dependency builds.

## CLI And CI

The `qua-script` CLI from `@quajs/script-compiler` supports lint and format commands:

```bash
qua-script lint "src/**/*.qs"
qua-script lint "src/**/*.qs" --json --max-warnings 0
qua-script lint "src/**/*.qs" --fix
qua-script format "src/**/*.qs" --check
qua-script format "src/**/*.qs" --write
```

Compile files with the explicit command form: `qua-script compile scene.qs`.

## Configuration

QuaScript tooling reads config from the first matching source:

1. `quascript.config.json`
2. `qua.config.json` under the `quascript` key
3. `package.json` under the `quascript` key

Example:

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

The same settings are available in VS Code under `quascript.decorators.*`, `quascript.lint.*`, `quascript.format.*`, and `quascript.files.*`.

## Packaging

```bash
pnpm --filter quascript vscode:package
```

This builds the extension client and a standalone bundled language server into `server/server.js`, then emits a VSIX under `dist/`.

Publishing to Visual Studio Marketplace uses the same build path:

```bash
pnpm --filter quascript vscode:publish
```
