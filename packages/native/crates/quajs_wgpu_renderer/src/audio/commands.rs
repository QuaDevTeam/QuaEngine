use std::collections::{BTreeMap, BTreeSet};

use crate::projection::audio::{
    AudioProjection, AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
    AudioTrackProjection,
};
use crate::resources::{NativeAssetRequestPlan, ResourceId};

pub type AudioBackendTrackStateMap = BTreeMap<String, AudioBackendTrackState>;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AudioBackendCommandPlan {
    pub commands: Vec<AudioBackendCommand>,
    pub next_tracks: AudioBackendTrackStateMap,
    pub skipped_asset_resource_ids: Vec<ResourceId>,
}

impl AudioBackendCommandPlan {
    pub fn is_empty(&self) -> bool {
        self.commands.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioBackendCommand {
    pub track_id: String,
    pub kind: AudioBackendCommandKind,
    pub track: Option<AudioBackendTrackState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AudioBackendCommandKind {
    LoadAsset,
    StartTrack,
    UpdateTrack,
    StopTrack,
    ReleaseHandle,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioBackendTrackState {
    pub id: String,
    pub kind: AudioTrackKind,
    pub asset_type: String,
    pub asset_name: String,
    pub load_mode: AudioTrackLoadMode,
    pub playback_state: AudioTrackPlaybackState,
    pub looped: bool,
    pub volume: f32,
    pub package_candidates: BTreeSet<String>,
    pub media_resource_id: ResourceId,
    pub handle_resource_id: ResourceId,
}

pub fn plan_audio_backend_commands(
    previous_tracks: &AudioBackendTrackStateMap,
    audio: Option<&AudioProjection>,
    assets: &NativeAssetRequestPlan,
) -> AudioBackendCommandPlan {
    let next_tracks = audio_backend_track_states(audio, assets);
    let mut commands = Vec::new();

    for (track_id, next) in &next_tracks {
        match previous_tracks.get(track_id) {
            None => {
                commands.push(load_asset_command(next));
                commands.push(track_command(AudioBackendCommandKind::StartTrack, next));
            }
            Some(previous) if track_identity_changed(previous, next) => {
                commands.push(track_command(AudioBackendCommandKind::StopTrack, previous));
                commands.push(track_command(
                    AudioBackendCommandKind::ReleaseHandle,
                    previous,
                ));
                commands.push(load_asset_command(next));
                commands.push(track_command(AudioBackendCommandKind::StartTrack, next));
            }
            Some(previous) if track_playback_changed(previous, next) => {
                commands.push(track_command(AudioBackendCommandKind::UpdateTrack, next));
            }
            Some(_) => {}
        }
    }

    for (track_id, previous) in previous_tracks {
        if !next_tracks.contains_key(track_id) {
            commands.push(track_command(AudioBackendCommandKind::StopTrack, previous));
            commands.push(track_command(
                AudioBackendCommandKind::ReleaseHandle,
                previous,
            ));
        }
    }

    AudioBackendCommandPlan {
        commands,
        next_tracks,
        skipped_asset_resource_ids: assets.skipped_resource_ids.clone(),
    }
}

fn audio_backend_track_states(
    audio: Option<&AudioProjection>,
    assets: &NativeAssetRequestPlan,
) -> AudioBackendTrackStateMap {
    let Some(audio) = audio else {
        return BTreeMap::new();
    };

    audio
        .tracks
        .iter()
        .filter(|track| !matches!(track.playback_state, AudioTrackPlaybackState::Stopped))
        .map(|track| {
            let state = audio_backend_track_state(track, assets);
            (state.id.clone(), state)
        })
        .collect()
}

fn audio_backend_track_state(
    track: &AudioTrackProjection,
    assets: &NativeAssetRequestPlan,
) -> AudioBackendTrackState {
    let package_candidates = assets
        .request(&track.asset_type, &track.asset_name)
        .map(|request| request.package_candidates.clone())
        .unwrap_or_else(|| track.provenance.package_ids());

    AudioBackendTrackState {
        id: track.id.clone(),
        kind: track.kind,
        asset_type: track.asset_type.clone(),
        asset_name: track.asset_name.clone(),
        load_mode: track.load_mode,
        playback_state: track.playback_state,
        looped: track.looped,
        volume: track.volume,
        package_candidates,
        media_resource_id: media_resource_id(track),
        handle_resource_id: handle_resource_id(track),
    }
}

fn media_resource_id(track: &AudioTrackProjection) -> ResourceId {
    let resource_kind = match track.load_mode {
        AudioTrackLoadMode::Buffered => "buffer",
        AudioTrackLoadMode::Streamed => "stream",
    };

    ResourceId::new(format!(
        "audio:{resource_kind}:{}:{}:{}",
        track.kind.resource_prefix(),
        track.asset_type,
        track.asset_name
    ))
}

fn handle_resource_id(track: &AudioTrackProjection) -> ResourceId {
    ResourceId::new(format!(
        "audio:handle:{}:{}:{}",
        track.kind.resource_prefix(),
        track.kind.resource_prefix(),
        track.id
    ))
}

fn load_asset_command(track: &AudioBackendTrackState) -> AudioBackendCommand {
    track_command(AudioBackendCommandKind::LoadAsset, track)
}

fn track_command(
    kind: AudioBackendCommandKind,
    track: &AudioBackendTrackState,
) -> AudioBackendCommand {
    AudioBackendCommand {
        track_id: track.id.clone(),
        kind,
        track: Some(track.clone()),
    }
}

fn track_identity_changed(
    previous: &AudioBackendTrackState,
    next: &AudioBackendTrackState,
) -> bool {
    previous.kind != next.kind
        || previous.asset_type != next.asset_type
        || previous.asset_name != next.asset_name
        || previous.load_mode != next.load_mode
        || previous.media_resource_id != next.media_resource_id
        || previous.handle_resource_id != next.handle_resource_id
}

fn track_playback_changed(
    previous: &AudioBackendTrackState,
    next: &AudioBackendTrackState,
) -> bool {
    previous.playback_state != next.playback_state
        || previous.looped != next.looped
        || (previous.volume - next.volume).abs() > f32::EPSILON
        || previous.package_candidates != next.package_candidates
}

#[cfg(test)]
mod tests;
