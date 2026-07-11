use std::collections::BTreeMap;

use crate::renderer_smoke::summary::{
    NativeRendererSmokeAudioBackendSummary, NativeRendererSmokeBackendSummary,
    NativeRendererSmokeMemorySummary, NativeRendererSmokePackageMemorySummary,
    NativeRendererSmokeResourceKindMemorySummary, NativeRendererSmokeSummary,
};

pub(super) fn summary() -> NativeRendererSmokeSummary {
    NativeRendererSmokeSummary {
        revision: 1,
        pass_count: 2,
        batch_count: 3,
        command_count: 4,
        command_graph_signature: "fnv1a64:0000000000000000".to_string(),
        command_ids: vec!["scene".to_string(), "dialogue".to_string()],
        command_kind_counts: BTreeMap::from([("image".to_string(), 1), ("text".to_string(), 1)]),
        resource_count: 5,
        missing_resource_count: 1,
        fallback_count: 2,
        video_fallback_count: 1,
        fallbacks_by_owner_package: BTreeMap::from([("runtime.video".to_string(), 1)]),
        fallbacks_by_required_package: BTreeMap::from([("base".to_string(), 1)]),
        texture_upload_request_count: 2,
        texture_upload_pending_request_count: 1,
        texture_upload_resident_resource_count: 1,
        texture_upload_orphaned_resident_resource_count: 1,
        texture_upload_skipped_resource_count: 1,
        texture_upload_non_texture_resource_count: 1,
        declarative_asset_request_count: 1,
        declarative_resource_count: 1,
        audio_resource_count: 1,
        active_audio_track_count: 1,
        resource_package_count: 2,
        resource_kind_count: 3,
        memory: memory(60, 40),
        declarative_memory: memory(40, 0),
        audio_memory: memory(10, 0),
        audio_backend: NativeRendererSmokeAudioBackendSummary {
            applied_plan_count: 2,
            applied_command_count: 3,
            active_track_count: 1,
        },
        backend: NativeRendererSmokeBackendSummary {
            pass_count: 2,
            command_count: 8,
            pipeline_bind_count: 2,
            clip_set_count: 1,
            clip_clear_count: 1,
            max_clip_depth: 1,
            resource_bind_count: 2,
            bound_resource_reference_count: 3,
            unique_resource_count: 2,
            draw_count: 4,
            skipped_draw_count: 1,
            missing_resource_reference_count: 1,
            unique_missing_resource_count: 1,
            validation_error_count: 1,
            skipped_draws_by_reason: BTreeMap::from([("missingResources".to_string(), 1)]),
            missing_resource_ids: vec!["images:missing.png".to_string()],
            skipped_draws_by_owner_package: BTreeMap::from([("runtime.ui".to_string(), 1)]),
            skipped_draws_by_required_package: BTreeMap::from([("base".to_string(), 1)]),
            missing_resource_references_by_owner_package: BTreeMap::from([(
                "runtime.ui".to_string(),
                1,
            )]),
            missing_resource_references_by_required_package: BTreeMap::from([(
                "base".to_string(),
                1,
            )]),
        },
        memory_by_kind: BTreeMap::from([("uiAst".to_string(), kind_memory(1, 40, 0))]),
        memory_by_package: BTreeMap::from([
            (
                "runtime.ui".to_string(),
                package_memory(1, 0, memory(40, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(30, 0)),
            ),
        ]),
        declarative_memory_by_package: BTreeMap::from([
            (
                "runtime.ui".to_string(),
                package_memory(1, 0, memory(40, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(40, 0)),
            ),
        ]),
        audio_memory_by_package: BTreeMap::from([
            (
                "runtime.audio".to_string(),
                package_memory(1, 0, memory(10, 0), memory(0, 0)),
            ),
            (
                "base".to_string(),
                package_memory(0, 1, memory(0, 0), memory(10, 0)),
            ),
        ]),
    }
}

pub(super) fn unique_budget_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-renderer-smoke-budget-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

fn memory(cpu_bytes: u64, gpu_bytes: u64) -> NativeRendererSmokeMemorySummary {
    NativeRendererSmokeMemorySummary {
        cpu_bytes,
        gpu_bytes,
        total_bytes: cpu_bytes + gpu_bytes,
    }
}

fn kind_memory(
    count: usize,
    cpu_bytes: u64,
    gpu_bytes: u64,
) -> NativeRendererSmokeResourceKindMemorySummary {
    NativeRendererSmokeResourceKindMemorySummary {
        count,
        memory: memory(cpu_bytes, gpu_bytes),
    }
}

fn package_memory(
    owned_count: usize,
    dependent_count: usize,
    owned_memory: NativeRendererSmokeMemorySummary,
    dependent_memory: NativeRendererSmokeMemorySummary,
) -> NativeRendererSmokePackageMemorySummary {
    NativeRendererSmokePackageMemorySummary {
        owned_count,
        dependent_count,
        owned_memory,
        dependent_memory,
    }
}
