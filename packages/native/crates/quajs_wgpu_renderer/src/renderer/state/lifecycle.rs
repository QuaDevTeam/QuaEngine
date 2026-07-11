use std::collections::BTreeSet;

use crate::renderer::backend::{
    NativeRenderBackend, NativeRenderBackendError, NativeRenderBackendResult, NativeRenderFrameRef,
};
use crate::renderer::interaction_feedback::frame_with_interaction_feedback;
use crate::renderer::resource_update::{
    apply_active_projection_package_unload_guard, apply_active_projection_unload_guard,
    host_cleanup_records, package_release_summary, NativeRendererHostCleanupRecord,
    NativeRendererPackageRelease,
};
use crate::resources::{NativeResourceRecord, PackageUnloadPlan};

use super::{ActiveProjectionPackages, NativeRendererState};

impl NativeRendererState {
    pub fn plan_package_unload(&self, package_id: &str) -> PackageUnloadPlan {
        let mut plan = self.resources.plan_package_unload(package_id);
        let active_resource_ids = self.active_resource_ids();
        apply_active_projection_unload_guard(&mut plan, &active_resource_ids, &self.resources);
        let active_projection_packages = self.active_projection_packages();
        apply_active_projection_package_unload_guard(
            &mut plan,
            &active_projection_packages.owner_package_ids,
            &active_projection_packages.required_package_ids,
        );
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

    pub fn submit_latest_frame<B>(&self, backend: &mut B) -> NativeRenderBackendResult
    where
        B: NativeRenderBackend,
    {
        let frame = self
            .frame
            .as_ref()
            .ok_or_else(NativeRenderBackendError::no_prepared_frame)?;

        let feedback_frame = frame_with_interaction_feedback(frame, &self.pointer_interaction);
        backend.submit_frame(NativeRenderFrameRef {
            revision: self.revision,
            frame: feedback_frame.as_ref().unwrap_or(frame),
            resources: &self.resources,
        })
    }

    pub fn clear(&mut self) -> Vec<NativeResourceRecord> {
        self.frame = None;
        self.revision = self.revision.saturating_add(1);
        self.pointer_interaction.clear();
        self.active_audio_resource_ids.clear();
        self.active_font_resource_ids.clear();
        self.audio_backend_tracks.clear();
        self.font_backend_faces.clear();
        self.video_backend_streams.clear();
        self.video_backend_frame_resources.clear();
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
        ids.extend(self.active_font_resource_ids.iter().cloned());
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

    fn active_projection_packages(&self) -> ActiveProjectionPackages {
        let mut packages = ActiveProjectionPackages::default();
        if let Some(frame) = &self.frame {
            for command in frame.graph.commands() {
                if let Some(package_id) = &command.owner_package_id {
                    packages.owner_package_ids.insert(package_id.clone());
                }
                packages
                    .required_package_ids
                    .extend(command.required_package_ids.iter().cloned());
            }
        }
        packages
    }
}
