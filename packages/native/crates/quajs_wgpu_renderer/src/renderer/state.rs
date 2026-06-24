use std::collections::BTreeMap;

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
    plan_frame_resource_sync, FrameResourceSyncPlan, NativeResourceKind, NativeResourceLedger,
    NativeResourceRecord, PackageUnloadBlocker, PackageUnloadBlockerReason, PackageUnloadPlan,
    ResourceBudget, ResourceBudgetViolation, ResourceId, ResourceMemory,
};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererFrameUpdate {
    pub revision: u64,
    pub resource_sync: FrameResourceSyncPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub resource_sync_summary: NativeRendererFrameResourceSyncSummary,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererFrameResourceSyncSummary {
    pub upsert_count: usize,
    pub retain_count: usize,
    pub release_count: usize,
    pub released_count: usize,
    pub released_memory: ResourceMemory,
    pub upsert_by_kind: BTreeMap<NativeResourceKind, usize>,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeRendererPackageRelease {
    pub revision: u64,
    pub plan: PackageUnloadPlan,
    pub released_resources: Vec<NativeResourceRecord>,
    pub summary: NativeRendererPackageReleaseSummary,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeRendererPackageReleaseSummary {
    pub releasable_count: usize,
    pub blocked_count: usize,
    pub released_count: usize,
    pub released_memory: ResourceMemory,
    pub released_by_kind: BTreeMap<NativeResourceKind, usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ReleasedResourceSummary {
    count: usize,
    memory: ResourceMemory,
    by_kind: BTreeMap<NativeResourceKind, usize>,
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

    pub fn check_resource_budget(&self, budget: &ResourceBudget) -> Vec<ResourceBudgetViolation> {
        self.resources.check_budget(budget)
    }

    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        let mut plan = self.resources.plan_package_unload(package_id);
        apply_active_frame_unload_guard(&mut plan, self.frame.as_ref(), &self.resources);
        plan
    }

    pub fn release_package_resources(&mut self, package_id: &str) -> NativeRendererPackageRelease {
        let plan = self.plan_package_unload(package_id);
        let mut released_resources = Vec::new();
        if plan.can_unload() {
            for id in plan.releasable.iter().cloned() {
                if let Some(record) = self.resources.release_resource(id) {
                    released_resources.push(record);
                }
            }
            if !released_resources.is_empty() {
                self.revision = self.revision.saturating_add(1);
            }
        }

        NativeRendererPackageRelease {
            revision: self.revision,
            summary: package_release_summary(&plan, &released_resources),
            plan,
            released_resources,
        }
    }

    pub fn prepare_frame(
        &mut self,
        layout: ResolvedStageLayout,
        view: &ViewProjection,
    ) -> NativeRendererFrameUpdate {
        let frame = prepare_native_frame(layout, view);
        let resource_sync = plan_frame_resource_sync(&self.resources, &frame.resources);
        let released_resources = apply_resource_sync(&mut self.resources, &resource_sync);
        let resource_sync_summary =
            frame_resource_sync_summary(&resource_sync, &released_resources);

        self.revision = self.revision.saturating_add(1);
        self.frame = Some(frame);

        NativeRendererFrameUpdate {
            revision: self.revision,
            resource_sync,
            released_resources,
            resource_sync_summary,
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

fn apply_active_frame_unload_guard(
    plan: &mut PackageUnloadPlan,
    frame: Option<&PreparedNativeFrame>,
    ledger: &NativeResourceLedger,
) {
    let Some(frame) = frame else {
        return;
    };
    let active_ids = &frame.summary.resources.referenced_resource_ids;
    if active_ids.is_empty() || plan.releasable.is_empty() {
        return;
    }

    let mut guarded = Vec::new();
    plan.releasable.retain(|id| {
        let active = active_ids.contains(id);
        if active {
            guarded.push(id.clone());
        }
        !active
    });

    for id in guarded {
        if let Some(record) = ledger.get(id.clone()) {
            plan.blocked.push(PackageUnloadBlocker {
                resource_id: id,
                kind: record.kind,
                owner_package_id: record.owner_package_id.clone(),
                required_package_ids: record.required_package_ids.clone(),
                reason: PackageUnloadBlockerReason::ActiveFrameReference,
            });
        }
    }

    plan.releasable_memory = releasable_memory(&plan.releasable, ledger);
}

fn releasable_memory(ids: &[ResourceId], ledger: &NativeResourceLedger) -> ResourceMemory {
    let mut memory = ResourceMemory::default();
    for id in ids {
        if let Some(record) = ledger.get(id.clone()) {
            memory.add_assign(record.memory);
        }
    }
    memory
}

fn frame_resource_sync_summary(
    sync: &FrameResourceSyncPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererFrameResourceSyncSummary {
    let released = released_resource_summary(released_resources);
    let mut summary = NativeRendererFrameResourceSyncSummary {
        upsert_count: sync.upsert.len(),
        retain_count: sync.retain.len(),
        release_count: sync.release.len(),
        released_count: released.count,
        released_memory: released.memory,
        released_by_kind: released.by_kind,
        ..Default::default()
    };

    for record in &sync.upsert {
        *summary.upsert_by_kind.entry(record.kind).or_default() += 1;
    }

    summary
}

fn package_release_summary(
    plan: &PackageUnloadPlan,
    released_resources: &[NativeResourceRecord],
) -> NativeRendererPackageReleaseSummary {
    let released = released_resource_summary(released_resources);
    NativeRendererPackageReleaseSummary {
        releasable_count: plan.releasable.len(),
        blocked_count: plan.blocked.len(),
        released_count: released.count,
        released_memory: released.memory,
        released_by_kind: released.by_kind,
    }
}

fn released_resource_summary(
    released_resources: &[NativeResourceRecord],
) -> ReleasedResourceSummary {
    let mut summary = ReleasedResourceSummary {
        count: released_resources.len(),
        ..Default::default()
    };

    for record in released_resources {
        *summary.by_kind.entry(record.kind).or_default() += 1;
        summary.memory.add_assign(record.memory);
    }

    summary
}
