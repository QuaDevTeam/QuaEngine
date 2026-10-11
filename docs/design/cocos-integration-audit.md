# Cocos integration audit

## Creator workspace integration (2026-10-10/11)

Quack now generates a complete, portable Creator 3.8.8 workspace from the demo's business entry and public QuaEngine package artifacts. `cocos-core-resolver` is the sole target injection point; the actual retained module graph and validated target manifest drive the generated scene and startup component. Structured content remains QPK; images use lossless PNG, audio and fonts use Creator importers. Generation validates a temporary directory before replacing a prior generated workspace.

The concrete `@quajs/cocos-host/creator-runtime` bridge implements imported resources, AudioSource playback, native writable storage or an injected preview byte-file database, font registration, clipping, shader-based lighting/filter/blur/blend, and GPU capture. Shared TSX/QSS surfaces are projected through `@quajs/renderer-cocos/qui`; native UI intents remain pipeline events. These capabilities require the concrete bridge and imported projection effect; generic hosts can still warn or no-op for unsupported optional capabilities.

Real Creator runs exposed missing native script class registration, missing JSB AbortController, native render-texture material replacement, Metal readback orientation, font importer naming, fixed-height Canvas input offsets, and an asynchronous click/hide/advance race. Further comparisons exposed image auto-trim stretching transparent character canvases, sprite-frame assignment shrinking a full-stage blur to its texture dimensions, missing character-name dialogue labels, a Web inline sprite baseline gap, preview localStorage quota exhaustion and a percentage-sized desktop subframe that did not emit resize. The native quit action also left the process alive, shared backlog edge intents lacked scroll projection, and overhanging artwork bled into black bars. Native lifecycle input and captured framebuffer checks cover these corrections. This is separate from the historical static-only audit below.

Full native story execution also exposed an unbounded save transaction backup: every overwrite read all slot payloads into memory, exhausting the JSB V8 heap with a 610 MB save directory. The Cocos store now journals only modified files, retaining byte before-images on disk rather than all record contents in memory. Rollback covers overwrite, deletion and newly created records. Native review records heap usage throughout the story and releases debugger object groups.

The independent workspace has also been imported through Dashboard, opened in Creator 3.8.8 with its generated Canvas/Camera scene, and played through the editor's actual preview using mouse and keyboard. A physical zoom/restore test with an open menu also exposed a backdrop capture race during scene rebuild. The concrete bridge waits for a real draw before backdrop readback, and pending projection tasks are cancelled on layout changes. The chapter current marker has an explicit measurement ID and enough shared width for native glyph metrics. Native test input awaits Director frame dispatch: JSB queues input events, so polling before the next frame can retry a key and skip a very short line. Failed full runs retain their observations and can resume from input-created durable choice saves, replaying the remaining story with unchanged artifact hashes.

Use `demo/scripts/cocos-build.mjs` for Creator configPath build and native make (success exit 36). Runtime review commands, independent workspace override, screenshots and coverage are documented in [the demo README](../../demo/README.md#cocos-creator-工作区). Review JSON records failure or passed coverage, rather than treating successful compilation as complete parity. Native input binding tests and GPU captures are separate from OS input proof. A dedicated CUA run exercised actual mouse/Space input and physical window zoom/restore, with black-bar pixel and input checks; see os-input-review.json in the final review directory. The native startup log also records a caught fflate streaming TextDecoder feature probe: JSB accepts one decode argument, and fflate falls back after the probe exception. This diagnostic is preserved separately from uncaught runtime error checks. Subjective audible output remains unverified. The authored story has no audio/video playback or gallery/achievement catalogs. Dedicated generated media fixtures now exercise actual playback/end and timeline transforms; these do not prove gallery/achievement unlock behavior. Real three-target report status is an execution result under `demo/dist/cocos/review`, not a promise made by this audit.

## Historical static audit (2026-09-17)

This audit covers `cocos-host`, `renderer-cocos`, `assets-cocos`, `store-cocos`,
`security-cocos`, the platform-neutral stage layout used by Cocos, and Quack's
Cocos asset target/project configuration and target isolation fixtures. It runs
without an installed Cocos Creator runtime.

## Corrected defects

| Boundary                       | Defect and resulting behavior                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage layout                   | The universal resolver varied logical width with container aspect. It now contains the authored fixed ratio, matching Web, while preserving safe-area metadata. Landscape, portrait, letterboxing and pointer conversion are covered.                                                                                                                                            |
| Creator coordinates            | Logical Y/rotation and anchor pivots were copied directly into Creator coordinates. The host now converts them into parent-local Y-up coordinates and keeps hit testing in logical space.                                                                                                                                                                                        |
| Native presentation            | Sprite and text components could contend for one Creator node; sibling indexes were assigned from large z values. Text/sprites now use distinct presentation children and siblings are sorted by actual order. Native resource references are retained as handles, and slice overrides never mutate shared frames.                                                               |
| Input                          | Numeric Creator keys did not match renderer bindings; touch coordinates had the wrong origin; duplicate touch sources could dispatch twice. Input is normalized once. Release bindings work, letterbox clicks are ignored, hidden ancestors prune hits, and overlays occlude underlying feature controls.                                                                        |
| Renderer lifecycle             | Concurrent async updates could overwrite newer projections, double-create resources, or repopulate a destroyed renderer. Projection tasks coalesce updates, cancel stale work, release unclaimed resources, and share native creation. Startup interrupted by teardown cannot emit ready or recreate nodes. Public setters and layout notifications refresh mounted projections. |
| Audio transport                | Unchanged projections repeatedly called native `play()`. The renderer now keeps transient transport status, avoids repeated starts, preserves scheduled starts, and reports fade completion through `audio/ended`.                                                                                                                                                               |
| Files and capabilities         | Absolute paths and remote URLs were incorrectly prefixed/stripped. File move fallback ignored injected storage. Missing media bridges produced fake native assets or fake audio playback. Paths and move fallback now use the actual bridge; unavailable media throws actionable errors, unsupported visuals warn, and memory-only writes are not advertised as durable storage. |
| Asset cache                    | The byte directory was never created, concurrent index writes could race, and reads retained full byte arrays in the metadata map. Directory creation, serialized index writes, and metadata-only retention fix these paths. Materialization shares in-flight creation and cleans late completions after clear.                                                                  |
| Save backend                   | Snapshot-capture failure left rollback disabled; overlapping transactions silently joined another transaction; orphaned payloads/previews survived clear. Capture always resets transaction state, overlaps/nesting reject explicitly, and clear removes all slot records. Unsupported envelopes reject at decode.                                                               |
| Trust policy                   | Comparing two hashes supplied by a package was treated as sufficient integrity. Static runtime package opt-in now requires an application verifier by default; metadata comparison remains explicitly metadata-only.                                                                                                                                                             |
| Panel refresh and cancellation | Settings and backlog only listened to pipeline view events, missing public setters and safe-area refreshes. Settings skins could complete after the panel closed or renderer was destroyed, writing into dead nodes and retaining resources. Both consume snapshot refreshes; asynchronous settings work uses the cancellable projection task.                                   |
| Settings input                 | Settings-only hit tests ignored higher overlays, allowing clicks to reset/change settings underneath another panel. Settings now use the shared frontmost interactive target lookup.                                                                                                                                                                                             |
| Font replacement               | Loaded font signatures ignored asset replacement and package candidate changes. Registration now includes asset revision and required package candidates.                                                                                                                                                                                                                        |
| Shared native resources        | Creator duplicated concurrent decodes and released shared assets on the first caller's release. The shared Creator/fake resource pool coalesces creation, counts leases, rejects mismatched IDs/kinds, and ignores stale releases.                                                                                                                                               |
| Asynchronous audio disposal    | Replacing/removing tracks and renderer teardown released resources before native stop/dispose finished. Each audio handle now owns a resource lease through disposal; renderer teardown awaits pending disposal.                                                                                                                                                                 |
| Solid color projection         | Creator stored a color on a node without a drawable component, so basic scene fades/effects were invisible. Solid rectangles now use optional `cc.Graphics`, update with logical size/anchor changes, and warn if Graphics is unavailable. Existing sprites receive tint directly.                                                                                               |
| Creator camera visibility      | New nodes retained Creator's default layer instead of the parent Canvas layer, which could make sprites/text invisible to a UI-only camera. Projection nodes and presentation children now inherit their parent render layer.                                                                                                                                                    |

## Host integration requirements

`createCocosCreatorHost` is an adapter with injected platform capabilities. A
`writableRoot` is a path prefix, not a filesystem implementation. Supply complete
read/write/delete/list bridges for durable storage and a native `move` bridge when
atomic replacement is required. The memory fallback is for ephemeral use and
warns on writes. Await store transactions; nested/concurrent transactions are
not supported by this backend.

Supply `resources.createResource` to decode QPK bytes into actual Creator assets,
`resources.loadResource` to load hybrid native assets, and
`audio.createAudioHandle` for native playback. The audio bridge owns native end
notifications and handle disposal; optional seek/rate/EQ capabilities must reflect
what it implements. Resource decoders must return the requested resource ID and
kind. Each successful resource create/load acquires one lease; release it once
when finished. The host coalesces concurrent requests for an ID and balances
optional native retain/release hooks. Without a native retain hook, the host
releases the allocation only after its last owner releases.

Audio resource leases cover native creation as well as stop/dispose. Teardown
awaits disposal of existing handles; an unfinished native creation keeps its
resource until it returns and its cancelled handle is disposed.

The default Creator node bridge supports basic position/size/opacity, sprite and
text projection, solid rectangles when `cc.Graphics` is supplied, and basic
control components. Video, material-based masks,
filters/blend/composition, frame crops, clip rendering, skin interaction states,
and fully styled native controls require a custom node/control implementation.
The bridge retains their projection metadata and warns rather than claiming that
those effects are rendered. Font registration and capture are injected. Product
input bridges can submit value/change metadata through `CocosHostInputEvent` and
the existing pipeline intent handlers; they do not own player settings or story
state.

Cocos defaults to static-only assets and rejects dynamic script/plugin loading.
For an explicitly enabled static runtime package, inject an application-trusted
`verifyIntegrity` implementation that verifies bytes/signatures against trusted
keys/digests. The metadata consistency helper is not such a verifier.

## Verification

Run tests, type checking and builds for:

- `@quajs/cocos-host`
- `@quajs/renderer-cocos`
- `@quajs/assets-cocos`
- `@quajs/store-cocos`
- `@quajs/security-cocos`
- `@quajs/render-core`

Run lint on the changed package files and Quack's `cocos-target`,
`target-plugin-isolation` and `project-config` test suites. Regression tests use
both a fake host and a Creator-shaped node/component fixture. Deferred promises
exercise slow resource completion, cancellation, sharing, and rollback failures.

Recorded verification on 2026-09-17: 156 tests pass across these six packages
(27 host, 80 renderer, 11 assets, 6 store, 5 security, 27 render-core), plus 41
Quack target/project tests. All six package type checks and builds pass; full
host/renderer lint and `git diff --check` pass. This follow-up adds 18 regressions
covering panel cancellation/refresh, overlay occlusion, font replacement, shared
resource leases, native camera layers, solid color drawing, and delayed/failing
audio creation, seeking and disposal. Two animation/audio timing tests now advance
fake timers explicitly instead of relying on a 100 ms wall-clock deadline.

No Creator editor, simulator, device, native asset importer, real filesystem,
actual audio playback, visual output, or native GPU behavior is verified here.
Before declaring a Creator target ready, run a project through the active-target
manifest with the concrete bridges, inspect landscape/portrait and parent resize,
exercise touch/keyboard/control changes and overlays, hear playback/end/seek,
restart to validate durable saves, and check resource disposal during scene change
and shutdown. Passing this audit does not establish absence of all bugs.

Concrete Creator box projection preserves rounded borders using an inset rounded stroke instead of rectangular edge strips. QUI select decoration roles map to the optional `CocosHostBoxStyle.shape: "chevron-down"`; unsupported hosts retain plain-box fallback. Fake-host and Creator drawing fixtures verify the metadata and geometry. Visual review includes actual slider thumb and select chevron shapes, in addition to panel bounds.

## Media review

Run `pnpm --filter demo test:cocos:media` after rebuilding both targets and launching the final native app. `review/audio-final/report.json` records actual four-channel playback clocks, pause/resume/seek/loop, gain, fade/crossfade/end, Web EQ, image timeline transforms and browser/GPU frames. `test:cocos:media:parity` rejects explicit capability gaps. Concrete Creator processing now uses the SDK-owned preview AudioPlayer and a static macOS AVAudioEngine PCM product. The expanded strict review checks actual +6 dB PCM amplification, eight track/bus/master biquads, live/paused/resumed rates and accelerated natural endings. Generic AudioSource-only hosts remain optional and clamp amplification. No subjective listening or OS audio recording is claimed.

Cocos video now uses imported VideoClip resources: SDK VideoPlayer for Creator Web, and a statically compiled public QuaEngine AVFoundation host product for macOS. Mac RGBA frames are uploaded into transient Creator textures, with bounded dimensions/handle count and disposal. The workspace contains the native product, framework configuration and registration; installed Creator sources are unchanged. QPK identities and resource provenance remain intact.

Real captures exposed two failures that decoder clocks missed: an opaque Canvas and SDK negative z-index behind the page background. Generated Web shells enable transparent graphics before startup and isolate the game container stacking context. The review checks real decoded color-bar pixels. HTTP Range support is required for actual seek; the QA artifact server now supplies MIME, length and 206/Content-Range responses. Untagged H.264 also gave different Chromium/AVFoundation colors. Fixtures convert BT.601 procedural input to tagged limited-range BT.709 and compare actual color-bar channels with tolerance 5. Sequential moving-frame screenshots show different times; they are not a same-frame pixel-diff claim.

Numeric image timelines cover easing, logical positions, rotation, opacity, paused seeks, resume and final engine-owned commit. Retained background nodes must resample paused seeks on view changes without restarting video on unrelated audio/dialogue updates. Nine shared UI captures, current artifact checks and native restart results are recorded separately in `review/acceptance.json`; the prior 7032-node full story remains an older artifact baseline. Current audio completion suites passed: host 56, audio plugin 20, renderer-web 107, renderer-cocos 90, Quack 203, script compiler 185, demo UI 5 and build/server 4 tests (670 total). The latest strict media gate has 10 passed checks and zero gaps; it measures actual processor PCM and device clocks, separately from subjective listening.

Scope is full-screen muted SDR H.264 plus numeric image timelines. Arbitrary mixed video/image layer composition, filtered video, non-muted video/audio synchronization, untagged/HDR color interpretation, skeletal/particle playback and gallery/achievement unlock acceptance are not proven. SDK Web video is below Canvas and outside GPU-only captures; macOS frames are in GPU captures. Runtime, visual, persistence and complete parity statuses must remain separate. User-requested old project/previews were closed before media work; validation processes are also closed at handoff.

Creator 3.8.8 CLI 构建使用每次独立的临时工作区导入副本，避免跨平台／重复使用导入数据库时将资源识别成普通文件。demo 构建脚本保留原始生成文件，验证启动场景（原生还要求 make 产出应用）后原子发布 build/<platform>；失败保留上一份可用输出。临时副本和构建锁自动清理。生成 package.json 使用稳定项目 UUID。脚本调用仍为 configPath，SDK 成功码为 36；该退出码本身不构成验收。独立 CLI 手动复现时请为每个平台复制一份原始工作区；Creator 图形编辑器可直接打开生成目录。
