use std::collections::BTreeSet;

use super::super::{
    plan_audio_backend_commands, AudioBackendTrackState, AudioBackendTrackStateMap,
};
use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackPlaybackState, AudioTrackProjection,
};
use crate::projection::common::PackageProvenance;
use crate::resources::{
    NativeAssetRequest, NativeAssetRequestPlan, NativeResourceKind, ResourceId,
};

pub(super) fn track(id: &str, asset_name: &str) -> AudioTrackProjection {
    AudioTrackProjection::new(id, AudioTrackKind::Bgm, asset_name)
}

pub(super) fn track_state(
    id: &str,
    asset_name: &str,
    volume: f32,
    playback_state: AudioTrackPlaybackState,
) -> AudioBackendTrackState {
    let mut projection = track(id, asset_name);
    projection.volume = volume;
    projection.playback_state = playback_state;
    audio_backend_track_state_for_test(&projection)
}

pub(super) fn audio_backend_track_state_for_test(
    track: &AudioTrackProjection,
) -> AudioBackendTrackState {
    plan_audio_backend_commands(
        &AudioBackendTrackStateMap::new(),
        Some(&AudioProjection::new(vec![track.clone()])),
        &assets([]),
    )
    .next_tracks
    .remove(&track.id)
    .unwrap()
}

pub(super) fn asset<const N: usize>(
    asset_type: &str,
    asset_name: &str,
    packages: [&str; N],
) -> NativeAssetRequest {
    NativeAssetRequest {
        resource_id: ResourceId::from(format!(
            "audio:buffer:{asset_type}:{asset_type}:{asset_name}"
        )),
        asset_type: asset_type.to_string(),
        asset_name: asset_name.to_string(),
        kind: NativeResourceKind::AudioBuffer,
        command_ids: BTreeSet::new(),
        owner_package_ids: BTreeSet::new(),
        required_package_ids: BTreeSet::new(),
        package_candidates: set(packages),
    }
}

pub(super) fn assets<const N: usize>(requests: [NativeAssetRequest; N]) -> NativeAssetRequestPlan {
    NativeAssetRequestPlan {
        requests: requests.into(),
        skipped_resource_ids: Vec::new(),
    }
}

pub(super) fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: set(required),
    }
}

pub(super) fn set<const N: usize>(items: [&str; N]) -> BTreeSet<String> {
    items.into_iter().map(ToString::to_string).collect()
}

pub(super) fn set_resources<const N: usize>(items: [&str; N]) -> BTreeSet<ResourceId> {
    items.into_iter().map(ResourceId::from).collect()
}
