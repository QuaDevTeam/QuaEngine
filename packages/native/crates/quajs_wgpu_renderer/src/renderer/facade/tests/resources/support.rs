use crate::audio::AudioBackendTrackState;
use crate::projection::audio::{AudioTrackKind, AudioTrackLoadMode, AudioTrackPlaybackState};
use crate::resources::ResourceId;

pub(super) fn audio_track_state(package_id: &str) -> AudioBackendTrackState {
    AudioBackendTrackState {
        id: "bgm-main".to_string(),
        kind: AudioTrackKind::Bgm,
        asset_type: "bgm".to_string(),
        asset_name: "music/opening.ogg".to_string(),
        load_mode: AudioTrackLoadMode::Buffered,
        playback_state: AudioTrackPlaybackState::Playing,
        looped: false,
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
        package_candidates: [package_id.to_string()].into_iter().collect(),
        media_resource_id: ResourceId::from("audio:buffer:bgm:bgm:music/opening.ogg"),
        handle_resource_id: ResourceId::from("audio:handle:bgm:bgm:bgm-main"),
    }
}
