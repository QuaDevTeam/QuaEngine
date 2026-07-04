use crate::projection::audio::{
    AudioProjection, AudioTrackLoadMode, AudioTrackPlaybackState, AudioTrackProjection,
};

use super::super::record::{NativeResourceKind, NativeResourceRecord, ResourceId};

pub fn audio_resource_records(audio: Option<&AudioProjection>) -> Vec<NativeResourceRecord> {
    let Some(audio) = audio else {
        return Vec::new();
    };

    audio
        .tracks
        .iter()
        .flat_map(audio_track_resource_records)
        .collect()
}

pub(super) fn is_audio_resource_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::AudioBuffer
            | NativeResourceKind::AudioStream
            | NativeResourceKind::AudioHandle
    )
}

fn audio_track_resource_records(track: &AudioTrackProjection) -> Vec<NativeResourceRecord> {
    if matches!(track.playback_state, AudioTrackPlaybackState::Stopped) {
        return Vec::new();
    }

    let mut records = Vec::with_capacity(2);
    let media_id = match track.load_mode {
        AudioTrackLoadMode::Buffered => {
            audio_resource_id(track, "buffer", &track.asset_type, &track.asset_name)
        }
        AudioTrackLoadMode::Streamed => {
            audio_resource_id(track, "stream", &track.asset_type, &track.asset_name)
        }
    };
    let media_kind = match track.load_mode {
        AudioTrackLoadMode::Buffered => NativeResourceKind::AudioBuffer,
        AudioTrackLoadMode::Streamed => NativeResourceKind::AudioStream,
    };
    let media_cpu_bytes = match track.load_mode {
        AudioTrackLoadMode::Buffered => track.memory.buffer_cpu_bytes,
        AudioTrackLoadMode::Streamed => track.memory.stream_cpu_bytes,
    };

    records.push(apply_audio_track_provenance(
        NativeResourceRecord::new(media_id, media_kind)
            .memory(media_cpu_bytes, 0)
            .label(format!(
                "audio {} asset {}:{}",
                track.kind.resource_prefix(),
                track.asset_type,
                track.asset_name
            )),
        track,
    ));
    records.push(apply_audio_track_provenance(
        NativeResourceRecord::new(
            audio_resource_id(track, "handle", &track.kind.resource_prefix(), &track.id),
            NativeResourceKind::AudioHandle,
        )
        .memory(track.memory.handle_cpu_bytes, 0)
        .label(format!(
            "audio {} handle {}",
            track.kind.resource_prefix(),
            track.id
        )),
        track,
    ));

    records
}

fn audio_resource_id(
    track: &AudioTrackProjection,
    resource_kind: &str,
    asset_type: &str,
    asset_name: &str,
) -> ResourceId {
    ResourceId::new(format!(
        "audio:{resource_kind}:{}:{asset_type}:{asset_name}",
        track.kind.resource_prefix()
    ))
}

fn apply_audio_track_provenance(
    mut record: NativeResourceRecord,
    track: &AudioTrackProjection,
) -> NativeResourceRecord {
    if let Some(package_id) = &track.provenance.content_package_id {
        record = record.owned_by(package_id.clone());
    }

    for package_id in &track.provenance.required_runtime_packages {
        record = record.require_package(package_id.clone());
    }

    record
}
