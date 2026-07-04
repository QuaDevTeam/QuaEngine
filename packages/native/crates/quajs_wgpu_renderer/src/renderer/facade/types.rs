use quajs_native_runtime::NativeRendererIntent;

use crate::audio::NativeAudioBackendError;
use crate::input::NativePointerEventResolution;
use crate::resources::NativeTextureUploadSyncPlan;

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
