use std::collections::{BTreeMap, BTreeSet};

use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::common::{is_safe_native_asset_ref, PackageProvenance};
use crate::projection::safety::{
    is_safe_native_background_origin, is_safe_native_opacity, is_safe_native_video_playback_rate,
    is_safe_native_video_volume,
};
use crate::resources::{NativeAssetRequestPlan, ResourceId};

pub type VideoBackendStreamStateMap = BTreeMap<String, VideoBackendStreamState>;

const BACKGROUND_VIDEO_STREAM_ID: &str = "background:video";
const NATIVE_VIDEO_ASSET_TYPE: &str = "video";

#[derive(Clone, Debug, Default, PartialEq)]
pub struct VideoBackendCommandPlan {
    pub commands: Vec<VideoBackendCommand>,
    pub next_streams: VideoBackendStreamStateMap,
    pub skipped_asset_resource_ids: Vec<ResourceId>,
}

impl VideoBackendCommandPlan {
    pub fn is_empty(&self) -> bool {
        self.commands.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoBackendCommand {
    pub stream_id: String,
    pub kind: VideoBackendCommandKind,
    pub stream: Option<VideoBackendStreamState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VideoBackendCommandKind {
    LoadAsset,
    StartStream,
    UpdateStream,
    StopStream,
    ReleaseDecoder,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VideoBackendStreamState {
    pub id: String,
    pub asset_type: String,
    pub asset_name: String,
    pub looped: bool,
    pub muted: bool,
    pub volume: f32,
    pub playback_rate: f32,
    pub package_candidates: BTreeSet<String>,
    pub decoder_resource_id: ResourceId,
    pub frame_queue_resource_id: ResourceId,
    pub texture_ring_resource_id: ResourceId,
}

pub fn plan_video_backend_commands(
    previous_streams: &VideoBackendStreamStateMap,
    background: Option<&BackgroundProjection>,
    assets: &NativeAssetRequestPlan,
) -> VideoBackendCommandPlan {
    let next_streams = video_backend_stream_states(background, assets);
    let mut commands = Vec::new();

    for (stream_id, next) in &next_streams {
        match previous_streams.get(stream_id) {
            None => {
                commands.push(load_asset_command(next));
                commands.push(stream_command(VideoBackendCommandKind::StartStream, next));
            }
            Some(previous) if stream_identity_changed(previous, next) => {
                commands.push(stream_command(
                    VideoBackendCommandKind::StopStream,
                    previous,
                ));
                commands.push(stream_command(
                    VideoBackendCommandKind::ReleaseDecoder,
                    previous,
                ));
                commands.push(load_asset_command(next));
                commands.push(stream_command(VideoBackendCommandKind::StartStream, next));
            }
            Some(previous) if stream_playback_changed(previous, next) => {
                commands.push(stream_command(VideoBackendCommandKind::UpdateStream, next));
            }
            Some(_) => {}
        }
    }

    for (stream_id, previous) in previous_streams {
        if !next_streams.contains_key(stream_id) {
            commands.push(stream_command(
                VideoBackendCommandKind::StopStream,
                previous,
            ));
            commands.push(stream_command(
                VideoBackendCommandKind::ReleaseDecoder,
                previous,
            ));
        }
    }

    VideoBackendCommandPlan {
        commands,
        next_streams,
        skipped_asset_resource_ids: assets.skipped_resource_ids.clone(),
    }
}

pub fn plan_video_backend_package_teardown_commands(
    previous_streams: &VideoBackendStreamStateMap,
    released_resource_ids: &BTreeSet<ResourceId>,
) -> VideoBackendCommandPlan {
    let mut commands = Vec::new();
    let mut next_streams = VideoBackendStreamStateMap::new();

    for (stream_id, previous) in previous_streams {
        if stream_references_released_resource(previous, released_resource_ids) {
            commands.push(stream_command(
                VideoBackendCommandKind::StopStream,
                previous,
            ));
            commands.push(stream_command(
                VideoBackendCommandKind::ReleaseDecoder,
                previous,
            ));
        } else {
            next_streams.insert(stream_id.clone(), previous.clone());
        }
    }

    VideoBackendCommandPlan {
        commands,
        next_streams,
        skipped_asset_resource_ids: Vec::new(),
    }
}

fn video_backend_stream_states(
    background: Option<&BackgroundProjection>,
    assets: &NativeAssetRequestPlan,
) -> VideoBackendStreamStateMap {
    let Some(background) = background else {
        return BTreeMap::new();
    };
    if background.mode != BackgroundMode::Video {
        return BTreeMap::new();
    }
    let Some(video) = background.video.as_ref() else {
        return BTreeMap::new();
    };
    if !is_safe_native_asset_ref(NATIVE_VIDEO_ASSET_TYPE, &video.asset_name)
        || !is_safe_native_opacity(video.opacity)
        || !is_safe_native_background_origin(video.origin.as_deref())
        || !is_safe_native_video_volume(video.volume)
        || !is_safe_native_video_playback_rate(video.playback_rate)
    {
        return BTreeMap::new();
    }

    let state = video_backend_stream_state(video, assets);
    BTreeMap::from([(state.id.clone(), state)])
}

fn video_backend_stream_state(
    video: &BackgroundVideoProjection,
    assets: &NativeAssetRequestPlan,
) -> VideoBackendStreamState {
    let package_candidates = assets
        .request(NATIVE_VIDEO_ASSET_TYPE, &video.asset_name)
        .map(|request| request.package_candidates.clone())
        .unwrap_or_else(|| safe_package_ids(&video.provenance));

    VideoBackendStreamState {
        id: BACKGROUND_VIDEO_STREAM_ID.to_string(),
        asset_type: NATIVE_VIDEO_ASSET_TYPE.to_string(),
        asset_name: video.asset_name.clone(),
        looped: video.looped.unwrap_or(false),
        muted: video.muted.unwrap_or(false),
        volume: video.volume.unwrap_or(1.0),
        playback_rate: video.playback_rate.unwrap_or(1.0),
        package_candidates,
        decoder_resource_id: video_decoder_resource_id(&video.asset_name),
        frame_queue_resource_id: video_frame_queue_resource_id(&video.asset_name),
        texture_ring_resource_id: video_texture_ring_resource_id(&video.asset_name),
    }
}

fn safe_package_ids(provenance: &PackageProvenance) -> BTreeSet<String> {
    provenance.package_ids()
}

fn video_decoder_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!(
        "video:decoder:{NATIVE_VIDEO_ASSET_TYPE}:{asset_name}"
    ))
}

fn video_frame_queue_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!(
        "video:frame-queue:{NATIVE_VIDEO_ASSET_TYPE}:{asset_name}"
    ))
}

fn video_texture_ring_resource_id(asset_name: &str) -> ResourceId {
    ResourceId::new(format!(
        "video:texture-ring:{NATIVE_VIDEO_ASSET_TYPE}:{asset_name}"
    ))
}

fn load_asset_command(stream: &VideoBackendStreamState) -> VideoBackendCommand {
    stream_command(VideoBackendCommandKind::LoadAsset, stream)
}

fn stream_command(
    kind: VideoBackendCommandKind,
    stream: &VideoBackendStreamState,
) -> VideoBackendCommand {
    VideoBackendCommand {
        stream_id: stream.id.clone(),
        kind,
        stream: Some(stream.clone()),
    }
}

fn stream_identity_changed(
    previous: &VideoBackendStreamState,
    next: &VideoBackendStreamState,
) -> bool {
    previous.asset_type != next.asset_type
        || previous.asset_name != next.asset_name
        || previous.decoder_resource_id != next.decoder_resource_id
        || previous.frame_queue_resource_id != next.frame_queue_resource_id
        || previous.texture_ring_resource_id != next.texture_ring_resource_id
}

fn stream_playback_changed(
    previous: &VideoBackendStreamState,
    next: &VideoBackendStreamState,
) -> bool {
    previous.looped != next.looped
        || previous.muted != next.muted
        || (previous.volume - next.volume).abs() > f32::EPSILON
        || (previous.playback_rate - next.playback_rate).abs() > f32::EPSILON
        || previous.package_candidates != next.package_candidates
}

fn stream_references_released_resource(
    stream: &VideoBackendStreamState,
    released_resource_ids: &BTreeSet<ResourceId>,
) -> bool {
    released_resource_ids.contains(&stream.decoder_resource_id)
        || released_resource_ids.contains(&stream.frame_queue_resource_id)
        || released_resource_ids.contains(&stream.texture_ring_resource_id)
}

#[cfg(test)]
mod tests;
