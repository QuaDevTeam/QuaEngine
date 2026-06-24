use std::collections::BTreeSet;

use super::*;
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackMemoryEstimate, AudioTrackPlaybackState,
    AudioTrackProjection,
};
use crate::projection::common::PackageProvenance;
use crate::resources::NativeResourceLedger;

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
fn plans_audio_asset_requests_for_upserted_media_resources_only() {
    let audio = AudioProjection::new(vec![
        AudioTrackProjection::new("bgm-main", AudioTrackKind::Bgm, "music/opening.ogg")
            .with_provenance(provenance("runtime.audio", ["base"])),
        AudioTrackProjection::new("voice-1", AudioTrackKind::Voice, "voice/001.ogg")
            .streamed()
            .with_provenance(provenance("runtime.voice", [])),
    ]);
    let ledger = NativeResourceLedger::new();
    let sync = plan_audio_resource_sync(&ledger, Some(&audio));

    let assets = plan_audio_asset_requests(&ledger, &sync);

    assert_eq!(assets.requests.len(), 2);
    assert_eq!(
        assets
            .request("bgm", "music/opening.ogg")
            .unwrap()
            .package_candidates,
        set(["base", "runtime.audio"])
    );
    assert_eq!(
        assets.request("voice", "voice/001.ogg").unwrap().kind,
        NativeResourceKind::AudioStream
    );
    assert_eq!(
        assets.skipped_resource_ids,
        vec![
            ResourceId::from("audio:handle:bgm:bgm:bgm-main"),
            ResourceId::from("audio:handle:voice:voice:voice-1"),
        ]
    );
}

#[test]
fn plans_audio_asset_requests_for_retained_media_resources_from_ledger() {
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
        .label("audio bgm asset bgm:music/opening.ogg"),
    );
    ledger.insert(
        NativeResourceRecord::new(
            "audio:handle:bgm:bgm:bgm-main",
            NativeResourceKind::AudioHandle,
        )
        .owned_by("runtime.audio")
        .label("audio bgm handle bgm-main"),
    );
    let sync = plan_audio_resource_sync(&ledger, Some(&audio));

    let assets = plan_audio_asset_requests(&ledger, &sync);

    assert!(sync.upsert.is_empty());
    assert_eq!(sync.retain.len(), 2);
    assert_eq!(assets.requests.len(), 1);
    let bgm = assets.request("bgm", "music/opening.ogg").unwrap();
    assert_eq!(
        bgm.resource_id,
        ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg")
    );
    assert_eq!(bgm.package_candidates, set(["runtime.audio"]));
    assert_eq!(
        assets.skipped_resource_ids,
        vec![ResourceId::from("audio:handle:bgm:bgm:bgm-main")]
    );
}

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

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}

fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}
