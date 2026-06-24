use crate::audio::{
    plan_audio_backend_commands, NativeAudioBackend, NativeAudioBackendError,
    NativeAudioBackendResult, NullNativeAudioBackend,
};
use crate::input::{
    NativePointerEvent, NativePointerEventResolution, PointerIntentResolution, RendererIntentHit,
};
use crate::projection::view::ViewProjection;
use crate::renderer::metrics::NativeRendererMetrics;
use crate::resources::{
    NativeAssetRequestPlan, NativeResourceLedger, NativeResourceRecord, PackageUnloadPlan,
    ResourceBudget, ResourceBudgetViolation,
};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};

use super::backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendResult,
    NativeRenderSubmission,
};
use super::resource_update::{
    NativeRendererFrameUpdate, NativeRendererHostCleanupRecord, NativeRendererPackageRelease,
};
use super::state::NativeRendererState;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameResult {
    pub update: NativeRendererFrameUpdate,
    pub submission: NativeRenderSubmission,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeRendererFrameError {
    Render(NativeRenderBackendError),
    Audio(NativeAudioBackendError),
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

#[derive(Clone, Debug)]
pub struct NativeRenderer<B, A = ()> {
    state: NativeRendererState,
    backend: B,
    audio_backend: Option<A>,
}

impl<B> NativeRenderer<B, ()>
where
    B: NativeRenderBackend,
{
    pub fn new(backend: B) -> Self {
        Self {
            state: NativeRendererState::new(),
            backend,
            audio_backend: None,
        }
    }

    pub fn with_state(state: NativeRendererState, backend: B) -> Self {
        Self {
            state,
            backend,
            audio_backend: None,
        }
    }

    pub fn with_null_audio_backend(backend: B) -> NativeRenderer<B, NullNativeAudioBackend> {
        NativeRenderer::with_audio_backend(backend, NullNativeAudioBackend::new())
    }

    pub fn into_parts(self) -> (NativeRendererState, B) {
        (self.state, self.backend)
    }
}

impl<B, A> NativeRenderer<B, A>
where
    B: NativeRenderBackend,
{
    pub fn with_audio_backend(backend: B, audio_backend: A) -> Self {
        Self::with_state_and_audio_backend(NativeRendererState::new(), backend, audio_backend)
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

    pub fn audio_backend(&self) -> Option<&A> {
        self.audio_backend.as_ref()
    }

    pub fn audio_backend_mut(&mut self) -> Option<&mut A> {
        self.audio_backend.as_mut()
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

        Ok(NativeRendererFrameResult { update, submission })
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
}

impl<B, A> NativeRenderer<B, A>
where
    B: NativeRenderBackend,
    A: NativeAudioBackend,
{
    pub fn apply_audio_update(
        &mut self,
        update: &NativeRendererFrameUpdate,
    ) -> NativeAudioBackendResult {
        if let Some(audio_backend) = &mut self.audio_backend {
            audio_backend.apply_audio_commands(&update.audio_backend_commands)?;
        }
        Ok(())
    }

    pub fn prepare_frame_and_apply_audio(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameUpdate, NativeAudioBackendError> {
        let update = self.prepare_frame(layout, view);
        self.apply_audio_update(&update)?;
        Ok(update)
    }

    pub fn prepare_render_and_apply_audio(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> Result<NativeRendererFrameResult, NativeRendererFrameError> {
        let update = self.prepare_frame(layout, view);
        let submission = self.render_frame()?;
        self.apply_audio_update(&update)?;

        Ok(NativeRendererFrameResult { update, submission })
    }

    pub fn clear_and_apply_audio_teardown(
        &mut self,
    ) -> Result<Vec<NativeResourceRecord>, NativeAudioBackendError> {
        self.apply_audio_teardown()?;
        Ok(self.clear())
    }

    pub fn clear_with_host_cleanup_and_audio_teardown(
        &mut self,
    ) -> Result<
        (
            Vec<NativeResourceRecord>,
            Vec<NativeRendererHostCleanupRecord>,
        ),
        NativeAudioBackendError,
    > {
        self.apply_audio_teardown()?;
        Ok(self.clear_with_host_cleanup())
    }

    fn apply_audio_teardown(&mut self) -> NativeAudioBackendResult {
        if self.state.audio_backend_tracks().is_empty() {
            return Ok(());
        }

        let plan = plan_audio_backend_commands(
            self.state.audio_backend_tracks(),
            None,
            &NativeAssetRequestPlan::default(),
        );

        if let Some(audio_backend) = &mut self.audio_backend {
            audio_backend.apply_audio_commands(&plan)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests;
