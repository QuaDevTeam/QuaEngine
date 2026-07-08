use std::fmt::{Display, Formatter};

use quajs_native_runtime::NativeRendererIntent;

use crate::audio::NativeAudioBackendError;
use crate::input::NativePointerEventResolution;
use crate::resources::NativeTextureUploadSyncPlan;
use crate::video::NativeVideoBackendError;

use super::super::backend::{NativeRenderBackendError, NativeRenderSubmission};
use super::super::resource_update::NativeRendererFrameUpdate;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameResult {
    pub update: NativeRendererFrameUpdate,
    pub submission: NativeRenderSubmission,
    pub texture_upload_sync: NativeTextureUploadSyncPlan,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeRendererFrameError {
    Render(NativeRenderBackendError),
    Audio(NativeAudioBackendError),
    Video(NativeVideoBackendError),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeRendererMediaBackendError {
    Audio(NativeAudioBackendError),
    Video(NativeVideoBackendError),
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererPointerEventDispatch {
    pub resolution: NativePointerEventResolution,
    pub emitted_intent: Option<NativeRendererIntent>,
}

impl From<NativeRenderBackendError> for NativeRendererFrameError {
    fn from(error: NativeRenderBackendError) -> Self {
        Self::Render(error)
    }
}

impl From<NativeAudioBackendError> for NativeRendererFrameError {
    fn from(error: NativeAudioBackendError) -> Self {
        Self::Audio(error)
    }
}

impl From<NativeVideoBackendError> for NativeRendererFrameError {
    fn from(error: NativeVideoBackendError) -> Self {
        Self::Video(error)
    }
}

impl From<NativeAudioBackendError> for NativeRendererMediaBackendError {
    fn from(error: NativeAudioBackendError) -> Self {
        Self::Audio(error)
    }
}

impl From<NativeVideoBackendError> for NativeRendererMediaBackendError {
    fn from(error: NativeVideoBackendError) -> Self {
        Self::Video(error)
    }
}

impl Display for NativeRendererMediaBackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Audio(error) => write!(formatter, "Audio backend error: {error}"),
            Self::Video(error) => write!(formatter, "Video backend error: {error}"),
        }
    }
}

impl std::error::Error for NativeRendererMediaBackendError {}
