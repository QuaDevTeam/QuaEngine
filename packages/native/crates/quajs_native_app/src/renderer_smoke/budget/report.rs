use std::fmt::{Display, Formatter};

use crate::renderer_smoke::summary::NativeRendererSmokeSummary;

use super::checks::{
    check_package_dependent_memory, check_package_owned_memory, check_resource_kind_memory,
    check_u64, check_usize, check_usize_map,
};
use super::types::{NativeRendererSmokeBudget, NativeRendererSmokeBudgetViolation};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRendererSmokeBudgetReport {
    pub budget: NativeRendererSmokeBudget,
    pub violations: Vec<NativeRendererSmokeBudgetViolation>,
}

impl NativeRendererSmokeBudgetReport {
    pub fn check(budget: NativeRendererSmokeBudget, summary: &NativeRendererSmokeSummary) -> Self {
        let mut violations = Vec::new();
        check_scalar_metrics(&mut violations, &budget, summary);
        check_backend_package_metrics(&mut violations, &budget, summary);
        check_memory_map_metrics(&mut violations, &budget, summary);

        Self { budget, violations }
    }

    pub fn is_ok(&self) -> bool {
        self.violations.is_empty()
    }
}

impl Display for NativeRendererSmokeBudgetReport {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "Native renderer smoke budget exceeded")?;
        if !self.violations.is_empty() {
            write!(formatter, ": ")?;
            for (index, violation) in self.violations.iter().enumerate() {
                if index > 0 {
                    write!(formatter, "; ")?;
                }
                write!(formatter, "{violation}")?;
            }
        }
        write!(formatter, ".")
    }
}

fn check_scalar_metrics(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    budget: &NativeRendererSmokeBudget,
    summary: &NativeRendererSmokeSummary,
) {
    check_usize(
        violations,
        "missingResourceCount",
        summary.missing_resource_count,
        budget.max_missing_resources,
    );
    check_usize(
        violations,
        "fallbackCount",
        summary.fallback_count,
        budget.max_fallbacks,
    );
    check_usize(
        violations,
        "videoFallbackCount",
        summary.video_fallback_count,
        budget.max_video_fallbacks,
    );
    check_usize(
        violations,
        "textureUploadRequestCount",
        summary.texture_upload_request_count,
        budget.max_texture_upload_requests,
    );
    check_usize(
        violations,
        "textureUploadPendingRequestCount",
        summary.texture_upload_pending_request_count,
        budget.max_texture_upload_pending_requests,
    );
    check_usize(
        violations,
        "textureUploadResidentResourceCount",
        summary.texture_upload_resident_resource_count,
        budget.max_texture_upload_resident_resources,
    );
    check_usize(
        violations,
        "textureUploadOrphanedResidentResourceCount",
        summary.texture_upload_orphaned_resident_resource_count,
        budget.max_texture_upload_orphaned_resident_resources,
    );
    check_usize(
        violations,
        "textureUploadSkippedResourceCount",
        summary.texture_upload_skipped_resource_count,
        budget.max_texture_upload_skipped_resources,
    );
    check_usize(
        violations,
        "textureUploadNonTextureResourceCount",
        summary.texture_upload_non_texture_resource_count,
        budget.max_texture_upload_non_texture_resources,
    );
    check_u64(
        violations,
        "memory.totalBytes",
        summary.memory.total_bytes,
        budget.max_memory_bytes,
    );
    check_u64(
        violations,
        "declarativeMemory.totalBytes",
        summary.declarative_memory.total_bytes,
        budget.max_declarative_memory_bytes,
    );
    check_u64(
        violations,
        "audioMemory.totalBytes",
        summary.audio_memory.total_bytes,
        budget.max_audio_memory_bytes,
    );
    check_usize(
        violations,
        "audioResourceCount",
        summary.audio_resource_count,
        budget.max_audio_resources,
    );
    check_usize(
        violations,
        "activeAudioTrackCount",
        summary.active_audio_track_count,
        budget.max_active_audio_tracks,
    );
    check_usize(
        violations,
        "backend.drawCount",
        summary.backend.draw_count,
        budget.max_backend_draws,
    );
    check_usize(
        violations,
        "backend.skippedDrawCount",
        summary.backend.skipped_draw_count,
        budget.max_backend_skipped_draws,
    );
    check_usize(
        violations,
        "backend.resourceBindCount",
        summary.backend.resource_bind_count,
        budget.max_backend_resource_binds,
    );
    check_usize(
        violations,
        "backend.boundResourceReferenceCount",
        summary.backend.bound_resource_reference_count,
        budget.max_backend_bound_resource_references,
    );
    check_usize(
        violations,
        "backend.missingResourceReferenceCount",
        summary.backend.missing_resource_reference_count,
        budget.max_backend_missing_resource_references,
    );
    check_usize(
        violations,
        "backend.validationErrorCount",
        summary.backend.validation_error_count,
        budget.max_backend_validation_errors,
    );
}

fn check_backend_package_metrics(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    budget: &NativeRendererSmokeBudget,
    summary: &NativeRendererSmokeSummary,
) {
    check_usize_map(
        violations,
        "backend.skippedDrawsByReason",
        &summary.backend.skipped_draws_by_reason,
        &budget.max_backend_skipped_draws_by_reason,
    );
    check_usize_map(
        violations,
        "backend.skippedDrawsByOwnerPackage",
        &summary.backend.skipped_draws_by_owner_package,
        &budget.max_backend_skipped_draws_by_owner_package,
    );
    check_usize_map(
        violations,
        "backend.skippedDrawsByRequiredPackage",
        &summary.backend.skipped_draws_by_required_package,
        &budget.max_backend_skipped_draws_by_required_package,
    );
    check_usize_map(
        violations,
        "backend.missingResourceReferencesByOwnerPackage",
        &summary.backend.missing_resource_references_by_owner_package,
        &budget.max_backend_missing_resource_references_by_owner_package,
    );
    check_usize_map(
        violations,
        "backend.missingResourceReferencesByRequiredPackage",
        &summary
            .backend
            .missing_resource_references_by_required_package,
        &budget.max_backend_missing_resource_references_by_required_package,
    );
}

fn check_memory_map_metrics(
    violations: &mut Vec<NativeRendererSmokeBudgetViolation>,
    budget: &NativeRendererSmokeBudget,
    summary: &NativeRendererSmokeSummary,
) {
    check_resource_kind_memory(
        violations,
        "memoryByKind",
        &summary.memory_by_kind,
        &budget.max_memory_bytes_by_kind,
    );
    check_package_owned_memory(
        violations,
        "memoryByPackage",
        &summary.memory_by_package,
        &budget.max_owned_memory_bytes_by_package,
    );
    check_package_dependent_memory(
        violations,
        "memoryByPackage",
        &summary.memory_by_package,
        &budget.max_dependent_memory_bytes_by_package,
    );
    check_package_owned_memory(
        violations,
        "declarativeMemoryByPackage",
        &summary.declarative_memory_by_package,
        &budget.max_declarative_owned_memory_bytes_by_package,
    );
    check_package_dependent_memory(
        violations,
        "declarativeMemoryByPackage",
        &summary.declarative_memory_by_package,
        &budget.max_declarative_dependent_memory_bytes_by_package,
    );
    check_package_owned_memory(
        violations,
        "audioMemoryByPackage",
        &summary.audio_memory_by_package,
        &budget.max_audio_owned_memory_bytes_by_package,
    );
    check_package_dependent_memory(
        violations,
        "audioMemoryByPackage",
        &summary.audio_memory_by_package,
        &budget.max_audio_dependent_memory_bytes_by_package,
    );
}
