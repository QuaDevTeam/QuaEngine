use std::collections::BTreeSet;

use crate::audio::AudioBackendTrackStateMap;
use crate::fonts::FontBackendFaceStateMap;
use crate::frame::PreparedNativeFrame;
use crate::input::NativePointerInteractionState;
use crate::renderer::metrics::NativeRendererMetrics;
use crate::resources::{NativeResourceLedger, ResourceBudget, ResourceBudgetViolation};
use crate::video::{VideoBackendFrameResourceMap, VideoBackendStreamStateMap};

mod frame;
mod input;
mod lifecycle;

#[derive(Clone, Debug, Default)]
pub struct NativeRendererState {
    revision: u64,
    frame: Option<PreparedNativeFrame>,
    resources: NativeResourceLedger,
    pointer_interaction: NativePointerInteractionState,
    active_audio_resource_ids: BTreeSet<crate::resources::ResourceId>,
    active_font_resource_ids: BTreeSet<crate::resources::ResourceId>,
    audio_backend_tracks: AudioBackendTrackStateMap,
    font_backend_faces: FontBackendFaceStateMap,
    video_backend_streams: VideoBackendStreamStateMap,
    video_backend_frame_resources: VideoBackendFrameResourceMap,
}

impl NativeRendererState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn frame(&self) -> Option<&PreparedNativeFrame> {
        self.frame.as_ref()
    }

    pub fn resources(&self) -> &NativeResourceLedger {
        &self.resources
    }

    pub fn resources_mut(&mut self) -> &mut NativeResourceLedger {
        &mut self.resources
    }

    pub fn pointer_interaction(&self) -> &NativePointerInteractionState {
        &self.pointer_interaction
    }

    pub fn audio_backend_tracks(&self) -> &AudioBackendTrackStateMap {
        &self.audio_backend_tracks
    }

    pub(crate) fn replace_audio_backend_tracks(&mut self, tracks: AudioBackendTrackStateMap) {
        self.audio_backend_tracks = tracks;
    }

    pub fn font_backend_faces(&self) -> &FontBackendFaceStateMap {
        &self.font_backend_faces
    }

    pub(crate) fn replace_font_backend_faces(&mut self, faces: FontBackendFaceStateMap) {
        self.font_backend_faces = faces;
    }

    pub fn video_backend_streams(&self) -> &VideoBackendStreamStateMap {
        &self.video_backend_streams
    }

    pub(crate) fn replace_video_backend_streams(&mut self, streams: VideoBackendStreamStateMap) {
        self.video_backend_streams = streams;
    }

    pub fn video_backend_frame_resources(&self) -> &VideoBackendFrameResourceMap {
        &self.video_backend_frame_resources
    }

    pub(crate) fn replace_video_backend_frame_resources(
        &mut self,
        resources: VideoBackendFrameResourceMap,
    ) {
        self.video_backend_frame_resources = resources;
    }

    pub fn metrics(&self) -> NativeRendererMetrics {
        NativeRendererMetrics::from_state_with_audio_backend(
            self.revision,
            self.frame.as_ref(),
            &self.resources,
            &self.audio_backend_tracks,
        )
    }

    pub fn check_resource_budget(&self, budget: &ResourceBudget) -> Vec<ResourceBudgetViolation> {
        self.resources.check_budget(budget)
    }
}

#[derive(Clone, Debug, Default)]
pub(super) struct ActiveProjectionPackages {
    owner_package_ids: BTreeSet<String>,
    required_package_ids: BTreeSet<String>,
}
