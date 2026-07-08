use quajs_native_runtime::{NativeHostApi, NativeHostApiResult};

use crate::audio::NullNativeAudioBackend;
use crate::input::{
    native_renderer_intent_from_hit, NativePointerEvent, NativePointerEventResolution,
    PointerIntentResolution, RendererIntentHit,
};
use crate::projection::view::ViewProjection;
use crate::renderer::metrics::NativeRendererMetrics;
use crate::resources::{
    plan_texture_upload_sync, NativeResourceLedger, NativeResourceRecord,
    NativeTextureUploadSyncPlan, PackageUnloadPlan, ResourceBudget, ResourceBudgetViolation,
};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};
use crate::video::NullNativeVideoBackend;

use super::super::backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendResult,
};
use super::super::resource_update::{
    NativeRendererFrameUpdate, NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
};
use super::super::state::NativeRendererState;
use super::{NativeRenderer, NativeRendererFrameResult, NativeRendererPointerEventDispatch};

impl<B> NativeRenderer<B, ()>
where
    B: NativeRenderBackend,
{
    pub fn new(backend: B) -> Self {
        Self {
            state: NativeRendererState::new(),
            backend,
            audio_backend: None,
            video_backend: None,
        }
    }

    pub fn with_state(state: NativeRendererState, backend: B) -> Self {
        Self {
            state,
            backend,
            audio_backend: None,
            video_backend: None,
        }
    }

    pub fn with_null_audio_backend(backend: B) -> NativeRenderer<B, NullNativeAudioBackend> {
        NativeRenderer::<B, NullNativeAudioBackend>::with_audio_backend(
            backend,
            NullNativeAudioBackend::new(),
        )
    }

    pub fn with_null_media_backend(
        backend: B,
    ) -> NativeRenderer<B, NullNativeAudioBackend, NullNativeVideoBackend> {
        NativeRenderer::<B, NullNativeAudioBackend, NullNativeVideoBackend>::with_audio_video_backend(
            backend,
            NullNativeAudioBackend::new(),
            NullNativeVideoBackend::new(),
        )
    }

    pub fn into_parts(self) -> (NativeRendererState, B) {
        (self.state, self.backend)
    }
}

impl<B, A> NativeRenderer<B, A, ()>
where
    B: NativeRenderBackend,
{
    pub fn with_audio_backend(backend: B, audio_backend: A) -> Self {
        Self {
            state: NativeRendererState::new(),
            backend,
            audio_backend: Some(audio_backend),
            video_backend: None,
        }
    }

    pub fn with_state_and_audio_backend(
        state: NativeRendererState,
        backend: B,
        audio_backend: A,
    ) -> Self {
        Self {
            state,
            backend,
            audio_backend: Some(audio_backend),
            video_backend: None,
        }
    }
}

impl<B, V> NativeRenderer<B, (), V>
where
    B: NativeRenderBackend,
{
    pub fn with_video_backend(backend: B, video_backend: V) -> Self {
        Self {
            state: NativeRendererState::new(),
            backend,
            audio_backend: None,
            video_backend: Some(video_backend),
        }
    }
}

impl<B, A, V> NativeRenderer<B, A, V>
where
    B: NativeRenderBackend,
{
    pub fn with_audio_video_backend(backend: B, audio_backend: A, video_backend: V) -> Self {
        Self::with_state_audio_video_backend(
            NativeRendererState::new(),
            backend,
            audio_backend,
            video_backend,
        )
    }

    pub fn with_state_audio_video_backend(
        state: NativeRendererState,
        backend: B,
        audio_backend: A,
        video_backend: V,
    ) -> Self {
        Self {
            state,
            backend,
            audio_backend: Some(audio_backend),
            video_backend: Some(video_backend),
        }
    }

    pub fn state(&self) -> &NativeRendererState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut NativeRendererState {
        &mut self.state
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn backend_mut(&mut self) -> &mut B {
        &mut self.backend
    }

    pub fn replace_backend(&mut self, backend: B) -> B {
        std::mem::replace(&mut self.backend, backend)
    }

    pub fn audio_backend(&self) -> Option<&A> {
        self.audio_backend.as_ref()
    }

    pub fn audio_backend_mut(&mut self) -> Option<&mut A> {
        self.audio_backend.as_mut()
    }

    pub fn video_backend(&self) -> Option<&V> {
        self.video_backend.as_ref()
    }

    pub fn video_backend_mut(&mut self) -> Option<&mut V> {
        self.video_backend.as_mut()
    }

    pub fn resources(&self) -> &NativeResourceLedger {
        self.state.resources()
    }

    pub fn metrics(&self) -> NativeRendererMetrics {
        self.state.metrics()
    }

    pub fn check_resource_budget(&self, budget: &ResourceBudget) -> Vec<ResourceBudgetViolation> {
        self.state.check_resource_budget(budget)
    }

    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        self.state.plan_package_unload(package_id)
    }

    pub fn release_package_resources(&mut self, package_id: &str) -> NativeRendererPackageRelease {
        self.state.release_package_resources(package_id)
    }

    pub fn prepare_frame(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> NativeRendererFrameUpdate {
        self.state.prepare_frame(layout, view)
    }

    pub fn render_frame(&mut self) -> NativeRenderBackendResult {
        self.state.submit_latest_frame(&mut self.backend)
    }

    pub fn prepare_and_render(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameResult, NativeRenderBackendError> {
        let update = self.prepare_frame(layout, view);
        let submission = self.render_frame()?;
        let texture_upload_sync = self.texture_upload_sync_for_update(&update);

        Ok(NativeRendererFrameResult {
            update,
            submission,
            texture_upload_sync,
        })
    }

    pub fn texture_upload_sync_for_update(
        &self,
        update: &NativeRendererFrameUpdate,
    ) -> NativeTextureUploadSyncPlan {
        plan_texture_upload_sync(
            &update.texture_uploads,
            self.backend.resident_texture_resource_ids(),
        )
    }

    pub fn hit_intent(&self, logical_x: f64, logical_y: f64) -> Option<RendererIntentHit> {
        self.state.hit_intent(logical_x, logical_y)
    }

    pub fn pointer_intent(
        &self,
        point: StageClientPoint,
        container_rect: StageClientRectOrigin,
    ) -> Option<PointerIntentResolution> {
        self.state.pointer_intent(point, container_rect)
    }

    pub fn pointer_event(
        &mut self,
        event: NativePointerEvent,
    ) -> Option<NativePointerEventResolution> {
        self.state.pointer_event(event)
    }

    pub fn cancel_pointer_interaction(&mut self, pointer_id: u64) -> bool {
        self.state.cancel_pointer_interaction(pointer_id)
    }

    pub fn pointer_event_and_emit_intent<H>(
        &mut self,
        event: NativePointerEvent,
        host: &mut H,
    ) -> NativeHostApiResult<Option<NativeRendererPointerEventDispatch>>
    where
        H: NativeHostApi,
    {
        let Some(resolution) = self.pointer_event(event) else {
            return Ok(None);
        };

        let emitted_intent = if let Some(hit) = &resolution.intent_to_dispatch {
            let event = native_renderer_intent_from_hit(hit);
            host.emit_renderer_intent(event.clone())?;
            Some(event)
        } else {
            None
        };

        Ok(Some(NativeRendererPointerEventDispatch {
            resolution,
            emitted_intent,
        }))
    }

    pub fn clear(&mut self) -> Vec<NativeResourceRecord> {
        self.state.clear()
    }

    pub fn clear_with_host_cleanup(
        &mut self,
    ) -> (
        Vec<NativeResourceRecord>,
        Vec<NativeRendererHostCleanupRecord>,
    ) {
        self.state.clear_with_host_cleanup()
    }

    pub fn into_parts_with_audio(self) -> (NativeRendererState, B, Option<A>) {
        (self.state, self.backend, self.audio_backend)
    }

    pub fn into_parts_with_media(self) -> (NativeRendererState, B, Option<A>, Option<V>) {
        (
            self.state,
            self.backend,
            self.audio_backend,
            self.video_backend,
        )
    }
}
