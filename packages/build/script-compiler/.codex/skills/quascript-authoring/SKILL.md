---
name: quascript-authoring
description: Guide for authoring, reviewing, or fixing QuaEngine QuaScript `.qs` files. Use when writing scene scripts, explaining QuaScript syntax, choosing between dialogue lines, choice sugar, `@Choice`, TypeScript script blocks, or package-provided decorators for `.qs` files.
---

# QuaScript Authoring

Use this skill when the task is about standalone QuaScript `.qs` files or the same DSL embedded inside `qs\`...\`` template literals.

## First Files To Read

Read only what you need:

- Package overview: `packages/build/script-compiler/README.md`
- Main authoring rules and examples: `references/authoring.md`
- Package-specific decorator discovery and import rules: `references/decorators.md`
- Script block parsing rules: `packages/build/script-compiler/src/core/document.ts`
- DSL parsing rules: `packages/build/script-compiler/src/core/parser.ts`

## Workflow

1. Confirm whether the user wants a standalone `.qs` file or a `qs\`...\`` block inside TypeScript. The DSL rules are shared, but standalone `.qs` files may also use `<script lang="ts">` and `<script setup lang="ts">`.
2. Start from the smallest valid shape. Prefer one module script block, one setup script block, then the DSL body.
3. Before using a decorator, confirm it exists in the current repo. Use package metadata first, then the owning package's `src/script-compiler.ts` if behavior matters.
4. Use the explicit timeline decorator names in this repo: `@AnimationTimeline` for animation playback and `@StoryTimeline` for story metadata.
5. Prefer simple dialogue lines and choice sugar for straightforward scenes. Switch to canonical `@Choice(...)` when you need helper targets, presentation metadata, disabled states, custom IDs, or richer metadata.
6. Keep decorators directly attached to the next statement. A blank line turns decorators into a separate action step.
7. When authoring positions, movement, background layer offsets, or animation values, use logical stage coordinates, not CSS pixels, `vw`, `vh`, or DOM measurements.
8. When auto-collection is disabled, activate plugin decorators explicitly from the current file:
   - standalone `.qs`: add a value import in `<script lang="ts">`, for example `import { decorators } from '@quajs/plugin-background'`
   - host `qs\`...\`` module: add a top-level value import in the TypeScript file
9. If a decorator is unknown, do not invent syntax or compiler hooks. Either import/register the decorator or rewrite the behavior with normal function imports.
10. Validate with the local tooling when the task changes real `.qs` files:
   - `qua-script lint "path/**/*.qs"`
   - `qua-script format "path/**/*.qs" --check` or `--write`

## Non-Negotiable Rules

- In `.qs` files, `<script>` blocks must use `lang="ts"`.
- A `.qs` file may contain at most one module `<script lang="ts">` block and at most one `<script setup lang="ts">` block.
- Export `interface Scope` or `type Scope` from the module script when the file expects inputs.
- Read caller-provided inputs through `scope`, for example `scope.playerName`.
- Do not invent decorators, helper targets, or argument shapes. Discover them from the owning package first.
- Do not assume plugins can extend QuaScript syntax or inject custom compilers. Plugins may only contribute normal imports and decorator metadata.
- Do not reintroduce deprecated or ambiguous decorator names. Use `@AnimationTimeline` and `@StoryTimeline`, never the old shared `@Timeline`.
- For action-only character decorators such as `@SetSprite`, pass the character explicitly unless the decorator is attached to a dialogue line that already names the speaker.
- Keep renderer concerns out of the script. `.qs` should express engine-owned dialogue, story metadata, choices, and feature-plugin intent, not DOM/UI implementation details.

## References

- Syntax, patterns, and pitfalls: `references/authoring.md`
- Decorator and helper discovery: `references/decorators.md`
