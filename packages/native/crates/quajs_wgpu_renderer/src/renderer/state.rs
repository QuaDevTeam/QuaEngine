use crate::frame::{prepare_native_frame, PreparedNativeFrame};
use crate::input::{
    resolve_pointer_event_with_interaction, NativePointerEvent, NativePointerEventResolution,
    NativePointerInteractionState, PointerIntentResolution, RendererIntentHit,
};
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendResult, NativeRenderFrameRef,
};
use crate::renderer::metrics::NativeRendererMetrics;
use crate::resources::{
    plan_frame_resource_sync, FrameResourceSyncPlan, NativeResourceLedger, NativeResourceRecord,
};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameUpdate {
    pub revision: u64,
    pub resource_sync: FrameResourceSyncPlan,
    pub released_resources: Vec<NativeResourceRecord>,
}

#[derive(Clone, Debug, Default)]
pub struct NativeRendererState {
    revision: u64,
    frame: Option<PreparedNativeFrame>,
    resources: NativeResourceLedger,
    pointer_interaction: NativePointerInteractionState,
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

    pub fn metrics(&self) -> NativeRendererMetrics {
        NativeRendererMetrics::from_state(self.revision, self.frame.as_ref(), &self.resources)
    }

    pub fn prepare_frame(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> NativeRendererFrameUpdate {
        let frame = prepare_native_frame(layout, view);
        let resource_sync = plan_frame_resource_sync(&self.resources, &frame.resources);
        let released_resources = apply_resource_sync(&mut self.resources, &resource_sync);

        self.revision = self.revision.saturating_add(1);
        self.frame = Some(frame);

        NativeRendererFrameUpdate {
            revision: self.revision,
            resource_sync,
            released_resources,
        }
    }

    pub fn hit_intent(&self, logical_x: f64, logical_y: f64) -> Option<RendererIntentHit> {
        self.frame
            .as_ref()
            .and_then(|frame| frame.hit_intent(logical_x, logical_y))
    }

    pub fn pointer_intent(
        &self,
        point: StageClientPoint,
        container_rect: StageClientRectOrigin,
    ) -> Option<PointerIntentResolution> {
        self.frame
            .as_ref()
            .map(|frame| frame.pointer_intent(point, container_rect))
    }

    pub fn pointer_event(
        &mut self,
        event: NativePointerEvent,
    ) -> Option<NativePointerEventResolution> {
        self.pointer_intent(event.point, event.container_rect)
            .map(|pointer| {
                resolve_pointer_event_with_interaction(
                    &mut self.pointer_interaction,
                    event,
                    pointer,
                )
            })
    }

    pub fn submit_latest_frame<B>(&self, backend: &mut B) -> NativeRenderBackendResult
    where
        B: NativeRenderBackend,
    {
        let frame = self
            .frame
            .as_ref()
            .ok_or_else(NativeRenderBackendError::no_prepared_frame)?;

        backend.submit_frame(NativeRenderFrameRef {
            revision: self.revision,
            frame,
            resources: &self.resources,
        })
    }

    pub fn clear(&mut self) -> Vec<NativeResourceRecord> {
        self.frame = None;
        self.revision = self.revision.saturating_add(1);
        self.pointer_interaction.clear();
        self.resources.clear()
    }
}

fn apply_resource_sync(
    ledger: &mut NativeResourceLedger,
    sync: &FrameResourceSyncPlan,
) -> Vec<NativeResourceRecord> {
    let mut released = Vec::new();

    for id in &sync.release {
        if let Some(record) = ledger.release_resource(id.clone()) {
            released.push(record);
        }
    }

    for record in &sync.upsert {
        ledger.insert(merge_existing_record_metadata(ledger, record.clone()));
    }

    released
}

fn merge_existing_record_metadata(
    ledger: &NativeResourceLedger,
    mut next: NativeResourceRecord,
) -> NativeResourceRecord {
    if let Some(existing) = ledger.get(next.id.clone()) {
        if existing.kind == next.kind {
            next.memory = existing.memory;
            next.label = existing.label.clone();
        }
    }

    next
}
