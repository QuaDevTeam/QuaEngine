use std::collections::BTreeSet;

use crate::audio::{plan_audio_backend_commands, AudioBackendTrackStateMap};
use crate::frame::{prepare_native_frame, PreparedNativeFrame};
use crate::input::{
    resolve_pointer_event_with_interaction, NativePointerEvent, NativePointerEventResolution,
    NativePointerInteractionState, PointerIntentResolution, RendererIntentHit,
};
use crate::projection::audio::AudioProjection;
use crate::projection::view::ViewProjection;
use crate::renderer::backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendResult, NativeRenderFrameRef,
};
use crate::renderer::metrics::NativeRendererMetrics;
use crate::renderer::resource_update::{
    apply_active_projection_unload_guard, apply_audio_resource_sync, apply_resource_sync,
    frame_audio_resource_sync_summary, frame_resource_sync_summary, host_cleanup_records,
    package_release_summary, NativeRendererFrameUpdate, NativeRendererHostCleanupRecord,
    NativeRendererPackageRelease,
};
use crate::resources::{
    audio_resource_records, plan_audio_asset_requests, plan_audio_resource_sync,
    plan_frame_resource_sync, NativeResourceLedger, NativeResourceRecord, PackageUnloadPlan,
    ResourceBudget, ResourceBudgetViolation,
};
use crate::stage_layout::{ResolvedStageLayout, StageClientPoint, StageClientRectOrigin};

#[derive(Clone, Debug, Default)]
pub struct NativeRendererState {
    revision: u64,
    frame: Option<PreparedNativeFrame>,
    resources: NativeResourceLedger,
    pointer_interaction: NativePointerInteractionState,
    active_audio_resource_ids: BTreeSet<crate::resources::ResourceId>,
    audio_backend_tracks: AudioBackendTrackStateMap,
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

    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        let mut plan = self.resources.plan_package_unload(package_id);
        let active_resource_ids = self.active_resource_ids();
        apply_active_projection_unload_guard(&mut plan, &active_resource_ids, &self.resources);
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
            host_cleanup: host_cleanup_records(&released_resources),
            summary: package_release_summary(&plan, &released_resources, &self.resources),
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
        let audio_resource_sync = plan_audio_resource_sync(&self.resources, view.audio.as_ref());
        let audio_assets = plan_audio_asset_requests(&self.resources, &audio_resource_sync);
        let audio_backend_commands = plan_audio_backend_commands(
            &self.audio_backend_tracks,
            view.audio.as_ref(),
            &audio_assets,
        );
        let mut released_resources = apply_resource_sync(&mut self.resources, &resource_sync);
        let audio_released_resources =
            apply_audio_resource_sync(&mut self.resources, &audio_resource_sync);
        let resource_sync_summary =
            frame_resource_sync_summary(&resource_sync, &released_resources);
        let audio_resource_sync_summary =
            frame_audio_resource_sync_summary(&audio_resource_sync, &audio_released_resources);

        released_resources.extend(audio_released_resources);

        self.revision = self.revision.saturating_add(1);
        self.active_audio_resource_ids = active_audio_resource_ids(view.audio.as_ref());
        self.audio_backend_tracks = audio_backend_commands.next_tracks.clone();
        self.frame = Some(frame);

        NativeRendererFrameUpdate {
            revision: self.revision,
            resource_sync,
            host_cleanup: host_cleanup_records(&released_resources),
            released_resources,
            resource_sync_summary,
            audio_resource_sync,
            audio_resource_sync_summary,
            audio_assets,
            audio_backend_commands,
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
        self.active_audio_resource_ids.clear();
        self.audio_backend_tracks.clear();
        self.resources.clear()
    }

    pub fn clear_with_host_cleanup(
        &mut self,
    ) -> (
        Vec<NativeResourceRecord>,
        Vec<NativeRendererHostCleanupRecord>,
    ) {
        let released = self.clear();
        let cleanup = host_cleanup_records(&released);
        (released, cleanup)
    }

    fn active_resource_ids(&self) -> BTreeSet<crate::resources::ResourceId> {
        let mut ids = self.active_audio_resource_ids.clone();
        if let Some(frame) = &self.frame {
            ids.extend(
                frame
                    .summary
                    .resources
                    .referenced_resource_ids
                    .iter()
                    .cloned(),
            );
        }
        ids
    }
}

fn active_audio_resource_ids(
    audio: Option<&AudioProjection>,
) -> BTreeSet<crate::resources::ResourceId> {
    audio_resource_records(audio)
        .into_iter()
        .map(|record| record.id)
        .collect()
}
