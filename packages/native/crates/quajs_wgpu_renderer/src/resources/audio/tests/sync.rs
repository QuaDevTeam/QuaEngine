use super::super::*;
use super::support::provenance;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackPlaybackState,
    AudioTrackProjection,
};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

#[test]
fn skips_stopped_audio_tracks() {
    let mut track = AudioTrackProjection::new("voice-1", AudioTrackKind::Voice, "voice/001.ogg");
    track.playback_state = AudioTrackPlaybackState::Stopped;
    let audio = AudioProjection::new(vec![track]);

    let sync = plan_audio_resource_sync(&NativeResourceLedger::new(), Some(&audio));

    assert!(sync.is_empty());
}

#[test]
fn retains_matching_audio_records_and_releases_stale_audio_only() {
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "voice-1",
        AudioTrackKind::Voice,
        "voice/001.ogg",
    )
    .memory(AudioTrackMemoryEstimate {
        buffer_cpu_bytes: 512,
        stream_cpu_bytes: 0,
        handle_cpu_bytes: 32,
    })
    .with_provenance(provenance("runtime.voice", []))]);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new(
            "audio:buffer:voice:voice:voice/001.ogg",
            NativeResourceKind::AudioBuffer,
        )
        .owned_by("runtime.voice")
        .memory(512, 0)
        .label("audio voice asset voice:voice/001.ogg"),
    );
    ledger.insert(
        NativeResourceRecord::new(
            "audio:handle:voice:voice:voice-1",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("runtime.voice")
        .memory(32, 0)
        .label("audio voice handle voice-1"),
    );
    ledger.insert(NativeResourceRecord::new(
        "audio:buffer:sfx:sfx:click.ogg",
        NativeResourceKind::AudioBuffer,
    ));
    ledger.insert(NativeResourceRecord::new(
        "images:bg/school.png",
        NativeResourceKind::Texture,
    ));

    let sync = plan_audio_resource_sync(&ledger, Some(&audio));

    assert_eq!(
        sync.retain,
        vec![
            ResourceId::from("audio:buffer:voice:voice:voice/001.ogg"),
            ResourceId::from("audio:handle:voice:voice:voice-1"),
        ]
    );
    assert!(sync.upsert.is_empty());
    assert_eq!(
        sync.release,
        vec![ResourceId::from("audio:buffer:sfx:sfx:click.ogg")]
    );
}

#[test]
fn preserves_existing_audio_memory_when_projection_has_no_estimate() {
    let audio = AudioProjection::new(vec![AudioTrackProjection::new(
        "bgm-main",
        AudioTrackKind::Bgm,
        "music/opening.ogg",
    )
    .with_provenance(provenance("runtime.audio", []))]);
    let mut ledger = NativeResourceLedger::new();
    ledger.insert(
        NativeResourceRecord::new(
            "audio:buffer:bgm:bgm:music/opening.ogg",
            NativeResourceKind::AudioBuffer,
        )
        .owned_by("runtime.audio")
        .memory(4096, 0),
    );

    let sync = plan_audio_resource_sync(&ledger, Some(&audio));

    let buffer = sync
        .upsert
        .iter()
        .find(|record| record.kind == NativeResourceKind::AudioBuffer)
        .unwrap();
    assert_eq!(buffer.memory.cpu_bytes, 4096);
}
