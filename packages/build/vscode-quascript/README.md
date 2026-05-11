# @quajs/vscode-quascript

VSCode extension package for QuaScript `.qs` files.

It contributes:

- `.qs` language registration
- TextMate grammar for dialogue, choices, decorators, TypeScript script blocks, and `${...}` TypeScript expressions
- QuaScript snippets
- an LSP client wired to `@quajs/language-server` for diagnostics, completions, hover, and go-to-definition

Standalone `.qs` files are TypeScript-first: use `<script lang="ts">` for imports/types and `<script setup lang="ts">` for factory-local bindings.

Decorator argument completions are contributed by installed Qua packages through `package.json#quajs.language`, so feature packages own their own asset/value suggestions.
