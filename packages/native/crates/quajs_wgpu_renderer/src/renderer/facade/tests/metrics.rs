use serde_json::{json, Value};

use crate::audio::NullNativeAudioBackend;
use crate::renderer::NativeRenderer;
use crate::resources::NativeResourceKind;

use super::RecordingBackend;

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

#[test]
fn renderer_metrics_reports_facade_frame_declarative_and_audio_state() {
    let mut frame: Value =
        serde_json::from_str(SHARED_QUI_QSS_SURFACE_FRAME).expect("fixture JSON parses");
    frame["view"]["audio"] = json!({
        "tracks": [
            {
                "id": "bgm-main",
                "kind": "bgm",
                "assetName": "audio/theme.ogg",
                "assetType": "bgm",
                "loadMode": "buffered",
                "playbackState": "playing",
                "looped": true,
                "volume": 0.8,
                "memory": {
                    "bufferCpuBytes": 2048,
                    "handleCpuBytes": 64
                },
                "provenance": {
                    "contentPackageId": "runtime.audio",
                    "requiredRuntimePackages": ["base"]
                }
            }
        ]
    });
    let frame_json = serde_json::to_string(&frame).expect("fixture JSON serializes");
    let mut renderer = NativeRenderer::with_audio_backend(
        RecordingBackend::default(),
        NullNativeAudioBackend::new(),
    );

    renderer
        .prepare_render_json_and_apply_audio_str(&frame_json)
        .expect("facade JSON render and audio apply succeeds");

    let metrics = renderer.metrics();
    assert_eq!(metrics.revision, 1);
    assert!(metrics.has_frame);
    assert!(metrics.frame.command_count > 0);
    assert!(metrics.frame.declarative_asset_request_count > 0);
    assert!(metrics.frame.by_package.contains_key("runtime.ui"));
    assert_eq!(
        metrics.frame.by_resource_kind[&NativeResourceKind::UiAst],
        1
    );

    assert_eq!(metrics.resources.declarative_resource_count, 1);
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::UiAst].count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["runtime.ui"].owned_count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["base"].dependent_count,
        1
    );

    assert_eq!(metrics.resources.audio.resource_count, 2);
    assert_eq!(metrics.resources.audio.buffer_count, 1);
    assert_eq!(metrics.resources.audio.handle_count, 1);
    assert_eq!(metrics.resources.audio.memory.cpu_bytes, 2112);
    assert_eq!(
        metrics.resources.audio.by_package["runtime.audio"].owned_count,
        2
    );
    assert!(metrics.resources.audio.by_package["base"].dependent_count >= 1);

    assert_eq!(metrics.audio_backend.active_track_count, 1);
    assert_eq!(
        metrics.audio_backend.active_track_count_by_package["runtime.audio"],
        1
    );
}
