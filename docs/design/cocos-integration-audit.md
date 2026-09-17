# Cocos integration static audit

This audit covers `cocos-host`, `renderer-cocos`, `assets-cocos`, `store-cocos`,
`security-cocos`, the platform-neutral stage layout used by Cocos, and Quack's
Cocos asset target/project configuration and target isolation fixtures. It runs
without an installed Cocos Creator runtime.

## Corrected defects

| Boundary | Defect and resulting behavior |
| --- | --- |
| Stage layout | The universal resolver varied logical width with container aspect. It now contains the authored fixed ratio, matching Web, while preserving safe-area metadata. Landscape, portrait, letterboxing and pointer conversion are covered. |
| Creator coordinates | Logical Y/rotation and anchor pivots were copied directly into Creator coordinates. The host now converts them into parent-local Y-up coordinates and keeps hit testing in logical space. |
| Native presentation | Sprite and text components could contend for one Creator node; sibling indexes were assigned from large z values. Text/sprites now use distinct presentation children and siblings are sorted by actual order. Native resource references are retained as handles, and slice overrides never mutate shared frames. |
| Input | Numeric Creator keys did not match renderer bindings; touch coordinates had the wrong origin; duplicate touch sources could dispatch twice. Input is normalized once. Release bindings work, letterbox clicks are ignored, hidden ancestors prune hits, and overlays occlude underlying feature controls. |
| Renderer lifecycle | Concurrent async updates could overwrite newer projections, double-create resources, or repopulate a destroyed renderer. Projection tasks coalesce updates, cancel stale work, release unclaimed resources, and share native creation. Startup interrupted by teardown cannot emit ready or recreate nodes. Public setters and layout notifications refresh mounted projections. |
| Audio transport | Unchanged projections repeatedly called native `play()`. The renderer now keeps transient transport status, avoids repeated starts, preserves scheduled starts, and reports fade completion through `audio/ended`. |
| Files and capabilities | Absolute paths and remote URLs were incorrectly prefixed/stripped. File move fallback ignored injected storage. Missing media bridges produced fake native assets or fake audio playback. Paths and move fallback now use the actual bridge; unavailable media throws actionable errors, unsupported visuals warn, and memory-only writes are not advertised as durable storage. |
| Asset cache | The byte directory was never created, concurrent index writes could race, and reads retained full byte arrays in the metadata map. Directory creation, serialized index writes, and metadata-only retention fix these paths. Materialization shares in-flight creation and cleans late completions after clear. |
| Save backend | Snapshot-capture failure left rollback disabled; overlapping transactions silently joined another transaction; orphaned payloads/previews survived clear. Capture always resets transaction state, overlaps/nesting reject explicitly, and clear removes all slot records. Unsupported envelopes reject at decode. |
| Trust policy | Comparing two hashes supplied by a package was treated as sufficient integrity. Static runtime package opt-in now requires an application verifier by default; metadata comparison remains explicitly metadata-only. |

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
what it implements. Resource decoders must return the requested resource ID.

The default Creator node bridge supports basic position/size/opacity, sprite and
text projection, and basic control components. Video, material-based masks,
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

Recorded verification for this change: 138 tests pass across these six packages
(21 host, 68 renderer, 11 assets, 6 store, 5 security, 27 render-core), plus 41
Quack target/project tests. Package type checks, builds and lint pass. The added
regressions include unchanged native audio start counts, fade completion, and a
cancelled pending native audio handle that never starts playback.

No Creator editor, simulator, device, native asset importer, real filesystem,
actual audio playback, visual output, or native GPU behavior is verified here.
Before declaring a Creator target ready, run a project through the active-target
manifest with the concrete bridges, inspect landscape/portrait and parent resize,
exercise touch/keyboard/control changes and overlays, hear playback/end/seek,
restart to validate durable saves, and check resource disposal during scene change
and shutdown. Passing this audit does not establish absence of all bugs.
