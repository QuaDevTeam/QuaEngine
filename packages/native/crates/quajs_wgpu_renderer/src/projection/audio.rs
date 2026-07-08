use crate::projection::common::PackageProvenance;

use serde::{Deserialize, Serialize};

use crate::projection::defaults::default_one_f32;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioTrackKind {
    Bgm,
    Voice,
    Sfx,
    Ambient,
}

impl AudioTrackKind {
    pub fn resource_prefix(self) -> &'static str {
        match self {
            Self::Bgm => "bgm",
            Self::Voice => "voice",
            Self::Sfx => "sfx",
            Self::Ambient => "ambient",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioTrackPlaybackState {
    Playing,
    Paused,
    Stopping,
    Stopped,
}

impl Default for AudioTrackPlaybackState {
    fn default() -> Self {
        Self::Playing
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioTrackLoadMode {
    Buffered,
    Streamed,
}

impl Default for AudioTrackLoadMode {
    fn default() -> Self {
        Self::Buffered
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrackMemoryEstimate {
    #[serde(default)]
    pub buffer_cpu_bytes: u64,
    #[serde(default)]
    pub stream_cpu_bytes: u64,
    #[serde(default)]
    pub handle_cpu_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrackProjection {
    pub id: String,
    pub kind: AudioTrackKind,
    pub asset_name: String,
    #[serde(default = "default_audio_asset_type")]
    pub asset_type: String,
    #[serde(default)]
    pub load_mode: AudioTrackLoadMode,
    #[serde(default)]
    pub playback_state: AudioTrackPlaybackState,
    #[serde(default)]
    pub looped: bool,
    #[serde(default = "default_one_f32")]
    pub volume: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_in_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crossfade_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_at: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seek_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset_ms: Option<f64>,
    #[serde(default)]
    pub memory: AudioTrackMemoryEstimate,
    #[serde(default, skip_serializing_if = "PackageProvenance::is_empty")]
    pub provenance: PackageProvenance,
}

impl AudioTrackProjection {
    pub fn new(id: impl Into<String>, kind: AudioTrackKind, asset_name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            kind,
            asset_name: asset_name.into(),
            asset_type: kind.resource_prefix().to_string(),
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
            memory: AudioTrackMemoryEstimate::default(),
            provenance: PackageProvenance::default(),
        }
    }

    pub fn streamed(mut self) -> Self {
        self.load_mode = AudioTrackLoadMode::Streamed;
        self
    }

    pub fn memory(mut self, memory: AudioTrackMemoryEstimate) -> Self {
        self.memory = memory;
        self
    }

    pub fn with_provenance(mut self, provenance: PackageProvenance) -> Self {
        self.provenance = provenance;
        self
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProjection {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tracks: Vec<AudioTrackProjection>,
}

impl AudioProjection {
    pub fn new(tracks: Vec<AudioTrackProjection>) -> Self {
        Self { tracks }
    }
}

fn default_audio_asset_type() -> String {
    "bgm".to_string()
}
