# @quajs/vscode-quascript

VSCode extension package for QuaScript `.qs` files.

It contributes:

- `.qs` language registration
- TextMate grammar for dialogue, choices, decorators, TypeScript script blocks, and `${...}` TypeScript expressions
- QuaScript snippets
- an LSP client wired to `@quajs/language-server`

Standalone `.qs` files are TypeScript-first: use `<script lang="ts">` for imports/types and `<script setup lang="ts">` for factory-local bindings.
