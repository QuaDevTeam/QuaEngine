use std::collections::BTreeSet;

use crate::projection::audio::{
    AudioProjection, AudioTrackLoadMode, AudioTrackPlaybackState, AudioTrackProjection,
};

use super::record::{NativeResourceKind, NativeResourceRecord, ResourceId, ResourceMemory};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AudioResourceSyncPlan {
    pub upsert: Vec<NativeResourceRecord>,
    pub retain: Vec<ResourceId>,
    pub release: Vec<ResourceId>,
}

impl AudioResourceSyncPlan {
    pub fn is_empty(&self) -> bool {
        self.upsert.is_empty() && self.retain.is_empty() && self.release.is_empty()
    }
}

pub fn plan_audio_resource_sync(
    ledger: &super::NativeResourceLedger,
    audio: Option<&AudioProjection>,
) -> AudioResourceSyncPlan {
    let requested = audio_resource_records(audio);
    let requested_ids = requested
        .iter()
        .map(|record| record.id.clone())
        .collect::<BTreeSet<_>>();
    let mut plan = AudioResourceSyncPlan::default();

    for record in requested {
        match ledger.get(record.id.clone()) {
            Some(existing) if audio_record_metadata_matches(existing, &record) => {
                plan.retain.push(record.id);
            }
            _ => plan
                .upsert
                .push(merge_existing_audio_record(ledger, record)),
        }
    }

    for record in ledger.records() {
        if is_audio_resource_kind(record.kind) && !requested_ids.contains(&record.id) {
            plan.release.push(record.id.clone());
        }
    }

    plan
}

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

fn audio_record_metadata_matches(
    existing: &NativeResourceRecord,
    next: &NativeResourceRecord,
) -> bool {
    existing.kind == next.kind
        && existing.owner_package_id == next.owner_package_id
        && existing.required_package_ids == next.required_package_ids
        && existing.memory == next.memory
        && existing.label == next.label
}

fn merge_existing_audio_record(
    ledger: &super::NativeResourceLedger,
    mut next: NativeResourceRecord,
) -> NativeResourceRecord {
    if let Some(existing) = ledger.get(next.id.clone()) {
        if existing.kind == next.kind
            && existing.owner_package_id == next.owner_package_id
            && existing.required_package_ids == next.required_package_ids
        {
            if is_zero_memory(next.memory) {
                next.memory = existing.memory;
            }
            if next.label.is_none() {
                next.label = existing.label.clone();
            }
        }
    }

    next
}

fn is_zero_memory(memory: ResourceMemory) -> bool {
    memory.cpu_bytes == 0 && memory.gpu_bytes == 0
}

fn is_audio_resource_kind(kind: NativeResourceKind) -> bool {
    matches!(
        kind,
        NativeResourceKind::AudioBuffer
            | NativeResourceKind::AudioStream
            | NativeResourceKind::AudioHandle
    )
}

#[cfg(test)]
mod tests;
