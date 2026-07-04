use super::super::test_fixture::{bind_group, buffer, device_plan, pipeline};
use super::*;
use crate::render_graph::DrawBatchPipeline;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferRole, WgpuNativeRenderResourceCachePlan,
};

#[test]
fn builds_ordered_runtime_apply_plan_from_device_and_cache_plans() {
    let first = device_plan(
        1,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 128),
            buffer("index", WgpuNativeRenderBufferRole::Index, 24),
            buffer("stale", WgpuNativeRenderBufferRole::Vertex, 8),
        ],
        vec![pipeline("pipeline::ui", DrawBatchPipeline::Ui)],
        vec![bind_group("bind-group::old", ["images:old.png"])],
    );
    let first_cache = WgpuNativeRenderResourceCachePlan::from_device_plan(None, &first);
    let second = device_plan(
        2,
        vec![
            buffer("vertex", WgpuNativeRenderBufferRole::Vertex, 160),
            buffer("index", WgpuNativeRenderBufferRole::Index, 24),
        ],
        vec![pipeline("pipeline::ui", DrawBatchPipeline::Ui)],
        vec![bind_group("bind-group::new", ["images:new.png"])],
    );
    let second_cache =
        WgpuNativeRenderResourceCachePlan::from_device_plan(Some(&first_cache), &second);

    let plan = WgpuNativeRenderRuntimePlan::from_device_and_cache_plans(&second, &second_cache);

    assert_eq!(plan.revision, 2);
    assert_eq!(plan.previous_revision, Some(1));
    assert_eq!(plan.queue_write_count, 2);
    assert_eq!(plan.queue_write_byte_len, 184);
    assert_eq!(plan.encoder_count, 1);
    assert_eq!(plan.render_pass_count, 1);
    assert_eq!(plan.render_pass_command_count, 8);
    assert_eq!(plan.draw_indexed_count, 1);
    assert_eq!(plan.skipped_draw_count, 0);
    assert_eq!(plan.submit_count, 1);
    assert_eq!(plan.operation_count, plan.operations.len());
    assert_eq!(plan.release_operation_count, 2);
    assert_eq!(plan.cache_operation_count, 4);
    assert_first_operations_release_stale_resources(&plan);
    assert_cache_operations_track_frame_delta(&plan);
    assert!(queue_write_index(&plan) > recreate_buffer_index(&plan));
    assert!(begin_pass_index(&plan) > queue_write_index(&plan));
    assert!(matches!(
        plan.operations.last(),
        Some(WgpuNativeRenderRuntimeOperation::SubmitCommandBuffer {
            encoder_label,
            pass_count: 1,
            ..
        }) if encoder_label == "encoder::2"
    ));
}

fn assert_first_operations_release_stale_resources(plan: &WgpuNativeRenderRuntimePlan) {
    assert!(matches!(
        plan.operations.first(),
        Some(WgpuNativeRenderRuntimeOperation::ReleaseBuffer { label, .. })
            if label == "stale"
    ));
    assert!(matches!(
        plan.operations.get(1),
        Some(WgpuNativeRenderRuntimeOperation::ReleaseBindGroup { cache_label })
            if cache_label == "bind-group::old"
    ));
}

fn assert_cache_operations_track_frame_delta(plan: &WgpuNativeRenderRuntimePlan) {
    assert!(plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::RecreateBuffer { label, byte_len, .. }
            if label == "vertex" && *byte_len == 160
    )));
    assert!(plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::ReusePipeline { cache_label, .. }
            if cache_label == "pipeline::ui"
    )));
    assert!(plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            cache_label,
            resource_ids,
            ..
        } if cache_label == "bind-group::new"
            && resource_ids == &vec!["images:new.png".to_string()]
    )));
}

fn queue_write_index(plan: &WgpuNativeRenderRuntimePlan) -> usize {
    operation_index(plan, |operation| {
        matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::QueueWrite { .. }
        )
    })
}

fn recreate_buffer_index(plan: &WgpuNativeRenderRuntimePlan) -> usize {
    operation_index(plan, |operation| {
        matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::RecreateBuffer { .. }
        )
    })
}

fn begin_pass_index(plan: &WgpuNativeRenderRuntimePlan) -> usize {
    operation_index(plan, |operation| {
        matches!(
            operation,
            WgpuNativeRenderRuntimeOperation::BeginRenderPass { .. }
        )
    })
}

fn operation_index(
    plan: &WgpuNativeRenderRuntimePlan,
    predicate: impl Fn(&WgpuNativeRenderRuntimeOperation) -> bool,
) -> usize {
    plan.operations
        .iter()
        .position(predicate)
        .expect("expected operation")
}
