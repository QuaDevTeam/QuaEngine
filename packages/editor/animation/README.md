# QuaEngine Animation Editor

Built-in **动画** bottom panel for QuaEngine Editor. Drag the workbench panel divider upward for a larger preview. The package is editor tooling under MPL-2.0; animations authored with it are not covered by the editor's license.

1. Open or switch to an indexed `*.animation.json` source tab to reveal **动画** and load that timeline automatically. You can also select **动画** and choose **新建动画** or a file manually. Unapplied visual edits are retained until you explicitly discard them to switch.
2. Choose **预览上下文**: **自动关联** finds literal `@PlayAnimation` calls for the animation ID and loads that scene with the project’s Web renderer, assets, background, characters and dialogue. Multiple call sites are selectable. **显示对话框** toggles dialogue visibility; **self 角色** chooses the animated scene character. Without a binding, choose an indexed character or use **场景预览** to select a script and waiting step.
3. Add tracks for `self` or `character:<id>`. Edit logical stage X/Y, uniform scale, rotation (degrees), and opacity. Select a project image for each preview subject; image choices are editor-local.
4. Scrub the ruler or playback slider, add keyframes, and edit their time, value and easing. Double-click an empty track to insert a sampled keyframe. Drag diamonds with 10 ms snapping; arrow keys move by 10 ms and Shift+arrow by 100 ms. The numeric field allows exact timing. Duplicate times are rejected.
5. Preview playback with delay, speed, loop count, direction and fill. Scrubbing shows authored time independent of playback settings. Character/image preview uses an isolated `@quajs/pipeline` and Web DOM renderer/character plugin. Scene preview reuses the project’s Web session and layout; scrubbing sends a temporary paused animation through the engine’s development preview pipeline. Both use shared render-core interpolation in logical stage coordinates.
6. **应用到源文件** creates an undoable Monaco draft. Save normally with Ctrl/Cmd+S. New paths must end in `.animation.json`, use existing project directories, and never overwrite existing files. Disk revision/dirty-buffer conflicts keep the animation draft. Local visual undo/redo is separate from the source editor's undo stack.

The current visual draft is recovered per project from editor-local storage. Switching animations with unapplied changes requires an explicit discard action. Source files remain the authoring truth. Review and save the source draft before switching projects. Hidden panels stop playback and release renderer/image resources. Scene preview returns to the normal preview pane and removes its temporary animation, restoring dialogue at the same story point. Opening a scene saves source buffers through the normal save path; unapplied visual animation drafts remain local.

Scene preview requires a project wired to `createEditorPreviewRuntime` from `@quajs/editor-core/runtime` (as in Demo). It seeks through registered script factories and stops at unresolved choices. Automatic association currently recognizes static QuaScript calls matching a unique JSON animation ID; dynamic calls and TypeScript calls require manual scene selection. It never guesses a choice branch.

Files contain ordinary `AnimationTimeline` JSON, without an editor wrapper:

```ts
import type { AnimationTimeline } from '@quajs/plugin-animation'
import motion from './enter.animation.json'

// After installing AnimationPlugin in the game's engine:
await animation.registerAnimation(motion as AnimationTimeline)
await animation.playAnimation(motion.id, {
  bindings: { self: 'character:heroine' },
})
```

New files default to `commit: 'none'` and `fill: 'both'`. Use `commit: 'final'` when the game's target adapter should retain final character state. This editor does not register animations automatically or alter game bootstrap. Dynamic runtime delivery still goes through Quack QPK Runtime Packages and engine activation.

The first version edits numeric character tracks with absolute millisecond keyframes. Unsupported targets/properties, percentage times, unknown fields and unsupported interpolation are reported without rewriting the source. Existing TypeScript/QuaScript animation definitions, background/audio/sprite-layer tracks, skeletal animation and dragging objects directly on the stage remain outside this panel's current scope. Open those sources normally.

Validation:

```sh
pnpm --filter @quajs/editor-animation test
pnpm --filter @quajs/editor-animation typecheck
pnpm --filter @quajs/editor-animation build
node packages/editor/electron/scripts/animation-plugin-smoke.mjs
node packages/editor/electron/scripts/animation-scene-smoke.mjs
```

The Electron smoke uses temporary projects, actual Web stage rendering, image decoding, pointer keyframe movement, tracks, undo/redo, source creation/save and hidden/project lifecycle. Screenshots: `.codex-tmp/editor-animation-plugin-smoke/`. The scene smoke copies Demo into a temporary standalone project, reuses installed workspace builds and checks real background/sprite/dialogue rendering, automatic association, scene keyframe changes, manual selection and restoration. Scene screenshots: `.codex-tmp/editor-animation-scene-smoke/`. Neither smoke validates native rendering or dependency installation.
