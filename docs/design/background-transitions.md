# Background transitions

`@quajs/plugin-background` replaces an existing background with a 300 ms crossfade by default. Both pictures remain layered: the incoming opacity rises from 0 to its authored opacity while the outgoing opacity falls to 0. Use `transition: { type: 'instant' }` to disable animation. The first background is prepared and shown without a replacement animation.

The engine publishes a preparation token and destination, with the old picture visible. Web pins the package-aware object URLs and decodes the incoming images; the interactive native host decodes, premultiplies, generates mipmaps and uploads on a bounded worker. `background/ready` returns through the pipeline only after preparation. The engine then starts its normal animation timeline. Missing assets, shader errors and preparation timeout reject the API and preserve the old background. Clear, supersession and package eviction cancel stale work. Save/load settles a stored in-flight transition to its engine-owned destination through the background plugin's jump hooks.

## Reusable numeric definitions

```ts
import { defineBackgroundTransition } from '@quajs/plugin-background'

export const drift = defineBackgroundTransition({
  type: 'custom',
  duration: 600,
  easing: 'ease-in-out',
  incoming: {
    opacity: [{ offset: 0, value: 0 }, { offset: 1, value: 1 }],
    x: [{ offset: 0, value: 80 }, { offset: 1, value: 0 }],
    scale: [{ offset: 0, value: 1.04 }, { offset: 1, value: 1 }],
    'composition.filter.blur': [{ offset: 0, value: 6 }, { offset: 1, value: 0 }],
  },
  outgoing: {
    opacity: [{ offset: 0, value: 1 }, { offset: 1, value: 0 }],
  },
})
```

`offset` is normalized time (0–1). Tracks support opacity, x/y, scale, rotation, blur, brightness, contrast, saturate, grayscale, sepia, hueRotate and invert. Rotation/hue are degrees; geometry and blur use logical stage units. Opacity values multiply the picture's authored opacity. Other values are absolute. Per-keyframe easing overrides the definition easing. An omitted side gets the default opacity fade; a supplied side contains only its specified tracks.

## Custom shaders

A definition contains both GLSL ES 3.0 for WebGL 2 and WGSL for native wgpu. This keeps one serializable authoring definition while using each platform's shader language. Each source defines `transition(uv)`; do not include a version declaration, vertex/fragment entry points or binding declarations.

```ts
export const wipe = defineBackgroundTransition({
  type: 'shader',
  duration: 650,
  shader: {
    params: [0.04, 0, 0, 0],
    glsl: `vec4 transition(vec2 uv) {
      float amount = smoothstep(uv.x - params.x, uv.x + params.x, progress);
      return mix(sampleFrom(uv), sampleTo(uv), amount);
    }`,
    wgsl: `fn transition(uv: vec2<f32>) -> vec4<f32> {
      let amount = smoothstep(uv.x - params.x, uv.x + params.x, progress);
      return mix(sampleFrom(uv), sampleTo(uv), amount);
    }`,
  },
})
```

Both languages expose `sampleFrom(uv)`, `sampleTo(uv)`, `progress` and `params` (four finite floats). UVs are normalized to the logical stage with a top-left origin. Samples and returned colors are premultiplied RGBA. The source can displace UVs, implement noise/dissolve, page deformation or any other fragment calculation. Make the endpoints return the outgoing/incoming image respectively. Shader definitions and numeric tracks are alternative transition modes; a shader owns its per-pixel transforms.

Web requires WebGL 2 for shaders; unsupported contexts and compilation errors reject preparation instead of silently substituting another effect. It polls asynchronous compilation when `KHR_parallel_shader_compile` is available; drivers without that extension may block during shader compilation. Default fades and numeric transitions use the regular renderer and do not need WebGL. Native shader compilation runs off the interactive frame thread and caches one completed definition; offscreen/fixed-frame audits prepare synchronously. The native subtree compositor supplies the composed incoming and outgoing pictures, keeping the rest of the scene outside the shader. Web renders the prepared background layers into its input textures. Existing native video decoder capabilities are unchanged.

The Web shader input compositor currently uses centered layer origins and stretched alpha masks. Advanced mask positioning/repetition/luminance, source-alpha drop shadows and layered-root transforms do not yet have complete shader-input parity. Default fades and numeric transitions continue through the regular projection path; validate advanced compositions separately before adopting shader mode.

## QuaScript

Keep reusable code in a TypeScript module and import it in a script block:

```qs
<script setup lang="ts">
import { drift, wipe } from './background-transitions'
</script>

@SetBackground('backgrounds/room.webp', { transition: drift })
Narrator: The room comes into focus.

@SetBackground('backgrounds/street.webp', {
  transition: { ...wipe, duration: 800, shader: { ...wipe.shader, params: [0.08, 0, 0, 0] } }
})
Narrator: A line of light moves across the street.
```

`@BackgroundTransition(definition)` applies a custom definition to the current picture. The positional visibility form (`'fade-in'`/`'fade-out'`, duration, easing) remains available. No grammar extension or renderer-side game mutation is involved.

Definitions in dynamic content ship in the trusted QPK script module. Asset references retain their package provenance; the temporary projection guards dependencies from both backgrounds until completion. Do not load loose shader files or introduce a separate renderer event bus.

## Validation

Run background, animation, render-core, Web/Vue and native bridge tests and typechecks. Native coverage includes queued image cancellation, shader compilation failure and background composition. `node scripts/native-render-audit/background-transitions.mjs` checks real Chrome WebGL pixels, delayed asset preparation and rollback through the Web plugin, then native GPU captures at three progress values. The native binary must be built with `native-window,native-audio-rodio,javascriptcore`; `--web-only` skips native captures. GPU readback evidence is separate from OS-visible window acceptance and broad frame-time measurements.
