use super::super::*;
use super::support::provenance;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackProjection,
};
use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId};

#[test]
fn plans_buffered_audio_buffer_and_handle_resources() {
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "bgm-main",
        AudioTrackKind::Bgm,
        "music/opening.ogg",
    )
    .memory(AudioTrackMemoryEstimate {
        buffer_cpu_bytes: 1024,
        stream_cpu_bytes: 0,
        handle_cpu_bytes: 64,
    })
    .with_provenance(provenance("runtime.audio", ["base"]))]);

    let records = audio_resource_records(Some(&audio));

    assert_eq!(records.len(), 2);
    assert_eq!(
        records[0].id,
        ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    assert_eq!(records[0].kind, NativeResourceKind::AudioBuffer);
    assert_eq!(
        records[0].owner_package_id.as_deref(),
        Some("runtime.audio")
    );
    assert!(records[0].required_package_ids.contains("base"));
    assert_eq!(records[0].memory.cpu_bytes, 1024);
    assert_eq!(
        records[1].id,
        ResourceId::from("audio:handle:bgm:bgm:bgm-main")
    );
    assert_eq!(records[1].kind, NativeResourceKind::AudioHandle);
    assert_eq!(records[1].memory.cpu_bytes, 64);
}

#[test]
fn plans_streaming_audio_stream_resources() {
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "ambient-rain",
        AudioTrackKind::Ambient,
        "amb/rain.opus",
    )
    .streamed()
    .memory(AudioTrackMemoryEstimate {
        buffer_cpu_bytes: 0,
        stream_cpu_bytes: 256,
        handle_cpu_bytes: 16,
    })
    .with_provenance(provenance("runtime.ambience", []))]);

    let sync = plan_audio_resource_sync(&NativeResourceLedger::new(), Some(&audio));

    assert_eq!(sync.upsert.len(), 2);
    assert_eq!(
        sync.upsert[0].id,
        ResourceId::from("audio:stream:ambient:ambient:amb/rain.opus")
    );
    assert_eq!(sync.upsert[0].kind, NativeResourceKind::AudioStream);
    assert_eq!(sync.upsert[0].memory.cpu_bytes, 256);
    assert_eq!(sync.upsert[1].kind, NativeResourceKind::AudioHandle);
}

#[test]
fn skips_unsafe_audio_package_provenance_on_direct_projection() {
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "bgm-main",
        AudioTrackKind::Bgm,
        "music/opening.ogg",
    )
    .with_provenance(provenance("runtime/audio", ["base", "runtime/ui"]))]);

    let records = audio_resource_records(Some(&audio));

    assert_eq!(records.len(), 2);
    for record in &records {
        assert_eq!(record.owner_package_id, None);
        assert!(record.required_package_ids.contains("base"));
        assert!(!record.required_package_ids.contains("runtime/ui"));
        assert!(!record.required_package_ids.contains("runtime/audio"));
    }
}

#[test]
fn skips_audio_resources_for_empty_asset_names() {
    let audio = AudioProjection::new(vec![
        AudioTrackProjection::new("bgm-empty", AudioTrackKind::Bgm, ""),
        AudioTrackProjection::new("bgm-blank", AudioTrackKind::Bgm, "   "),
    ]);

    let records = audio_resource_records(Some(&audio));

    assert!(records.is_empty());
}

#[test]
fn skips_audio_resources_for_unsafe_track_ids() {
    let audio = AudioProjection::new(vec![
        AudioTrackProjection::new(
            "https://example.test/bgm",
            AudioTrackKind::Bgm,
            "music/a.ogg",
        ),
        AudioTrackProjection::new("native:bgm", AudioTrackKind::Bgm, "music/b.ogg"),
        AudioTrackProjection::new("bad/bgm", AudioTrackKind::Bgm, "music/c.ogg"),
        AudioTrackProjection::new("plugin.dll", AudioTrackKind::Bgm, "music/d.ogg"),
        AudioTrackProjection::new("bgm:main", AudioTrackKind::Bgm, "music/opening.ogg"),
    ]);

    let records = audio_resource_records(Some(&audio));

    assert_eq!(records.len(), 2);
    assert_eq!(
        records[0].id,
        ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    assert_eq!(
        records[1].id,
        ResourceId::from("audio:handle:bgm:bgm:bgm:main")
    );
}

#[test]
fn skips_audio_resources_for_unsafe_asset_names() {
    let audio = AudioProjection::new(vec![
        AudioTrackProjection::new("bgm-traversal", AudioTrackKind::Bgm, "../music/a.ogg"),
        AudioTrackProjection::new(
            "bgm-url",
            AudioTrackKind::Bgm,
            "https://example.test/music/b.ogg",
        ),
        AudioTrackProjection::new("bgm-absolute", AudioTrackKind::Bgm, "/music/c.ogg"),
        AudioTrackProjection::new("bgm-backslash", AudioTrackKind::Bgm, "music\\d.ogg"),
        AudioTrackProjection::new("bgm-payload", AudioTrackKind::Bgm, "music/native.dll?rev=1"),
    ]);

    let records = audio_resource_records(Some(&audio));

    assert!(records.is_empty());
}

#[test]
fn skips_audio_resources_for_empty_or_unsafe_asset_types() {
    let mut empty_type =
        AudioTrackProjection::new("bgm-empty-type", AudioTrackKind::Bgm, "music/a.ogg");
    empty_type.asset_type.clear();
    let mut blank_type =
        AudioTrackProjection::new("bgm-blank-type", AudioTrackKind::Bgm, "music/b.ogg");
    blank_type.asset_type = "   ".to_string();
    let mut path_type =
        AudioTrackProjection::new("bgm-path-type", AudioTrackKind::Bgm, "music/c.ogg");
    path_type.asset_type = "bgm/native".to_string();
    let mut symbol_type =
        AudioTrackProjection::new("bgm-symbol-type", AudioTrackKind::Bgm, "music/d.ogg");
    symbol_type.asset_type = "---".to_string();
    let audio = AudioProjection::new(vec![empty_type, blank_type, path_type, symbol_type]);

    let records = audio_resource_records(Some(&audio));

    assert!(records.is_empty());
}
