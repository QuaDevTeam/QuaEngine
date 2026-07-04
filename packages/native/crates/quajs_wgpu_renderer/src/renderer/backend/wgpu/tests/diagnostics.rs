use std::collections::{BTreeMap, BTreeSet};

use super::super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendResourcePolicy, NativeRenderFrameRef,
};
use crate::resources::NativeResourceLedger;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn exposes_package_attributed_runtime_skips_for_missing_resources() {
    let mut backend = WgpuNativeRenderBackend::new(WgpuNativeRenderBackendConfig {
        adapter_name: Some("test-adapter".to_string()),
        surface_format: Some("Bgra8UnormSrgb".to_string()),
        present_mode: WgpuPresentMode::Fifo,
        resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
    });
    let frame = prepare_native_frame(
        resolve_stage_layout(
            Some(ViewLayoutInput {
                preset: Some(ViewLayoutOrientation::Landscape),
                ..Default::default()
            }),
            StageContainerInput {
                width: Some(1600.0),
                height: Some(1000.0),
                ..Default::default()
            },
        ),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                provenance: PackageProvenance {
                    content_package_id: Some("runtime.bg".to_string()),
                    required_runtime_packages: BTreeSet::from([
                        "base".to_string(),
                        "runtime.assets".to_string(),
                    ]),
                },
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 12,
            frame: &frame,
            resources: &resources,
        })
        .expect("WGPU backend should submit missing-resource frames when allowed");
    let diagnostics = backend.diagnostics();
    let execution_report = diagnostics
        .last_execution_report
        .as_ref()
        .expect("expected backend execution report");
    let runtime_report = diagnostics
        .last_runtime_report
        .as_ref()
        .expect("expected WGPU runtime report");

    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(execution_report.skipped_draw_count, 1);
    assert_eq!(
        execution_report.skipped_draws_by_owner_package,
        BTreeMap::from([("runtime.bg".to_string(), 1)])
    );
    assert_eq!(
        execution_report.skipped_draws_by_required_package,
        BTreeMap::from([("base".to_string(), 1), ("runtime.assets".to_string(), 1)])
    );
    assert_eq!(
        execution_report.missing_resource_references_by_owner_package,
        BTreeMap::from([("runtime.bg".to_string(), 1)])
    );
    assert_eq!(
        execution_report.missing_resource_references_by_required_package,
        BTreeMap::from([("base".to_string(), 1), ("runtime.assets".to_string(), 1)])
    );
    assert_eq!(runtime_report.skipped_draw_count, 1);
    assert_eq!(
        runtime_report.missing_resource_references_by_resource_id,
        BTreeMap::from([("images:bg/school.png".to_string(), 1)])
    );
    assert_eq!(
        runtime_report.skipped_draws_by_owner_package,
        BTreeMap::from([("runtime.bg".to_string(), 1)])
    );
    assert_eq!(
        runtime_report.skipped_draws_by_required_package,
        BTreeMap::from([("base".to_string(), 1), ("runtime.assets".to_string(), 1)])
    );
    assert_eq!(
        runtime_report.missing_resource_references_by_owner_package,
        BTreeMap::from([("runtime.bg".to_string(), 1)])
    );
    assert_eq!(
        runtime_report.missing_resource_references_by_required_package,
        BTreeMap::from([("base".to_string(), 1), ("runtime.assets".to_string(), 1)])
    );
}
