use super::*;

#[test]
fn binds_font_resources_as_text_atlas_groups_for_text_placeholder() {
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
            pipeline: DrawBatchPipeline::Text,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "ui:title".to_string(),
            paint: WgpuNativeRenderPaint::TextPlaceholder {
                text: "Compiled Menu".to_string(),
                color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor::WHITE),
                literal: "#ffffff".to_string(),
                style: text_style(),
            },
        },
        WgpuNativeRenderPassOperation::BindResources {
            command_id: "ui:title".to_string(),
            resource_ids: vec![ResourceId::from("fonts:Qua Sans")],
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "ui:title".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(40, 32, 240, 40),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::EndRenderPass { pass_index: 0 },
    ]));

    assert_eq!(plan.resource_bind_group_count, 1);
    let pass = &plan.passes[0];
    assert!(pass.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderPipelineOperation::BindResourceGroup { group }
            if group.command_id == "ui:title"
                && group.layout == WgpuNativeRenderBindGroupLayout::TextAtlas
                && group.resource_ids == vec![ResourceId::from("fonts:Qua Sans")]
    )));
    assert!(pass.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderPipelineOperation::DrawIndexed { command_id, key, .. }
            if command_id == "ui:title"
                && key.shader == WgpuNativeRenderShader::TextPlaceholder
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::TextAtlas
    )));
}

#[test]
fn binds_builtin_text_atlas_when_text_placeholder_has_no_font_resource() {
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
            pipeline: DrawBatchPipeline::Text,
        },
        WgpuNativeRenderPassOperation::SetPaint {
            command_id: "ui:title".to_string(),
            paint: WgpuNativeRenderPaint::TextPlaceholder {
                text: "Compiled Menu".to_string(),
                color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor::WHITE),
                literal: "#ffffff".to_string(),
                style: text_style(),
            },
        },
        WgpuNativeRenderPassOperation::BindResources {
            command_id: "ui:title".to_string(),
            resource_ids: Vec::new(),
        },
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "ui:title".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(40, 32, 240, 40),
            scissor: None,
        },
        WgpuNativeRenderPassOperation::EndRenderPass { pass_index: 0 },
    ]));

    assert_eq!(plan.resource_bind_group_count, 1);
    let pass = &plan.passes[0];
    assert!(pass.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderPipelineOperation::BindResourceGroup { group }
            if group.command_id == "ui:title"
                && group.layout == WgpuNativeRenderBindGroupLayout::TextAtlas
                && group.resource_ids
                    == vec![ResourceId::from("glyph-atlas:builtin-bitmap-ascii")]
    )));
}
