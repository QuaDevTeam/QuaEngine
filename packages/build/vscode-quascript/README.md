# QuaScript VSCode Extension

VSCode extension package for QuaScript `.qs` files.

Marketplace extension id: `quajs.quascript`.

It contributes:

- `.qs` language registration
- TextMate grammar for dialogue, choices, decorators, TypeScript script blocks, and `${...}` TypeScript expressions
- QuaScript snippets
- a bundled LSP client/server for diagnostics, completions, hover, and go-to-definition

Standalone `.qs` files are TypeScript-first: use `<script lang="ts">` for imports/types and `<script setup lang="ts">` for factory-local bindings.

Decorator argument completions are contributed by installed Qua packages through `package.json#quajs.language`, so feature packages own their own asset/value suggestions.

## Packaging

```bash
pnpm --filter quascript vscode:package
```

This builds the extension client and a standalone bundled language server into `server/server.js`, then emits a VSIX under `dist/`.

Publishing to Visual Studio Marketplace uses the same build path:

```bash
pnpm --filter quascript vscode:publish
```
