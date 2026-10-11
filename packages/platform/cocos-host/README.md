# @quajs/cocos-host

Platform contracts for Cocos projections, imported resources and persistent files.
Game state and progression remain in QuaEngine; input returns through pipeline
events. `./testing` supplies a recordable fake host.

Generated Creator 3.8.8 workspaces use the concrete `./creator-runtime` entry.
Creator supplies `cc`; QuaEngine packages do not bundle the SDK:

```ts
import { createCreatorPreviewFileBridge } from '@quajs/cocos-host/creator-preview-storage'
import { createCocosCreatorRuntimeHost } from '@quajs/cocos-host/creator-runtime'
import * as cc from 'cc'

const host = createCocosCreatorRuntimeHost({
  cc,
  rootNode: canvasNode,
  namespace: 'dev.example.game',
  native: cc.native,
  projectionEffect: importedEffect,
  previewFiles: cc.sys.isNative
    ? undefined
    : createCreatorPreviewFileBridge({
        indexedDB: globalThis.indexedDB,
        namespace: 'dev.example.game',
      }),
})
```

`projectionEffect` is the Creator-imported effect emitted by Quack from the
`./creator-effect` export. It projects lighting, tone and backdrop blur on actual
sprites. Image frames preserve the original transparent canvas; render textures
use their captured rectangle. Fonts are imported Creator Font assets. Font IDs,
logical asset names and package provenance remain distinct from physical files.

Native files use `native.fileUtils.getWritablePath()` beneath the namespace.
Preview files use a separate IndexedDB database of byte arrays, avoiding the
small quota and JSON expansion of localStorage. The file bridge stores bytes;
QuaEngine store and settings adapters retain ownership of their data. A custom
host may inject its own bridges through `./creator`.

Canvas resize notifications are measured after Creator updates its camera.
The generated standalone web-desktop shell sets `screen.exactFitScreen` before
subsystem initialization so browser resize reaches Creator's screen adapter.
Input is converted from Creator UI coordinates to logical stage coordinates;
letterbox clicks do not advance the story.

The concrete runtime processes audio through the SDK preview player and the
static macOS PCM product described below. Generic AudioSource-only hosts warn
for unsupported optional processing capabilities without becoming game policy. Capture uses an
actual RenderTexture and returns PNG bytes; native and Web GPU row origins are
handled separately. Native JSB receives a minimal cancellation implementation
only when its runtime lacks AbortController.

Validate changes with this package's `test`, `typecheck` and `build`, followed by
renderer-cocos checks and real Creator preview/native execution. Fake host tests
do not establish GPU, physical input or audible output correctness. The demo's
review scripts record the exact tested evidence and remaining coverage.

Concrete Creator box projection preserves rounded borders using an inset rounded stroke instead of rectangular edge strips. QUI select decoration roles map to the optional `CocosHostBoxStyle.shape: "chevron-down"`; unsupported hosts retain plain-box fallback. Fake-host and Creator drawing fixtures verify the metadata and geometry. Visual review includes actual slider thumb and select chevron shapes, in addition to panel bounds.

Opaque QPKs are Creator `.binary` resources imported as generic `cc.Asset`; the runtime accepts ArrayBuffer and typed-array `nativeAsset` while preserving byte offsets. `.bin` is reserved for CCON, and a BufferAsset type filter does not match this generic importer.

Video transport options remain optional. The concrete runtime uses SDK VideoPlayer on supported Creator Web and an injected AVFoundation decoder on macOS. Quack copies the static decoder from the public `./creator-native-products` build entry into the standalone workspace; it does not modify the installed Creator SDK. macOS decoded RGBA frames are bounded to 4096 per dimension / 8M pixels, with at most eight video handles, and uploaded into transient Cocos textures. Missing native decoding retains the authored poster fallback. SDK Web video is below Canvas UI and is outside GPU-only screenshots. Both implementations release native handles/listeners/textures at node teardown. Concrete Creator 3.8.8 audio processing is described below; generic hosts advertise each optional capability separately. A poster, warning or projection field is never evidence of decoding or processing. The demo's `test:cocos:media` checks supported actual device playback and timeline transforms; `test:cocos:media:parity` rejects gaps.

On native JSB, generic assets may expose only `nativeUrl`; the injected `native.fileUtils` reads the Creator-resolved packaged file. This path must be verified in the actual app and covered separately from Web typed-array fixtures.

Concrete processed audio multiplies track, bus and master controls without restarting or unpausing handles and supports gain above unity. Generic AudioSource-only hosts retain the SDK [0,1] volume clamp and declare amplification unsupported.

Generated Creator Web shells enable transparent Canvas before graphics initialization and isolate the game container stacking context. SDK VideoPlayer uses a negative z-index; both are required for visible backgrounds beneath UI. Use HTTP Range for seekable imported video and verify actual browser pixels. Arbitrary video/image layer ordering, video filtering and non-muted video/audio synchronization have not been accepted by the full-screen muted H.264 fixture.

## Creator 3.8.8 audio processing

The concrete runtime uses Creator's existing SDK audio player/context in preview and an injected static AVAudioEngine PCM product on macOS. It supports gain above unity, eight biquad types at track/bus/master scope, seek/loop, pitch-changing playback rate 0.25–4 and device-driven natural endings. Player state is transient; intents remain engine-owned. Generated workspaces copy the public native product and compile it locally without SDK edits or repository links.

macOS bounds: 32 handles, 64 MiB decoded stereo PCM per clip, 256 MiB total, 16 filters per EQ stage; sample interpolation and filter processing run in a source-node callback with preallocated buffers. A short mutex coordinates projection and inspection, so this is not a hard realtime guarantee. Inspection samples the processor output (4096 samples), not OS audio capture. Preview requires the verified Creator 3.8.8 SDK AudioPlayer seam; generic hosts retain optional best-effort capabilities.
