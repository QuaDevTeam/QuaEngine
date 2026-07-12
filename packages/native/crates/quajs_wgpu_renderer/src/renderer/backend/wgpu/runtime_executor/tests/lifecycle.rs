use super::common::*;
use super::*;
use std::collections::BTreeMap;

#[test]
fn applies_runtime_plan_and_tracks_resident_resources() {
    let plan = first_runtime_plan();
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.revision, 1);
    assert_eq!(report.operation_count, plan.operation_count);
    assert_eq!(report.applied_operation_count, plan.operations.len());
    assert_eq!(report.buffer_create_count, 2);
    assert_eq!(report.pipeline_create_count, 1);
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.queue_write_count, 2);
    assert_eq!(report.resident_buffer_count, 2);
    assert_eq!(report.resident_buffer_byte_len, 280);
    assert_eq!(report.resident_pipeline_count, 1);
    assert_eq!(report.resident_bind_group_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 1);
    assert_eq!(executor.last_report(), Some(&report));
    assert_eq!(
        executor.snapshot(),
        WgpuNativeRenderRuntimeSnapshot {
            resident_buffer_count: 2,
            resident_buffer_byte_len: 280,
            resident_pipeline_count: 1,
            resident_bind_group_count: 1,
            resident_texture_count: 0,
            resident_texture_byte_len: 0,
            resident_texture_resource_ids: Vec::new(),
            resident_texture_byte_len_by_package: Default::default(),
            texture_sampler_diagnostics: Default::default(),
            submitted_command_buffer_count: 1,
        }
    );
}

#[test]
fn reports_skipped_draw_reasons_and_missing_resources_from_runtime_plan() {
    let plan = WgpuNativeRenderRuntimePlan {
        revision: 42,
        operation_count: 7,
        encoder_count: 1,
        render_pass_count: 1,
        skipped_draw_count: 3,
        submit_count: 1,
        operations: vec![
            WgpuNativeRenderRuntimeOperation::CreateCommandEncoder {
                label: "encoder".to_string(),
                pass_count: 1,
                command_count: 5,
            },
            WgpuNativeRenderRuntimeOperation::BeginRenderPass {
                encoder_label: "encoder".to_string(),
                pass_label: "pass".to_string(),
                pass_index: 0,
                plane: None,
                viewport: WgpuPhysicalRect {
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                },
                command_count: 3,
            },
            WgpuNativeRenderRuntimeOperation::SkipDraw {
                pass_label: "pass".to_string(),
                command_id: "background:school".to_string(),
                reason: "missing resources".to_string(),
                resource_ids: vec!["images:bg/school.png".to_string()],
                owner_package_id: Some("runtime.menu".to_string()),
                required_package_ids: vec!["base".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::SkipDraw {
                pass_label: "pass".to_string(),
                command_id: "ui:menu-title".to_string(),
                reason: "missing resources".to_string(),
                resource_ids: vec!["images:bg/school.png".to_string(), "fonts:menu".to_string()],
                owner_package_id: Some("runtime.menu".to_string()),
                required_package_ids: vec!["base".to_string(), "runtime.theme".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::SkipDraw {
                pass_label: "pass".to_string(),
                command_id: "ui:confirm".to_string(),
                reason: "pipeline unavailable".to_string(),
                resource_ids: vec!["images:decorative-frame.png".to_string()],
                owner_package_id: Some("runtime.ui".to_string()),
                required_package_ids: vec!["base".to_string()],
            },
            WgpuNativeRenderRuntimeOperation::EndRenderPass {
                pass_label: "pass".to_string(),
            },
            WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
                encoder_label: "encoder".to_string(),
                pass_count: 1,
                command_count: 3,
            },
        ],
        ..Default::default()
    };
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();

    let report = executor.apply_runtime_plan(&plan).unwrap();

    assert_eq!(report.skipped_draw_count, 3);
    assert_eq!(
        report.skipped_draws_by_reason,
        BTreeMap::from([
            ("missing resources".to_string(), 2),
            ("pipeline unavailable".to_string(), 1),
        ])
    );
    assert_eq!(
        report.missing_resource_references_by_resource_id,
        BTreeMap::from([
            ("fonts:menu".to_string(), 1),
            ("images:bg/school.png".to_string(), 2),
        ])
    );
    assert_eq!(
        report.skipped_draws_by_owner_package,
        BTreeMap::from([
            ("runtime.menu".to_string(), 2),
            ("runtime.ui".to_string(), 1)
        ])
    );
    assert_eq!(
        report.skipped_draws_by_required_package,
        BTreeMap::from([("base".to_string(), 3), ("runtime.theme".to_string(), 1)])
    );
    assert_eq!(
        report.missing_resource_references_by_owner_package,
        BTreeMap::from([("runtime.menu".to_string(), 3)])
    );
    assert_eq!(
        report.missing_resource_references_by_required_package,
        BTreeMap::from([("base".to_string(), 3), ("runtime.theme".to_string(), 2)])
    );
    assert_eq!(report.applied_operation_count, plan.operations.len());
}

#[test]
fn applies_recreate_and_release_across_frames() {
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();
    executor
        .apply_runtime_plan(&runtime_plan(
            1,
            QUAD_VERTEX_BYTE_LEN,
            "bind-group::old",
            "images:old.png",
            None,
        ))
        .unwrap();
    let second = second_runtime_plan();

    let report = executor.apply_runtime_plan(&second).unwrap();

    assert_eq!(report.revision, 2);
    assert_eq!(report.buffer_recreate_count, 1);
    assert_eq!(report.pipeline_reuse_count, 1);
    assert_eq!(report.bind_group_release_count, 1);
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(report.resident_buffer_count, 2);
    assert_eq!(
        report.resident_buffer_byte_len,
        5 * WgpuNativeRenderBufferVertex::BYTE_LEN + 24
    );
    assert_eq!(report.resident_pipeline_count, 1);
    assert_eq!(report.resident_bind_group_count, 1);
    assert_eq!(report.submitted_command_buffer_count, 2);
}

#[test]
fn rejects_reusing_pipeline_with_mismatched_key() {
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();
    let first = runtime_plan(
        1,
        QUAD_VERTEX_BYTE_LEN,
        "bind-group::old",
        "images:old.png",
        None,
    );
    let first_report = executor.apply_runtime_plan(&first).unwrap();
    let committed_snapshot = executor.snapshot();
    let mut second = second_runtime_plan();
    let operation = second
        .operations
        .iter_mut()
        .find(|operation| {
            matches!(
                operation,
                WgpuNativeRenderRuntimeOperation::ReusePipeline { .. }
            )
        })
        .expect("expected pipeline reuse operation");
    if let WgpuNativeRenderRuntimeOperation::ReusePipeline { key, .. } = operation {
        key.pipeline = DrawBatchPipeline::Image;
    }

    let error = executor.apply_runtime_plan(&second).unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("pipeline::ui"));
    assert!(error.message.contains("key mismatch"));
    assert_eq!(executor.snapshot(), committed_snapshot);
    assert_eq!(executor.applied_reports(), &[first_report]);
}

#[test]
fn rejects_draw_without_open_render_pass() {
    let mut plan = first_runtime_plan();
    plan.operations.retain(|operation| {
        !matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::BeginRenderPass { .. }
        )
    });
    plan.operation_count = plan.operations.len();
    let mut executor = InMemoryWgpuNativeRenderRuntimeExecutor::new();

    let error = executor.apply_runtime_plan(&plan).unwrap_err();

    assert_eq!(
        error.kind,
        WgpuNativeRenderRuntimeErrorKind::InvalidOperationOrder
    );
    assert!(error.message.contains("active pass"));
}
