use std::collections::BTreeMap;

use quajs_wgpu_renderer::renderer::NativeBackendExecutionReport;
use quajs_wgpu_renderer::resources::{
    NativeResourceKind, PackageResourceSummary, ResourceKindSummary, ResourceMemory,
};

use super::backend::NativeRendererSmokeBackendSummary;
use super::memory::{package_memory_summary, resource_kind_memory_summary};

#[test]
fn serializes_resource_kind_and_package_memory_maps() {
    let by_kind = BTreeMap::from([
        (
            NativeResourceKind::UiAst,
            ResourceKindSummary {
                count: 2,
                memory: ResourceMemory {
                    cpu_bytes: 256,
                    gpu_bytes: 0,
                },
            },
        ),
        (
            NativeResourceKind::AudioBuffer,
            ResourceKindSummary {
                count: 1,
                memory: ResourceMemory {
                    cpu_bytes: 512,
                    gpu_bytes: 0,
                },
            },
        ),
        (
            NativeResourceKind::QssStyle,
            ResourceKindSummary {
                count: 1,
                memory: ResourceMemory {
                    cpu_bytes: 128,
                    gpu_bytes: 0,
                },
            },
        ),
        (
            NativeResourceKind::TokenTable,
            ResourceKindSummary {
                count: 1,
                memory: ResourceMemory {
                    cpu_bytes: 64,
                    gpu_bytes: 0,
                },
            },
        ),
    ]);
    let by_package = BTreeMap::from([(
        "runtime.ui".to_string(),
        PackageResourceSummary {
            package_id: "runtime.ui".to_string(),
            owned_count: 2,
            dependent_count: 1,
            owned_memory: ResourceMemory {
                cpu_bytes: 256,
                gpu_bytes: 0,
            },
            dependent_memory: ResourceMemory {
                cpu_bytes: 64,
                gpu_bytes: 128,
            },
        },
    )]);

    let summary = resource_kind_memory_summary(&by_kind);
    assert_eq!(summary["uiAst"].count, 2);
    assert_eq!(summary["uiAst"].memory.total_bytes, 256);
    assert_eq!(summary["audioBuffer"].memory.cpu_bytes, 512);
    assert_eq!(summary["qssStyle"].memory.cpu_bytes, 128);
    assert_eq!(summary["tokenTable"].memory.cpu_bytes, 64);

    let packages = package_memory_summary(&by_package);
    assert_eq!(packages["runtime.ui"].owned_count, 2);
    assert_eq!(packages["runtime.ui"].dependent_count, 1);
    assert_eq!(packages["runtime.ui"].dependent_memory.total_bytes, 192);
}

#[test]
fn exposes_backend_package_pressure_maps() {
    let report = NativeBackendExecutionReport {
        skipped_draw_count: 2,
        missing_resource_reference_count: 3,
        skipped_draws_by_owner_package: BTreeMap::from([("runtime.ui".to_string(), 2)]),
        skipped_draws_by_required_package: BTreeMap::from([("base".to_string(), 2)]),
        missing_resource_references_by_owner_package: BTreeMap::from([(
            "runtime.ui".to_string(),
            3,
        )]),
        missing_resource_references_by_required_package: BTreeMap::from([("base".to_string(), 3)]),
        ..Default::default()
    };

    let summary = NativeRendererSmokeBackendSummary::from_execution_report(&report);

    assert_eq!(summary.skipped_draw_count, 2);
    assert_eq!(summary.skipped_draws_by_owner_package["runtime.ui"], 2);
    assert_eq!(summary.skipped_draws_by_required_package["base"], 2);
    assert_eq!(
        summary.missing_resource_references_by_owner_package["runtime.ui"],
        3
    );
    assert_eq!(
        summary.missing_resource_references_by_required_package["base"],
        3
    );
}
