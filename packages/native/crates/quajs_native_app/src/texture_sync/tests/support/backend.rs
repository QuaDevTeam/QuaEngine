use quajs_wgpu_renderer::audio::{
    AudioBackendCommandPlan, NativeAudioBackend, NativeAudioBackendError, NativeAudioBackendResult,
};
use quajs_wgpu_renderer::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
};
use quajs_wgpu_renderer::resources::{NativeTextureUploadRequest, ResourceId};

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
pub(crate) struct RejectingAfterFirstAudioBackend {
    accepted_plan_count: usize,
}

impl NativeAudioBackend for RejectingAfterFirstAudioBackend {
    fn apply_audio_commands(
        &mut self,
        _plan: &AudioBackendCommandPlan,
    ) -> NativeAudioBackendResult {
        if self.accepted_plan_count == 0 {
            self.accepted_plan_count += 1;
            return Ok(());
        }

        Err(NativeAudioBackendError::backend_rejected(
            "test audio backend rejected plan",
        ))
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
