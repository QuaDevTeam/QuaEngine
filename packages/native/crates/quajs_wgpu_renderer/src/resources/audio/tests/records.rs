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
