# Mobile Rendering Adaptation

This document defines the project-wide rules for mobile and cross-device stage adaptation.

## Ownership

- `QuaViewProjection.layout` is engine-owned state and carries the orientation, base logical dimensions, preferred reference aspect ratio, supported aspect interval, and scale mode.
- Renderers resolve the active viewport, scale, DPR, safe area, and coordinate conversion from `layout` plus their transient container size and browser environment.
- Resolved viewport size, scale, DPR, DOM measurements, safe areas, CSS env insets, and pointer positions are renderer projection details. They must not be written back to engine/store state.
- Shared Web layout math and coordinate conversion live in `@quajs/renderer-web`; framework renderers reuse those helpers.

## Default Presets

| preset | reference | supported interval | authoring rule |
| --- | --- | --- | --- |
| `landscape` | `1920x1080` at `16:9` | `16:10` to `16:9` | Keep important UI and default staging inside the `16:10` safe area; let backgrounds/effects bleed wider. |
| `portrait` | `1080x2340` at `9:19.5` | `9:21` to `9:16` | Treat mobile phones as the default portrait target; keep important UI inside the narrow `9:21` safe area and fill wider phones with bleed art. |

Common mobile devices whose container ratio falls inside `9:21` to `9:16` should fill the available container without black bars. Devices outside the interval are centered with letterboxing or pillarboxing rather than changing authored coordinates.

## Layout Resolution

Given a container of `containerWidth x containerHeight`:

```ts
activeAspect = clamp(containerWidth / containerHeight, layout.minAspectRatio, layout.maxAspectRatio)
viewport = fitAspectRatio(containerWidth, containerHeight, activeAspect)
scale = viewport.height / layout.height
logicalHeight = layout.height
logicalWidth = viewport.width / scale
safeWidth = min(logicalWidth, layout.height * layout.minAspectRatio)
aspectSafeArea = {
  x: (logicalWidth - safeWidth) / 2,
  y: 0,
  width: safeWidth,
  height: logicalHeight,
}
```

`layout.aspectRatio` is the reference ratio, not a fixed target. `ResolvedStageLayout.aspectRatio` is the active ratio for the current container.

## Device Safe Area And DPR

The stage safe area has two inputs:

- aspect safe area: the minimum supported aspect width centered inside the active logical stage;
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

This means mobile backgrounds can fill the full active stage, while primary readable/interactable content defaults to the safe area. CSS `env(safe-area-inset-*)` is still read only by renderer helpers; game projection code should consume the resolved logical safe-area variables or plane structure instead of reading device CSS directly.

## Coordinate Space

The logical stage coordinate system is the only default game-facing coordinate system:

- Origin is the top-left of `.qua-stage`.
- Positive `x` goes right; positive `y` goes down.
- `layout.height` is the base logical height.
- Active logical width is resolved from the active aspect ratio.
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

| container | preset | active ratio | viewport | logical stage | scale | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `1600x1000` | landscape | `16:10` | `1600x1000` | `1728x1080` | `0.9259` | Fills a 16:10 tablet/desktop container. |
| `2560x1080` | landscape | `16:9` | `1920x1080`, centered at `x=320` | `1920x1080` | `1` | Ultrawide is outside the supported interval, so side bars are expected. |
| `360x780` | portrait | `9:19.5` | `360x780` | `1080x2340` | `0.3333` | Common phone reference fills the container. |
| `360x840` | portrait | `9:21` | `360x840` | `1002.857x2340` | `0.3590` | Tall phone endpoint fills the container. |
| `375x667` | portrait | about `9:16` | `375x667` | about `1316x2340` | `0.2850` | Shorter phone endpoint still fills the container. |
| `360x780`, DPR `3`, CSS safe top/bottom `30/15` | portrait | `9:19.5` | `360x780` | `1080x2340` | `0.3333`, physical scale `1` | Final safe area is aspect safe area intersected with logical top/bottom insets `90/45`. |

## Package Rules

- `@quajs/render-core` owns the universal layout projection contract and event payload units.
- `@quajs/engine` owns the selected layout projection and must not depend on Web APIs or measured screen size.
- `@quajs/plugin-*` packages must treat numeric position/size/animation values as logical stage pixels unless their API explicitly names another unit.
- `@quajs/script-compiler` should lower script coordinates into the same logical units and should not infer CSS/device pixels.
- `@quajs/renderer-web` owns shared Web layout resolving, safe-area math, coordinate conversion, DOM projection, and CSS variable output.
- `@quajs/renderer-vue` and future framework renderers reuse `@quajs/renderer-web` helpers and expose readonly projections plus intent actions only.

## Test Requirements

Coordinate-sensitive features should cover:

- landscape `16:10` and `16:9` endpoints;
- at least one portrait phone reference such as `360x780`;
- at least one CSS safe-area/DPR case;
- pointer or hit-test conversion when a feature emits coordinates;
- safe-area behavior when important UI is expected to remain stable across the supported interval.
