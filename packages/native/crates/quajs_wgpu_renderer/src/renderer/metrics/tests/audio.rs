use super::*;

#[test]
fn reports_audio_resource_metrics_separately_from_total_ledger() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            "audio:buffer:bgm:bgm:music/opening.ogg",
            NativeResourceKind::AudioBuffer,
        )
        .owned_by("runtime.audio")
        .require_package("base")
        .memory(4096, 0),
    );
    resources.insert(
        NativeResourceRecord::new(
            "audio:stream:ambient:ambient:rain.opus",
            NativeResourceKind::AudioStream,
        )
        .owned_by("runtime.ambience")
        .memory(512, 0),
    );
    resources.insert(
        NativeResourceRecord::new(
            "audio:handle:bgm:bgm:bgm-main",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("runtime.audio")
        .memory(64, 0),
    );
    resources.insert(
        NativeResourceRecord::new("images:bg/school.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );

    let metrics = NativeRendererMetrics::from_state(5, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 4);
    assert_eq!(metrics.resources.memory.cpu_bytes, 4800);
    assert_eq!(metrics.resources.memory.gpu_bytes, 4096);
    assert_eq!(metrics.resources.audio.resource_count, 3);
    assert_eq!(metrics.resources.audio.buffer_count, 1);
    assert_eq!(metrics.resources.audio.stream_count, 1);
    assert_eq!(metrics.resources.audio.handle_count, 1);
    assert_eq!(metrics.resources.audio.memory.cpu_bytes, 4672);
    assert_eq!(metrics.resources.audio.memory.gpu_bytes, 0);
    assert_eq!(metrics.resources.audio.package_count, 3);
    assert_eq!(
        metrics.resources.audio.by_package["runtime.audio"].owned_count,
        2
    );
    assert_eq!(
        metrics.resources.audio.by_package["runtime.audio"]
            .owned_memory
            .cpu_bytes,
        4160
    );
    assert_eq!(
        metrics.resources.audio.by_package["runtime.ambience"].owned_count,
        1
    );
    assert_eq!(
        metrics.resources.audio.by_package["base"].dependent_count,
        1
    );
    assert_eq!(
        metrics.resources.audio.by_package["base"]
            .dependent_memory
            .cpu_bytes,
        4096
    );
}

#[test]
fn reports_audio_backend_track_metrics_from_renderer_state() {
    let mut state = NativeRendererState::new();
    state.prepare_frame(test_layout(), &view_with_audio());

    let metrics = state.metrics();

    assert_eq!(metrics.audio_backend.active_track_count, 1);
    assert_eq!(
        metrics.audio_backend.active_track_count_by_package["runtime.audio"],
        1
    );
    assert_eq!(metrics.resources.audio.resource_count, 2);
    assert_eq!(metrics.resources.audio.buffer_count, 1);
    assert_eq!(metrics.resources.audio.handle_count, 1);
}
