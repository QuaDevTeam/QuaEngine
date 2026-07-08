use std::collections::BTreeMap;

use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendCommand, AudioBackendCommandKind, AudioBackendCommandPlan,
    AudioBackendTrackState, AudioBackendTrackStateMap, NativeAudioBackend, NativeAudioBackendError,
    NativeAudioBackendEvent, NativeAudioBackendEventDrainResult, NativeAudioBackendResult,
};
use quajs_wgpu_renderer::resources::ResourceId;

pub(crate) trait NativeAudioPlaybackDriver {
    fn start_track(
        &mut self,
        track: &AudioBackendTrackState,
        load: &AudioBackendAssetLoad,
    ) -> Result<(), String>;

    fn update_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String>;

    fn stop_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String>;

    fn release_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String>;

    fn drain_finished_tracks(
        &mut self,
        _active_tracks: &AudioBackendTrackStateMap,
    ) -> Result<Vec<AudioBackendTrackState>, String> {
        Ok(Vec::new())
    }

    fn drain_audio_events(
        &mut self,
        active_tracks: &AudioBackendTrackStateMap,
    ) -> Result<Vec<NativeAudioBackendEvent>, String> {
        self.drain_finished_tracks(active_tracks).map(|tracks| {
            tracks
                .into_iter()
                .map(|track| NativeAudioBackendEvent::TrackEnded {
                    track,
                    reason: "natural".to_string(),
                })
                .collect()
        })
    }
}

#[derive(Debug)]
pub(crate) struct NativeAudioPlaybackBackend<D> {
    driver: D,
    loaded_assets: BTreeMap<ResourceId, AudioBackendAssetLoad>,
    active_tracks: AudioBackendTrackStateMap,
    diagnostics: NativeAudioPlaybackBackendDiagnostics,
}

impl<D> NativeAudioPlaybackBackend<D> {
    pub(crate) fn new(driver: D) -> Self {
        Self {
            driver,
            loaded_assets: BTreeMap::new(),
            active_tracks: AudioBackendTrackStateMap::new(),
            diagnostics: NativeAudioPlaybackBackendDiagnostics::default(),
        }
    }

    #[allow(dead_code)]
    pub(crate) fn driver(&self) -> &D {
        &self.driver
    }

    pub(crate) fn diagnostics(&self) -> &NativeAudioPlaybackBackendDiagnostics {
        &self.diagnostics
    }
}

impl<D> NativeAudioBackend for NativeAudioPlaybackBackend<D>
where
    D: NativeAudioPlaybackDriver,
{
    fn wants_audio_asset_loads(&self) -> bool {
        true
    }

    fn apply_audio_asset_loads(
        &mut self,
        loads: &[AudioBackendAssetLoad],
    ) -> NativeAudioBackendResult {
        self.diagnostics.applied_asset_load_batch_count = self
            .diagnostics
            .applied_asset_load_batch_count
            .saturating_add(1);
        self.diagnostics.applied_asset_load_count = self
            .diagnostics
            .applied_asset_load_count
            .saturating_add(loads.len());
        for load in loads {
            self.loaded_assets
                .insert(load.resource_id.clone(), load.clone());
        }
        self.diagnostics.loaded_asset_count = self.loaded_assets.len();
        Ok(())
    }

    fn apply_audio_commands(&mut self, plan: &AudioBackendCommandPlan) -> NativeAudioBackendResult {
        self.diagnostics.applied_plan_count = self.diagnostics.applied_plan_count.saturating_add(1);
        self.diagnostics.applied_command_count = self
            .diagnostics
            .applied_command_count
            .saturating_add(plan.commands.len());

        for command in &plan.commands {
            self.apply_audio_command(command)?;
        }

        self.active_tracks = plan.next_tracks.clone();
        self.diagnostics.active_track_count = self.active_tracks.len();
        self.diagnostics.loaded_asset_count = self.loaded_assets.len();
        Ok(())
    }

    fn drain_audio_events(&mut self) -> NativeAudioBackendEventDrainResult {
        let events = self
            .driver
            .drain_audio_events(&self.active_tracks)
            .map_err(NativeAudioBackendError::backend_rejected)?;
        for event in &events {
            let NativeAudioBackendEvent::TrackEnded { track, .. } = event;
            self.active_tracks.remove(&track.id);
        }
        self.diagnostics.active_track_count = self.active_tracks.len();
        Ok(events)
    }
}

impl<D> NativeAudioPlaybackBackend<D>
where
    D: NativeAudioPlaybackDriver,
{
    fn apply_audio_command(&mut self, command: &AudioBackendCommand) -> NativeAudioBackendResult {
        let Some(track) = command.track.as_ref() else {
            return Err(NativeAudioBackendError::backend_rejected(format!(
                "Native audio playback command for track \"{}\" is missing track metadata.",
                command.track_id
            )));
        };

        match command.kind {
            AudioBackendCommandKind::LoadAsset => Ok(()),
            AudioBackendCommandKind::StartTrack => {
                let Some(load) = self.loaded_assets.get(&track.media_resource_id) else {
                    return Err(NativeAudioBackendError::backend_rejected(format!(
                        "Native audio playback cannot start track \"{}\" because asset \"{}\" has not been loaded.",
                        track.id, track.asset_name
                    )));
                };
                self.driver
                    .start_track(track, load)
                    .map_err(NativeAudioBackendError::backend_rejected)
            }
            AudioBackendCommandKind::UpdateTrack => self
                .driver
                .update_track(track)
                .map_err(NativeAudioBackendError::backend_rejected),
            AudioBackendCommandKind::StopTrack => self
                .driver
                .stop_track(track)
                .map_err(NativeAudioBackendError::backend_rejected),
            AudioBackendCommandKind::ReleaseHandle => {
                self.driver
                    .release_track(track)
                    .map_err(NativeAudioBackendError::backend_rejected)?;
                self.loaded_assets.remove(&track.media_resource_id);
                Ok(())
            }
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeAudioPlaybackBackendDiagnostics {
    pub(crate) applied_asset_load_batch_count: usize,
    pub(crate) applied_asset_load_count: usize,
    pub(crate) loaded_asset_count: usize,
    pub(crate) applied_plan_count: usize,
    pub(crate) applied_command_count: usize,
    pub(crate) active_track_count: usize,
}
