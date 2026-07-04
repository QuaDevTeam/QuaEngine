use super::super::*;
use super::support::{provenance, set};
use crate::projection::audio::{AudioProjection, AudioTrackKind, AudioTrackProjection};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

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
fn skips_audio_asset_requests_for_empty_upserted_and_retained_asset_names() {
    let mut ledger = NativeResourceLedger::new();
    let empty_asset =
        NativeResourceRecord::new("audio:buffer:bgm:bgm:", NativeResourceKind::AudioBuffer);
    let blank_asset = NativeResourceRecord::new(
        "audio:stream:ambient:ambient:   ",
        NativeResourceKind::AudioStream,
    );
    ledger.insert(blank_asset.clone());
    let sync = AudioResourceSyncPlan {
        upsert: vec![empty_asset],
        retain: vec![blank_asset.id.clone()],
        release: Vec::new(),
    };

    let assets = plan_audio_asset_requests(&ledger, &sync);

    assert!(assets.requests.is_empty());
    assert_eq!(
        assets.skipped_resource_ids,
        vec![
            ResourceId::from("audio:buffer:bgm:bgm:"),
            ResourceId::from("audio:stream:ambient:ambient:   "),
        ]
    );
}

#[test]
fn skips_audio_asset_requests_for_empty_or_unsafe_asset_types() {
    let mut ledger = NativeResourceLedger::new();
    let empty_type = NativeResourceRecord::new(
        "audio:buffer:bgm::music/a.ogg",
        NativeResourceKind::AudioBuffer,
    );
    let blank_type = NativeResourceRecord::new(
        "audio:stream:ambient:   :music/b.ogg",
        NativeResourceKind::AudioStream,
    );
    let path_type = NativeResourceRecord::new(
        "audio:buffer:bgm:bgm/native:music/c.ogg",
        NativeResourceKind::AudioBuffer,
    );
    let symbol_type = NativeResourceRecord::new(
        "audio:buffer:bgm:---:music/d.ogg",
        NativeResourceKind::AudioBuffer,
    );
    ledger.insert(blank_type.clone());
    ledger.insert(path_type.clone());
    ledger.insert(symbol_type.clone());
    let sync = AudioResourceSyncPlan {
        upsert: vec![empty_type],
        retain: vec![
            blank_type.id.clone(),
            path_type.id.clone(),
            symbol_type.id.clone(),
        ],
        release: Vec::new(),
    };

    let assets = plan_audio_asset_requests(&ledger, &sync);

    assert!(assets.requests.is_empty());
    assert_eq!(
        assets.skipped_resource_ids,
        vec![
            ResourceId::from("audio:buffer:bgm::music/a.ogg"),
            ResourceId::from("audio:stream:ambient:   :music/b.ogg"),
            ResourceId::from("audio:buffer:bgm:bgm/native:music/c.ogg"),
            ResourceId::from("audio:buffer:bgm:---:music/d.ogg"),
        ]
    );
}
