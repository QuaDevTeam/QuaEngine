# Mobile Rendering Adaptation

This document defines the project-wide rules for mobile and cross-device stage adaptation.

## Ownership

- `QuaViewProjection.layout` is engine-owned state and carries the orientation, base logical dimensions, fixed scene aspect ratio, content safe-area bounds, and scale mode.
- Renderers resolve the active viewport, scale, DPR, safe area, and coordinate conversion from `layout` plus their transient container size and browser environment.
- Resolved viewport size, scale, DPR, DOM measurements, safe areas, CSS env insets, and pointer positions are renderer projection details. They must not be written back to engine/store state.
- Shared Web layout math and coordinate conversion live in `@quajs/renderer-web`; framework renderers reuse those helpers.

## Default Presets

| preset | fixed logical scene | content safe area | authoring rule |
| --- | --- | --- | --- |
| `landscape` | `1920x1080` at `16:9` | centered `16:10` width | Keep important UI and default staging inside the safe area; full-stage backgrounds/effects may use the complete scene. |
| `portrait` | `1080x2340` at `9:19.5` | centered `9:21` width | Treat mobile phones as the default portrait target and keep important UI inside the narrow safe area. |

The scene is always contained inside the measured renderer parent. Any unmatched container space is centered and rendered as black letterboxing or pillarboxing rather than changing authored coordinates or cropping content.

## Layout Resolution

Given a container of `containerWidth x containerHeight`:

```ts
sceneAspect = layout.aspectRatio
logicalHeight = layout.height
logicalWidth = logicalHeight * sceneAspect
viewport = fitAspectRatio(containerWidth, containerHeight, sceneAspect)
scale = viewport.height / layout.height
safeWidth = min(logicalWidth, layout.height * layout.minAspectRatio)
aspectSafeArea = {
  x: (logicalWidth - safeWidth) / 2,
  y: 0,
  width: safeWidth,
  height: logicalHeight,
}
```

`layout.aspectRatio` is the fixed scene ratio. `ResolvedStageLayout.aspectRatio` therefore remains stable while `viewportWidth`, `viewportHeight`, `viewportX`, `viewportY`, and `scale` change with the renderer parent.

## Device Safe Area And DPR

The stage safe area has two inputs:

- aspect safe area: the configured content-safe width centered inside the fixed logical stage;
- device safe area: CSS `env(safe-area-inset-*)` values converted from CSS pixels to logical stage pixels after viewport fitting.

The final `ResolvedStageLayout.safeArea` is the intersection of those two rectangles. If letterboxing or pillarboxing absorbs a CSS safe-area inset, that inset does not reduce the logical stage safe area.
When Web renderers read CSS safe-area values from an element, the values are normalized to that renderer container before layout resolution. A renderer embedded fully inside the device safe rectangle therefore receives zero device insets, while a fullscreen renderer receives the normal viewport insets.

Device safe-area conversion:

```ts
effectiveLeftCss = max(0, cssSafeArea.left - viewportX)
effectiveRightCss = max(0, cssSafeArea.right - (containerWidth - viewportX - viewportWidth))
effectiveTopCss = max(0, cssSafeArea.top - viewportY)
effectiveBottomCss = max(0, cssSafeArea.bottom - (containerHeight - viewportY - viewportHeight))

logicalInsets = {
  left: effectiveLeftCss / scale,
  right: effectiveRightCss / scale,
  top: effectiveTopCss / scale,
  bottom: effectiveBottomCss / scale,
}
```

DPR does not change DOM layout because DOM projection uses CSS pixels. Renderers expose `devicePixelRatio`, `physicalScale`, and physical viewport dimensions for Canvas/WebGL/video processing and screenshot pipelines that need physical pixels.

Mobile browser chrome, soft keyboards, rotation, and display zoom can change the effective viewport without changing game state. Web renderers must subscribe to the shared `observeStageViewportEnvironment()` helper in addition to `ResizeObserver`; it listens to `window.resize`, `orientationchange`, and `visualViewport.resize/scroll`, then re-runs the same layout resolution path.

Use these CSS variables for UI layout and custom renderers:

- `--qua-layout-safe-x`, `--qua-layout-safe-y`, `--qua-layout-safe-width`, `--qua-layout-safe-height`: final logical safe rectangle.
- `--qua-layout-safe-center-x`, `--qua-layout-safe-center-y` and their `*-px` variants: safe-area center points for default subject staging.
- `--qua-layout-safe-inset-top/right/bottom/left`: effective device safe-area insets in logical stage pixels.
- `--qua-layout-css-safe-inset-top/right/bottom/left`: raw CSS safe-area insets in CSS pixels.
- `--qua-layout-device-pixel-ratio` and `--qua-layout-physical-scale`: physical-pixel metadata.

## Stage Planes

Official Web renderers split the scaled logical stage into stable projection planes:

- `.qua-stage-scene`: full logical stage, affected by stage/camera motion and stage opacity.
- `.qua-stage-scene-content`: full-stage scene content inside `.qua-stage-scene`; backgrounds and bleed art render here.
- `.qua-stage-subject`: full-stage foreground subject content inside `.qua-stage-scene`; default character staging uses the resolved safe-area center, while explicit character `x/y` remain logical stage coordinates and explicit percent fields remain percent-based authoring values.
- `.qua-stage-plane`: full logical stage, not affected by camera motion; use for screen effects, scene transitions, and implementation nodes that must cover the viewport.
- `.qua-stage-safe`: positioned to `ResolvedStageLayout.safeArea`; dialogue, choices, menus, backlog, and important UI render here by default.

This means backgrounds can fill the full fixed stage, while primary readable/interactable content defaults to the safe area. CSS `env(safe-area-inset-*)` is still read only by renderer helpers; game projection code should consume the resolved logical safe-area variables or plane structure instead of reading device CSS directly.

## Coordinate Space

The logical stage coordinate system is the only default game-facing coordinate system:

- Origin is the top-left of `.qua-stage`.
- Positive `x` goes right; positive `y` goes down.
- `layout.height` is the base logical height.
- Logical width is resolved from the fixed `layout.aspectRatio`.
- Numeric background, character, effect, camera, and animation position values are logical stage pixels unless the API explicitly names another unit.
- CSS pixels, device pixels, `clientX/clientY`, `vw/vh`, and DOM rectangles are renderer-local values and must be converted at the renderer boundary before entering pipeline payloads or engine-owned projections.

Client-to-logical conversion:

```ts
containerX = clientX - containerRect.left
containerY = clientY - containerRect.top
viewportX = containerX - resolved.viewportX
viewportY = containerY - resolved.viewportY
logicalX = viewportX / resolved.scale
logicalY = viewportY / resolved.scale
```

Logical-to-client conversion:

```ts
clientX = containerRect.left + resolved.viewportX + logicalX * resolved.scale
clientY = containerRect.top + resolved.viewportY + logicalY * resolved.scale
```

Use `clientPointToStageLogical()` and `stageLogicalToClientPoint()` from `@quajs/renderer-web` for Web renderers and renderer plugins.

## Device Examples

| container | preset | fixed ratio | viewport | logical stage | scale | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `1600x1000` | landscape | `16:9` | `1600x900`, centered at `y=50` | `1920x1080` | `0.8333` | Complete scene with horizontal black bars. |
| `2560x1080` | landscape | `16:9` | `1920x1080`, centered at `x=320` | `1920x1080` | `1` | Ultrawide container uses side bars. |
| `360x780` | portrait | `9:19.5` | `360x780` | `1080x2340` | `0.3333` | Common phone reference fills the container. |
| `360x840` | portrait | `9:19.5` | `360x780`, centered at `y=30` | `1080x2340` | `0.3333` | Tall phone uses horizontal black bars. |
| `375x667` | portrait | `9:19.5` | about `307.85x667`, centered at `x=33.58` | `1080x2340` | `0.2850` | Shorter phone uses side bars without cropping. |
| `360x780`, DPR `3`, CSS safe top/bottom `30/15` | portrait | `9:19.5` | `360x780` | `1080x2340` | `0.3333`, physical scale `1` | Final safe area is aspect safe area intersected with logical top/bottom insets `90/45`. |

## Package Rules

- `@quajs/render-core` owns the universal layout projection contract and event payload units.
- `@quajs/engine` owns the selected layout projection and must not depend on Web APIs or measured screen size.
- `@quajs/plugin-*` packages must treat numeric position/size/animation values as logical stage pixels unless their API explicitly names another unit.
- `@quajs/script-compiler` should lower script coordinates into the same logical units and should not infer CSS/device pixels.
- `@quajs/renderer-web` owns shared Web layout resolving, safe-area math, coordinate conversion, DOM projection, and CSS variable output.
- `@quajs/renderer-vue`, `@quajs/renderer-react`, and `@quajs/renderer-svelte` reuse `@quajs/renderer-web` helpers and expose readonly projections plus intent actions only.

## Test Requirements

Coordinate-sensitive features should cover:

- fixed landscape and portrait scene ratios;
- horizontal and vertical letterboxing cases;
- a resize caused only by the renderer parent, without changing the browser viewport;
- at least one portrait phone reference such as `360x780`;
- at least one CSS safe-area/DPR case;
- a mobile viewport environment change when renderer layout depends on the container size;
- pointer or hit-test conversion when a feature emits coordinates;
- safe-area behavior when important UI is expected to remain stable across devices.
