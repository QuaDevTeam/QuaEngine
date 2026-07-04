use std::collections::BTreeMap;

use super::support::summary;
use crate::renderer_smoke::budget::{NativeRendererSmokeBudget, NativeRendererSmokeBudgetReport};

#[test]
fn accepts_summary_within_budget() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_missing_resources: Some(1),
            max_fallbacks: Some(2),
            max_texture_upload_requests: Some(2),
            max_texture_upload_pending_requests: Some(1),
            max_texture_upload_resident_resources: Some(1),
            max_texture_upload_orphaned_resident_resources: Some(1),
            max_texture_upload_skipped_resources: Some(1),
            max_texture_upload_non_texture_resources: Some(1),
            max_memory_bytes: Some(256),
            max_declarative_memory_bytes: Some(128),
            ..Default::default()
        },
        &summary,
    );

    assert!(report.is_ok());
}

#[test]
fn reports_all_budget_violations() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_missing_resources: Some(0),
            max_fallbacks: Some(0),
            max_video_fallbacks: Some(0),
            max_texture_upload_requests: Some(1),
            max_texture_upload_pending_requests: Some(0),
            max_texture_upload_resident_resources: Some(0),
            max_texture_upload_orphaned_resident_resources: Some(0),
            max_texture_upload_skipped_resources: Some(0),
            max_texture_upload_non_texture_resources: Some(0),
            max_memory_bytes: Some(99),
            max_declarative_memory_bytes: Some(39),
            max_audio_memory_bytes: Some(9),
            max_audio_resources: Some(0),
            max_active_audio_tracks: Some(0),
            max_backend_draws: Some(3),
            max_backend_skipped_draws: Some(0),
            max_backend_resource_binds: Some(1),
            max_backend_bound_resource_references: Some(2),
            max_backend_missing_resource_references: Some(0),
            max_backend_validation_errors: Some(0),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report
            .violations
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        vec![
            "missingResourceCount=1 exceeded max 0",
            "fallbackCount=2 exceeded max 0",
            "videoFallbackCount=1 exceeded max 0",
            "textureUploadRequestCount=2 exceeded max 1",
            "textureUploadPendingRequestCount=1 exceeded max 0",
            "textureUploadResidentResourceCount=1 exceeded max 0",
            "textureUploadOrphanedResidentResourceCount=1 exceeded max 0",
            "textureUploadSkippedResourceCount=1 exceeded max 0",
            "textureUploadNonTextureResourceCount=1 exceeded max 0",
            "memory.totalBytes=100 exceeded max 99",
            "declarativeMemory.totalBytes=40 exceeded max 39",
            "audioMemory.totalBytes=10 exceeded max 9",
            "audioResourceCount=1 exceeded max 0",
            "activeAudioTrackCount=1 exceeded max 0",
            "backend.drawCount=4 exceeded max 3",
            "backend.skippedDrawCount=1 exceeded max 0",
            "backend.resourceBindCount=2 exceeded max 1",
            "backend.boundResourceReferenceCount=3 exceeded max 2",
            "backend.missingResourceReferenceCount=1 exceeded max 0",
            "backend.validationErrorCount=1 exceeded max 0",
        ]
    );
}

#[test]
fn reports_memory_map_budget_violations() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_memory_bytes_by_kind: BTreeMap::from([("uiAst".to_string(), 39)]),
            max_owned_memory_bytes_by_package: BTreeMap::from([("runtime.ui".to_string(), 39)]),
            max_dependent_memory_bytes_by_package: BTreeMap::from([("base".to_string(), 29)]),
            max_declarative_owned_memory_bytes_by_package: BTreeMap::from([(
                "runtime.ui".to_string(),
                39,
            )]),
            max_declarative_dependent_memory_bytes_by_package: BTreeMap::from([(
                "base".to_string(),
                39,
            )]),
            max_audio_owned_memory_bytes_by_package: BTreeMap::from([(
                "runtime.audio".to_string(),
                9,
            )]),
            max_audio_dependent_memory_bytes_by_package: BTreeMap::from([("base".to_string(), 9)]),
            max_backend_skipped_draws_by_reason: BTreeMap::from([(
                "missingResources".to_string(),
                0,
            )]),
            max_backend_skipped_draws_by_owner_package: BTreeMap::from([(
                "runtime.ui".to_string(),
                0,
            )]),
            max_backend_skipped_draws_by_required_package: BTreeMap::from([(
                "base".to_string(),
                0,
            )]),
            max_backend_missing_resource_references_by_owner_package: BTreeMap::from([(
                "runtime.ui".to_string(),
                0,
            )]),
            max_backend_missing_resource_references_by_required_package: BTreeMap::from([(
                "base".to_string(),
                0,
            )]),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report
            .violations
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        vec![
            "backend.skippedDrawsByReason.missingResources=1 exceeded max 0",
            "backend.skippedDrawsByOwnerPackage.runtime.ui=1 exceeded max 0",
            "backend.skippedDrawsByRequiredPackage.base=1 exceeded max 0",
            "backend.missingResourceReferencesByOwnerPackage.runtime.ui=1 exceeded max 0",
            "backend.missingResourceReferencesByRequiredPackage.base=1 exceeded max 0",
            "memoryByKind.uiAst.memory.totalBytes=40 exceeded max 39",
            "memoryByPackage.runtime.ui.ownedMemory.totalBytes=40 exceeded max 39",
            "memoryByPackage.base.dependentMemory.totalBytes=30 exceeded max 29",
            "declarativeMemoryByPackage.runtime.ui.ownedMemory.totalBytes=40 exceeded max 39",
            "declarativeMemoryByPackage.base.dependentMemory.totalBytes=40 exceeded max 39",
            "audioMemoryByPackage.runtime.audio.ownedMemory.totalBytes=10 exceeded max 9",
            "audioMemoryByPackage.base.dependentMemory.totalBytes=10 exceeded max 9",
        ]
    );
}

#[test]
fn displays_budget_report() {
    let summary = summary();
    let report = NativeRendererSmokeBudgetReport::check(
        NativeRendererSmokeBudget {
            max_memory_bytes: Some(0),
            ..Default::default()
        },
        &summary,
    );

    assert_eq!(
        report.to_string(),
        "Native renderer smoke budget exceeded: memory.totalBytes=100 exceeded max 0."
    );
}
