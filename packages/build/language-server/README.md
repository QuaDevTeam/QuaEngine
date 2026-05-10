# @quajs/language-server

Language Server Protocol support for QuaScript `.qs` files.

The server reuses `@quajs/script-compiler` document parsing so editor diagnostics and build-time compilation share the same syntax model. The first implementation provides:

- `.qs` structure diagnostics for `<script lang="ts">` and `<script setup lang="ts">`
- virtual TypeScript generation for editor diagnostics
- completions for decorators, `scope`/setup variables, and discovered character names
- hover text for QuaScript decorators and `scope`

Feature-specific completions should be contributed by the owning feature package instead of being hardcoded in the core compiler.
