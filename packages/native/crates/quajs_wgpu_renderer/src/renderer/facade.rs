use crate::input::{
    NativePointerEvent, NativePointerEventResolution, PointerIntentResolution, RendererIntentHit,
};
use crate::projection::view::ViewProjection;
use crate::renderer::metrics::NativeRendererMetrics;
use crate::resources::{NativeResourceLedger, NativeResourceRecord};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};

use super::backend::{NativeRenderBackend, NativeRenderBackendResult, NativeRenderSubmission};
use super::state::{NativeRendererFrameUpdate, NativeRendererState};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameResult {
    pub update: NativeRendererFrameUpdate,
    pub submission: NativeRenderSubmission,
}

#[derive(Clone, Debug)]
pub struct NativeRenderer<B> {
    state: NativeRendererState,
    backend: B,
}

impl<B> NativeRenderer<B>
where
    B: NativeRenderBackend,
{
    pub fn new(backend: B) -> Self {
        Self {
            state: NativeRendererState::new(),
            backend,
        }
    }

    pub fn with_state(state: NativeRendererState, backend: B) -> Self {
        Self { state, backend }
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

    pub fn resources(&self) -> &NativeResourceLedger {
        self.state.resources()
    }

    pub fn metrics(&self) -> NativeRendererMetrics {
        self.state.metrics()
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
    ) -> Result<NativeRendererFrameResult, super::backend::NativeRenderBackendError> {
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

    pub fn into_parts(self) -> (NativeRendererState, B) {
        (self.state, self.backend)
    }
}

#[cfg(test)]
mod tests;
