use crate::projection::common::PackageProvenance;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioTrackPlaybackState {
    Playing,
    Paused,
    Stopped,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioTrackLoadMode {
    Buffered,
    Streamed,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AudioTrackMemoryEstimate {
    pub buffer_cpu_bytes: u64,
    pub stream_cpu_bytes: u64,
    pub handle_cpu_bytes: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioTrackProjection {
    pub id: String,
    pub kind: AudioTrackKind,
    pub asset_name: String,
    pub asset_type: String,
    pub load_mode: AudioTrackLoadMode,
    pub playback_state: AudioTrackPlaybackState,
    pub looped: bool,
    pub volume: f32,
    pub memory: AudioTrackMemoryEstimate,
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

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AudioProjection {
    pub tracks: Vec<AudioTrackProjection>,
}

impl AudioProjection {
    pub fn new(tracks: Vec<AudioTrackProjection>) -> Self {
        Self { tracks }
    }
}
