use super::*;

#[test]
fn resets_resource_bindings_between_draws_and_keeps_skips_descriptor_free() {
    let plan = WgpuNativeRenderPipelinePlan::from_render_pass_plan(&render_pass_plan(vec![
        WgpuNativeRenderPassOperation::BeginRenderPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 800, 600),
        },
        WgpuNativeRenderPassOperation::SetViewport {
            viewport: rect(0, 0, 800, 600),
        },
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Image,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "image:first".to_string(),
            paint: texture("images/one.png"),
        },
        WgpuNativeRenderPassOperation::BindResources {
            command_id: "image:first".to_string(),
            resource_ids: vec![ResourceId::from("images/one.png")],
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "image:first".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(0, 0, 100, 100),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "ui:second".to_string(),
            paint: solid("#fff"),
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "ui:second".to_string(),
            first_index: 6,
            index_count: 6,
            first_vertex: 4,
            vertex_count: 4,
            physical_bounds: rect(100, 0, 100, 100),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::SkipDraw {
            command_id: "ui:invalid".to_string(),
            reason: "invalid-paint".to_string(),
            resource_ids: vec![ResourceId::from("images/bad.png")],
            owner_package_id: Some("runtime.ui".to_string()),
            required_package_ids: vec!["base".to_string(), "runtime.theme".to_string()],
        },
        WgpuNativeRenderPassOperation::EndRenderPass { pass_index: 0 },
    ]));

    assert_eq!(plan.resource_bind_group_count, 1);
    assert_eq!(plan.draw_indexed_count, 2);
    assert_eq!(plan.skipped_operation_count, 1);
    assert_eq!(plan.pipeline_descriptor_count, 2);

    let pass = &plan.passes[0];
    let bind_groups = pass
        .operations
        .iter()
        .filter(|operation| {
            matches!(
                operation,
                WgpuNativeRenderPipelineOperation::BindResourceGroup { .. }
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(bind_groups.len(), 1);
    assert!(matches!(
        pass.operations.iter().find(|operation| matches!(
            operation,
            WgpuNativeRenderPipelineOperation::SkipDraw {
                command_id,
                owner_package_id,
                required_package_ids,
                ..
            } if command_id == "ui:invalid"
                && owner_package_id.as_deref() == Some("runtime.ui")
                && required_package_ids == &vec!["base".to_string(), "runtime.theme".to_string()]
        )),
        Some(WgpuNativeRenderPipelineOperation::SkipDraw { .. })
    ));
    assert!(pass.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderPipelineOperation::DrawIndexed { command_id, key, .. }
            if command_id == "ui:second"
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::None
    )));
}
