use std::collections::BTreeMap;
use std::fmt::{Debug, Formatter};
use std::io::Cursor;

use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendTrackState, NativeAudioBackendError,
};
use quajs_wgpu_renderer::projection::audio::AudioTrackPlaybackState;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};

use super::playback::{NativeAudioPlaybackBackend, NativeAudioPlaybackDriver};

pub(crate) type RodioNativeAudioBackend = NativeAudioPlaybackBackend<RodioAudioPlaybackDriver>;

impl RodioNativeAudioBackend {
    pub(crate) fn open_default() -> Result<Self, NativeAudioBackendError> {
        RodioAudioPlaybackDriver::open_default().map(Self::new)
    }
}

pub(crate) struct RodioAudioPlaybackDriver {
    sink: MixerDeviceSink,
    players: BTreeMap<String, Player>,
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
        let sink = DeviceSinkBuilder::open_default_sink().map_err(|error| {
            NativeAudioBackendError::backend_rejected(format!(
                "failed to open native rodio audio output: {error}"
            ))
        })?;
        Ok(Self {
            sink,
            players: BTreeMap::new(),
        })
    }

    fn apply_track_controls(player: &Player, track: &AudioBackendTrackState) {
        player.set_volume(track.volume.max(0.0));
        match track.playback_state {
            AudioTrackPlaybackState::Playing => player.play(),
            AudioTrackPlaybackState::Paused => player.pause(),
            AudioTrackPlaybackState::Stopped => player.stop(),
        }
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
        if track.looped {
            let source = Decoder::new_looped(Cursor::new(load.bytes.clone()))
                .map_err(|error| format!("failed to decode looped native audio asset: {error}"))?;
            player.append(source);
        } else {
            let source = Decoder::try_from(Cursor::new(load.bytes.clone()))
                .map_err(|error| format!("failed to decode native audio asset: {error}"))?;
            player.append(source);
        }
        Self::apply_track_controls(&player, track);
        self.players.insert(track.id.clone(), player);
        Ok(())
    }

    fn update_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        let Some(player) = self.players.get(&track.id) else {
            return Err(format!(
                "cannot update native audio track \"{}\" because it is not active",
                track.id
            ));
        };
        Self::apply_track_controls(player, track);
        Ok(())
    }

    fn stop_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        if let Some(player) = self.players.get(&track.id) {
            player.stop();
        }
        Ok(())
    }

    fn release_track(&mut self, track: &AudioBackendTrackState) -> Result<(), String> {
        if let Some(player) = self.players.remove(&track.id) {
            player.stop();
        }
        Ok(())
    }
}
