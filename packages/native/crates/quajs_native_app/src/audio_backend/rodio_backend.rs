use std::collections::BTreeMap;
use std::fmt::{Debug, Formatter};
use std::io::Cursor;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendTrackState, AudioBackendTrackStateMap,
    NativeAudioBackendError, NativeAudioBackendEvent,
};
use quajs_wgpu_renderer::projection::audio::AudioTrackPlaybackState;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};

use super::dsp::{ProcessedSource, ProcessingControls};
use super::playback::{NativeAudioPlaybackBackend, NativeAudioPlaybackDriver};

pub(crate) type RodioNativeAudioBackend = NativeAudioPlaybackBackend<RodioAudioPlaybackDriver>;

impl RodioNativeAudioBackend {
    pub(crate) fn open_default() -> Result<Self, NativeAudioBackendError> {
        RodioAudioPlaybackDriver::open_default().map(Self::new)
    }
}

pub(crate) struct RodioAudioPlaybackDriver {
    sink: MixerDeviceSink,
    processing: ProcessingControls,
    players: BTreeMap<String, RodioAudioTrackRuntime>,
}

impl Debug for RodioAudioPlaybackDriver {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RodioAudioPlaybackDriver")
            .field("player_count", &self.players.len())
            .finish_non_exhaustive()
    }
}

impl RodioAudioPlaybackDriver {
    fn open_default() -> Result<Self, NativeAudioBackendError> {
        let mut sink = DeviceSinkBuilder::open_default_sink().map_err(|error| {
            NativeAudioBackendError::backend_rejected(format!(
                "failed to open native rodio audio output: {error}"
            ))
        })?;
        sink.log_on_drop(false);
        Ok(Self {
            sink,
            processing: ProcessingControls::default(),
            players: BTreeMap::new(),
        })
    }

    fn apply_track_seek(
        player: &Player,
        track: &AudioBackendTrackState,
        apply_initial_offset: bool,
    ) -> Result<(), String> {
        if let Some(seek_ms) = track.seek_ms.or(if apply_initial_offset {
            track.offset_ms
        } else {
            None
        }) {
            if !seek_ms.is_finite() || seek_ms < 0.0 {
                return Err(format!(
                    "native audio track \"{}\" has an unsafe seek position",
                    track.id
                ));
            }
            player
                .try_seek(Duration::from_secs_f64(seek_ms / 1000.0))
                .map_err(|error| {
                    format!(
                        "failed to seek native audio track \"{}\": {error}",
                        track.id
                    )
                })?;
        }
        Ok(())
    }
}

impl NativeAudioPlaybackDriver for RodioAudioPlaybackDriver {
    fn start_track(
        &mut self,
        track: &AudioBackendTrackState,
        load: &AudioBackendAssetLoad,
    ) -> Result<(), String> {
        self.release_track(track)?;
        let player = Player::connect_new(self.sink.mixer());
        self.processing.update(&track.processing);
        player.pause();
        if track.looped {
            let source = Decoder::new_looped(Cursor::new(load.bytes.clone()))
                .map_err(|error| format!("failed to decode looped native audio asset: {error}"))?;
            player.append(ProcessedSource::new(
                source,
                &track.processing,
                self.processing.clone(),
            ));
        } else {
            let source = Decoder::try_from(Cursor::new(load.bytes.clone()))
                .map_err(|error| format!("failed to decode native audio asset: {error}"))?;
            player.append(ProcessedSource::new(
                source,
                &track.processing,
                self.processing.clone(),
            ));
        }
        Self::apply_track_seek(&player, track, true)?;
        let now_ms = current_native_audio_timestamp_ms();
        let mut runtime = RodioAudioTrackRuntime::new(player, track, now_ms);
        runtime.apply_player_controls(now_ms);
        self.players.insert(track.id.clone(), runtime);
        Ok(())
    }

    fn update_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        let Some(runtime) = self.players.get_mut(&track.id) else {
            return Err(format!(
                "cannot update native audio track \"{}\" because it is not active",
                track.id
            ));
        };
        if runtime.schedule.track.seek_ms != track.seek_ms {
            Self::apply_track_seek(&runtime.player, track, false)?;
        }
        self.processing.update(&track.processing);
        let now_ms = current_native_audio_timestamp_ms();
        runtime.update_track(track, now_ms);
        runtime.apply_player_controls(now_ms);
        Ok(())
    }

    fn stop_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        if let Some(runtime) = self.players.get(&track.id) {
            runtime.player.stop();
        }
        Ok(())
    }

    fn release_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        if let Some(runtime) = self.players.remove(&track.id) {
            runtime.player.stop();
        }
        let ids: Vec<String> = self
            .players
            .values()
            .flat_map(|r| r.schedule.track.processing.iter().map(|s| s.id.clone()))
            .collect();
        self.processing.retain(&ids);
        Ok(())
    }

    fn drain_audio_events(
        &mut self,
        active_tracks: &AudioBackendTrackStateMap,
    ) -> Result<Vec<NativeAudioBackendEvent>, String> {
        let now_ms = current_native_audio_timestamp_ms();
        for runtime in self.players.values_mut() {
            runtime.apply_player_controls(now_ms);
        }
        let natural_finished_ids: Vec<String> = active_tracks
            .values()
            .filter(|track| {
                !track.looped
                    && matches!(track.playback_state, AudioTrackPlaybackState::Playing)
                    && self
                        .players
                        .get(&track.id)
                        .map(|runtime| runtime.player.empty())
                        .unwrap_or(false)
            })
            .map(|track| track.id.clone())
            .collect();

        let stopped_finished_ids: Vec<String> = self
            .players
            .iter()
            .filter(|(_, runtime)| runtime.is_stopped_after_fade())
            .map(|(track_id, _)| track_id.clone())
            .collect();

        let mut events =
            Vec::with_capacity(natural_finished_ids.len() + stopped_finished_ids.len());
        for track_id in natural_finished_ids {
            self.players.remove(&track_id);
            if let Some(track) = active_tracks.get(&track_id) {
                events.push(NativeAudioBackendEvent::TrackEnded {
                    track: track.clone(),
                    reason: "natural".to_string(),
                });
            }
        }
        for track_id in stopped_finished_ids {
            if self.players.remove(&track_id).is_some() {
                if let Some(track) = active_tracks.get(&track_id) {
                    events.push(NativeAudioBackendEvent::TrackEnded {
                        track: track.clone(),
                        reason: "stopped".to_string(),
                    });
                }
            }
        }
        Ok(events)
    }
}

struct RodioAudioTrackRuntime {
    player: Player,
    schedule: RodioAudioTrackSchedule,
}

impl RodioAudioTrackRuntime {
    fn new(player: Player, track: &AudioBackendTrackState, now_ms: f64) -> Self {
        Self {
            player,
            schedule: RodioAudioTrackSchedule::new(track, now_ms),
        }
    }

    fn update_track(&mut self, track: &AudioBackendTrackState, now_ms: f64) {
        self.schedule.update_track(track, now_ms);
    }

    fn apply_player_controls(&mut self, now_ms: f64) {
        self.schedule.apply_player_controls(&self.player, now_ms);
    }

    fn is_stopped_after_fade(&self) -> bool {
        self.schedule.stopped_after_fade
    }
}

#[derive(Clone, Debug)]
struct RodioAudioTrackSchedule {
    track: AudioBackendTrackState,
    scheduled_start_ms: f64,
    fade_out_started_at_ms: Option<f64>,
    stopped_after_fade: bool,
}

impl RodioAudioTrackSchedule {
    fn new(track: &AudioBackendTrackState, now_ms: f64) -> Self {
        Self {
            track: track.clone(),
            scheduled_start_ms: scheduled_start_ms(track, now_ms),
            fade_out_started_at_ms: matches!(
                track.playback_state,
                AudioTrackPlaybackState::Stopping
            )
            .then_some(now_ms),
            stopped_after_fade: false,
        }
    }

    fn update_track(&mut self, track: &AudioBackendTrackState, now_ms: f64) {
        let previous = self.track.clone();
        self.track = track.clone();
        if previous.play_at != track.play_at
            || previous.delay_ms != track.delay_ms
            || (previous.playback_state != AudioTrackPlaybackState::Playing
                && track.playback_state == AudioTrackPlaybackState::Playing)
        {
            self.scheduled_start_ms = scheduled_start_ms(track, now_ms);
        }
        if track.playback_state == AudioTrackPlaybackState::Stopping {
            if previous.playback_state != AudioTrackPlaybackState::Stopping
                || self.fade_out_started_at_ms.is_none()
            {
                self.fade_out_started_at_ms = Some(now_ms);
                self.stopped_after_fade = false;
            }
        } else {
            self.fade_out_started_at_ms = None;
            self.stopped_after_fade = false;
        }
    }

    fn apply_player_controls(&mut self, player: &Player, now_ms: f64) {
        player.set_volume(self.effective_volume(now_ms));
        match self.track.playback_state {
            AudioTrackPlaybackState::Playing => {
                if now_ms >= self.scheduled_start_ms {
                    player.play();
                } else {
                    player.pause();
                }
            }
            AudioTrackPlaybackState::Paused => player.pause(),
            AudioTrackPlaybackState::Stopping => {
                if now_ms < self.scheduled_start_ms || self.fade_out_duration_ms() <= 0.0 {
                    player.stop();
                    self.stopped_after_fade = true;
                    return;
                }
                let fade_out_started_at_ms = *self.fade_out_started_at_ms.get_or_insert(now_ms);
                if fade_progress(now_ms, fade_out_started_at_ms, self.fade_out_duration_ms()) >= 1.0
                {
                    player.stop();
                    self.stopped_after_fade = true;
                } else {
                    player.play();
                }
            }
            AudioTrackPlaybackState::Stopped => {
                player.stop();
                self.stopped_after_fade = true;
            }
        }
    }

    fn effective_volume(&self, now_ms: f64) -> f32 {
        let mut volume = self.track.volume.max(0.0);
        // Processing stages own the full gain chain when supplied by the TS bridge.
        if !self.track.processing.is_empty() {
            volume = 1.0;
        }
        if matches!(self.track.playback_state, AudioTrackPlaybackState::Playing)
            && self.fade_in_duration_ms() > 0.0
        {
            volume *= fade_progress(now_ms, self.scheduled_start_ms, self.fade_in_duration_ms());
        }
        if matches!(self.track.playback_state, AudioTrackPlaybackState::Stopping) {
            let fade_out_ms = self.fade_out_duration_ms();
            if fade_out_ms <= 0.0 {
                return 0.0;
            }
            if let Some(started_at_ms) = self.fade_out_started_at_ms {
                volume *= 1.0 - fade_progress(now_ms, started_at_ms, fade_out_ms);
            }
        }
        volume.clamp(0.0, 16.0)
    }

    fn fade_in_duration_ms(&self) -> f32 {
        positive_duration_ms(self.track.fade_in_ms)
    }

    fn fade_out_duration_ms(&self) -> f32 {
        positive_duration_ms(self.track.fade_out_ms)
    }
}

fn scheduled_start_ms(track: &AudioBackendTrackState, now_ms: f64) -> f64 {
    if let Some(play_at) = track.play_at {
        return play_at.max(0.0);
    }
    now_ms + f64::from(positive_duration_ms(track.delay_ms))
}

fn positive_duration_ms(value: Option<f64>) -> f32 {
    value
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value as f32)
        .unwrap_or(0.0)
}

fn fade_progress(now_ms: f64, started_at_ms: f64, duration_ms: f32) -> f32 {
    if duration_ms <= 0.0 {
        return 1.0;
    }
    (((now_ms - started_at_ms) / f64::from(duration_ms)) as f32).clamp(0.0, 1.0)
}

fn current_native_audio_timestamp_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use quajs_wgpu_renderer::projection::audio::{
        AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState,
    };
    use quajs_wgpu_renderer::resources::ResourceId;

    use super::*;

    #[test]
    fn schedule_uses_play_at_before_delay() {
        let mut track = track("bgm-main");
        track.play_at = Some(2_000.0);
        track.delay_ms = Some(750.0);

        assert_eq!(scheduled_start_ms(&track, 1_000.0), 2_000.0);
    }

    #[test]
    fn schedule_resolves_delay_relative_to_command_time() {
        let mut track = track("bgm-main");
        track.delay_ms = Some(750.0);

        assert_eq!(scheduled_start_ms(&track, 1_000.0), 1_750.0);
    }

    #[test]
    fn schedule_applies_fade_in_and_fade_out_volume_curves() {
        let mut track = track("bgm-main");
        track.volume = 0.8;
        track.fade_in_ms = Some(400.0);
        let mut schedule = RodioAudioTrackSchedule::new(&track, 1_000.0);

        assert_eq!(schedule.effective_volume(1_000.0), 0.0);
        assert!((schedule.effective_volume(1_200.0) - 0.4).abs() < f32::EPSILON);
        assert!((schedule.effective_volume(1_400.0) - 0.8).abs() < f32::EPSILON);

        let mut stopping = track.clone();
        stopping.playback_state = AudioTrackPlaybackState::Stopping;
        stopping.fade_out_ms = Some(200.0);
        schedule.update_track(&stopping, 1_500.0);

        assert!((schedule.effective_volume(1_500.0) - 0.8).abs() < f32::EPSILON);
        assert!((schedule.effective_volume(1_600.0) - 0.4).abs() < f32::EPSILON);
        assert_eq!(schedule.effective_volume(1_700.0), 0.0);
    }

    fn track(id: &str) -> AudioBackendTrackState {
        AudioBackendTrackState {
            id: id.to_string(),
            kind: AudioTrackKind::Bgm,
            asset_type: "bgm".to_string(),
            asset_name: "music/opening.ogg".to_string(),
            load_mode: AudioTrackLoadMode::Buffered,
            playback_state: AudioTrackPlaybackState::Playing,
            looped: true,
            volume: 1.0,
            duration_ms: None,
            fade_in_ms: None,
            fade_out_ms: None,
            crossfade_ms: None,
            play_at: None,
            delay_ms: None,
            seek_ms: None,
            offset_ms: None,
            processing: Vec::new(),
            package_candidates: ["runtime.audio"].into_iter().map(String::from).collect(),
            media_resource_id: ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
            handle_resource_id: ResourceId::from(format!("audio:handle:bgm:bgm:{id}")),
        }
    }
}
