use std::collections::{BTreeMap, BTreeSet};

use crate::projection::audio::{
    AudioProjection, AudioTrackLoadMode, AudioTrackPlaybackState, AudioTrackProjection,
};

use super::assets::{NativeAssetRequest, NativeAssetRequestPlan};
use super::ledger::NativeResourceLedger;
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
    ledger: &NativeResourceLedger,
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

pub fn plan_audio_asset_requests(
    ledger: &NativeResourceLedger,
    sync: &AudioResourceSyncPlan,
) -> NativeAssetRequestPlan {
    let mut requests = BTreeMap::<(String, String), NativeAssetRequest>::new();
    let mut skipped_resource_ids = Vec::new();

    for record in sync
        .upsert
        .iter()
        .chain(sync.retain.iter().filter_map(|id| ledger.get(id.clone())))
    {
        let Some((asset_type, asset_name)) = parse_audio_asset_resource_id(&record.id) else {
            skipped_resource_ids.push(record.id.clone());
            continue;
        };
        let key = (asset_type.clone(), asset_name.clone());
        let request = requests.entry(key).or_insert_with(|| NativeAssetRequest {
            resource_id: record.id.clone(),
            asset_type,
            asset_name,
            kind: record.kind,
            command_ids: BTreeSet::new(),
            package_candidates: BTreeSet::new(),
        });
        request.kind = merge_audio_asset_kind(request.kind, record.kind);
        request
            .package_candidates
            .extend(audio_package_candidates(record));
    }

    NativeAssetRequestPlan {
        requests: requests.into_values().collect(),
        skipped_resource_ids,
    }
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

fn parse_audio_asset_resource_id(resource_id: &ResourceId) -> Option<(String, String)> {
    let mut parts = resource_id.as_str().splitn(5, ':');
    let namespace = parts.next()?;
    let resource_kind = parts.next()?;
    let _track_kind = parts.next()?;
    let asset_type = parts.next()?;
    let asset_name = parts.next()?;

    if namespace != "audio" || matches!(resource_kind, "handle") {
        return None;
    }
    if asset_type.is_empty() || asset_name.is_empty() {
        return None;
    }

    Some((asset_type.to_string(), asset_name.to_string()))
}

fn audio_package_candidates(record: &NativeResourceRecord) -> BTreeSet<String> {
    let mut candidates = record.required_package_ids.clone();
    if let Some(package_id) = &record.owner_package_id {
        candidates.insert(package_id.clone());
    }
    candidates
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
    ledger: &NativeResourceLedger,
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

fn merge_audio_asset_kind(
    existing: NativeResourceKind,
    incoming: NativeResourceKind,
) -> NativeResourceKind {
    if existing == incoming {
        existing
    } else if existing == NativeResourceKind::Other {
        incoming
    } else if incoming == NativeResourceKind::Other {
        existing
    } else {
        NativeResourceKind::Other
    }
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
