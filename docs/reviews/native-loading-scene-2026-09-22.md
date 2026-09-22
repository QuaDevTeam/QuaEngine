# Native loading scene

The demo now opts into the same loading UI surface on Web and Native. Web-only projects can continue using the existing DOM loading renderer. No narrative scene is entered and no story point is changed by this UI.

Native loads local resources only: the packaged host uses `std::fs::read` for application QPK files, and the development host reads its configured local QPK path. Preparation reads mounted asset bytes, decodes images and uploads them to the GPU; it does not download resources or try a remote fallback. Native reports `loading-local` (Demo: “正在加载本地资源……”); Web alone uses download/cache phases. The shared UI projects each platform's actual preparation state.

## Preparation and presentation

- `AssetLoadingPlugin.prepareRenderer(title, images)` owns the loading/retry state and waits for a matching `asset-loading/renderer-progress` reply. The request contains QPK image references with provenance, not loose image bytes. Up to 12 unique destination images are supported; this is not a catalog preload API.
- Native bootstrap publishes the loading projection and returns to the host. Awaiting GPU preparation inside the synchronous JSC bootstrap would deadlock startup. Demo creates its menu first in engine state, prepares its title image, then reveals that existing complete menu without an intermediate blank view.
- Native projects only the loading surface while it is visible. The Rust host starts one required decode at a time and reports completed GPU images. Explicit required preparations remain protected until adoption even if the advisory cache budget is zero. Optional story hints continue afterward and do not delay title entry.
- Native loading-scene boundaries clear default presence fades. Otherwise the old menu/character snapshot can survive the scene switch, demand the not-yet-ready destination textures and block the loader itself. Exit fades can also overlay stale loading controls on the new menu. Regression tests cover both directions.
- The earlier transparent missing-image fallback and complete-frame presentation gate remain active. A window reveals only after the loader's own fonts/frame are complete; destination presentation still waits for its own required resources. No artificial startup delay is added.
- Web and Native use `createAssetLoadingUiSurfaceFeature` from one demo declaration. Web's pre-framework host uses the common logical stage resolver, input isolation and retry pipeline. Native input is blocked while loading except for retry and renderer status delivery.
- Only player input is blocked. Editor status requests, focus/lifecycle and other renderer replies continue through the pipeline. An early implementation blocked every intent during loading; the real embedding reload test caught the resulting `Qua.editorCommand` timeout. A session regression test now checks status delivery before GPU completion.
- The Rust host advertises `native-wgpu.asset-loading@1`; Runtime QPKs using GPU preparation must require this capability. Target manifests continue to consume the exact emitted host capability set.

## Failure and lifecycle

Decode/missing-asset failures stay on the loading scene and expose Retry. Retrying uses a new request ID; stale or malformed progress cannot complete it. Destroy removes the listener and rejects the pending continuation. Package paths/provenance continue through the existing host validators. Failures before the local runtime is initialized retain the host startup error path.

This loader currently begins after local QPK mounting and JSC initialization. It covers the observed cold image decode/GPU preparation interval; it does not show progress while the synchronous host bootstrap itself is running. Loading UI fonts must already be locally available or fall back to resource-free glyphs. Do not introduce a dependency on the pack being loaded.

## Validation

The dedicated native smoke owns port 4792 and captures the loading scene followed by automatic menu entry. Visible Native acceptance runs must be sequential to avoid focus/occlusion interference.

- Native cold startup smoke: passed, 6 loading captures followed by 3 complete menu captures, no input required; inspected actual WGPU images in `demo/.generated/qa/native-loading`.
- Native navigation: passed first-line entry (830 ms), return (232 ms), resume (789 ms), restart (1124 ms), click-to-load (983 ms), and final return (224 ms). These are one measured run, not a latency guarantee.
- Real Electron/native compositor embedding: passed title/settings, scaled pointer input, modal occlusion, shader completion, fullscreen, popout/redock preserving the session, reload replacing its compositor context, and stop; no page errors. Artifacts: `.codex-tmp/editor-native-embedding/report.json` and OS-window screenshots.
- Rust native app: 314 unit tests and 14 CLI tests passed. WGPU renderer with `real-wgpu-noop,image-decode`: 910 tests passed, including required image pinning with a zero advisory budget and loading presence boundaries.
- TypeScript: asset-loading lifecycle 4 tests, engine-native 118 tests, renderer-web 102 tests, demo 3 tests passed. The demo session regression checks that loading blocks player navigation while answering editor status before GPU completion. Affected package/demo typechecks and builds passed.
- Browser loading smoke: actual production archive failure/retry, throttled cold download, no archive request on cache restart and story entry passed with no page errors; shared-surface screenshots are under `demo/.generated/review/asset-loading`.
- Complete Native demo E2E remains **not passed**: title reached the OS surface, then the `story-main` checkpoint reported `OccludedAfterRetry` after window blur. Offscreen pixels were not accepted as OS presentation. This is a separate remaining full-suite validation limit, not evidence that the loading scene failed.

The embedding gate caught and verified the fix for host-status requests swallowed during startup. The final plugin owns the player-input middleware for both targets, while renderer adapters continue forwarding host/lifecycle messages normally.
