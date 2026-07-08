use quajs_wgpu_renderer::audio::{
    AudioBackendAssetLoad, AudioBackendCommandPlan, NativeAudioBackend, NativeAudioBackendError,
    NativeAudioBackendResult,
};
use quajs_wgpu_renderer::fonts::{
    FontBackendAssetLoad, FontBackendCommandPlan, NativeFontBackend, NativeFontBackendResult,
};
use quajs_wgpu_renderer::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
};
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};
use quajs_wgpu_renderer::video::{
    NativeVideoBackend, NativeVideoBackendResult, VideoBackendAssetLoad, VideoBackendCommandPlan,
};

use crate::texture_sync::{NativeTextureUploadMetadata, NativeTextureUploadSink};

#[derive(Default)]
pub(crate) struct RecordingTextureUploadSink {
    pub(crate) uploads: Vec<RecordedTextureUpload>,
    fail: bool,
}

impl NativeTextureUploadSink for RecordingTextureUploadSink {
    type Error = String;

    fn upload_texture_bytes(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        if self.fail {
            return Err("upload failed".to_string());
        }
        self.uploads.push(RecordedTextureUpload {
            resource_id: request.resource_id.clone(),
            bytes: bytes.to_vec(),
            metadata,
        });
        Ok(())
    }
}

pub(crate) struct RejectingAudioBackend;

impl NativeAudioBackend for RejectingAudioBackend {
    fn apply_audio_commands(
        &mut self,
        _plan: &AudioBackendCommandPlan,
    ) -> NativeAudioBackendResult {
        Err(NativeAudioBackendError::backend_rejected(
            "test audio backend rejected plan",
        ))
    }
}

#[derive(Default)]
pub(crate) struct AssetLoadingAudioBackend {
    pub(crate) events: Vec<&'static str>,
    pub(crate) loads: Vec<AudioBackendAssetLoad>,
    pub(crate) plans: Vec<AudioBackendCommandPlan>,
}

impl NativeAudioBackend for AssetLoadingAudioBackend {
    fn wants_audio_asset_loads(&self) -> bool {
        true
    }

    fn apply_audio_asset_loads(
        &mut self,
        loads: &[AudioBackendAssetLoad],
    ) -> NativeAudioBackendResult {
        self.events.push("loads");
        self.loads.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_audio_commands(&mut self, plan: &AudioBackendCommandPlan) -> NativeAudioBackendResult {
        self.events.push("commands");
        self.plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Default)]
pub(crate) struct AssetLoadingVideoBackend {
    pub(crate) events: Vec<&'static str>,
    pub(crate) loads: Vec<VideoBackendAssetLoad>,
    pub(crate) plans: Vec<VideoBackendCommandPlan>,
}

impl NativeVideoBackend for AssetLoadingVideoBackend {
    fn wants_video_asset_loads(&self) -> bool {
        true
    }

    fn apply_video_asset_loads(
        &mut self,
        loads: &[VideoBackendAssetLoad],
    ) -> NativeVideoBackendResult {
        self.events.push("loads");
        self.loads.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_video_commands(&mut self, plan: &VideoBackendCommandPlan) -> NativeVideoBackendResult {
        self.events.push("commands");
        self.plans.push(plan.clone());
        Ok(())
    }
}

#[derive(Default)]
pub(crate) struct AssetLoadingFontBackend {
    pub(crate) events: Vec<&'static str>,
    pub(crate) loads: Vec<FontBackendAssetLoad>,
    pub(crate) plans: Vec<FontBackendCommandPlan>,
}

impl NativeFontBackend for AssetLoadingFontBackend {
    fn wants_font_asset_loads(&self) -> bool {
        true
    }

    fn apply_font_asset_loads(
        &mut self,
        loads: &[FontBackendAssetLoad],
    ) -> NativeFontBackendResult {
        self.events.push("loads");
        self.loads.extend(loads.iter().cloned());
        Ok(())
    }

    fn apply_font_commands(&mut self, plan: &FontBackendCommandPlan) -> NativeFontBackendResult {
        self.events.push("commands");
        self.plans.push(plan.clone());
        Ok(())
    }
}

pub(crate) struct RecordedTextureUpload {
    pub(crate) resource_id: ResourceId,
    pub(crate) bytes: Vec<u8>,
    pub(crate) metadata: NativeTextureUploadMetadata,
}

#[derive(Default)]
pub(crate) struct TextureResidentBackend {
    pub(crate) submissions: Vec<NativeRenderSubmission>,
    pub(crate) uploads: Vec<RecordedTextureUpload>,
    pub(crate) released_resource_ids: Vec<ResourceId>,
    pub(crate) resident_resource_ids: Vec<String>,
    pub(crate) fail_upload: bool,
    pub(crate) fail_release: bool,
}

impl NativeRenderBackend for TextureResidentBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }

    fn resident_texture_resource_ids(&self) -> Vec<String> {
        self.resident_resource_ids.clone()
    }
}

impl NativeTextureUploadSink for TextureResidentBackend {
    type Error = String;

    fn upload_texture_bytes(
        &mut self,
        request: &NativeTextureUploadRequest,
        bytes: &[u8],
        metadata: NativeTextureUploadMetadata,
    ) -> Result<(), Self::Error> {
        if self.fail_upload {
            return Err("upload failed".to_string());
        }
        self.uploads.push(RecordedTextureUpload {
            resource_id: request.resource_id.clone(),
            bytes: bytes.to_vec(),
            metadata,
        });
        self.resident_resource_ids
            .push(request.resource_id.as_str().to_string());
        Ok(())
    }

    fn release_texture_resource(&mut self, resource_id: &ResourceId) -> Result<bool, Self::Error> {
        if self.fail_release {
            return Err("release failed".to_string());
        }
        let before = self.resident_resource_ids.len();
        self.resident_resource_ids
            .retain(|resident| resident != resource_id.as_str());
        if self.resident_resource_ids.len() == before {
            return Ok(false);
        }
        self.released_resource_ids.push(resource_id.clone());
        Ok(true)
    }
}
