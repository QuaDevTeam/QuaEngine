use super::*;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferPass, WgpuNativeRenderBufferPlan, WgpuNativeRenderBufferVertex,
    WgpuNativeRenderColor, WgpuNativeRenderDrawCall, WgpuNativeRenderPaint,
    WgpuNativeRenderPaintColor, WgpuNativeRenderSkippedQuad, WgpuNativeRenderSkippedQuadReason,
};

#[test]
fn emits_upload_and_draw_indexed_operations_for_visible_draw_calls() {
    let plan = WgpuNativeRenderPassPlan::from_buffer_plan(&buffer_plan(
        vec![
            vertex(0.0, 0.0),
            vertex(20.0, 0.0),
            vertex(20.0, 10.0),
            vertex(0.0, 10.0),
        ],
        vec![0, 1, 2, 0, 2, 3],
        vec![draw_call(
            "ui:panel",
            DrawBatchPipeline::Ui,
            DrawCommandKind::RoundedRect,
            0,
            6,
            Vec::new(),
        )],
        Vec::new(),
    ));

    assert_eq!(plan.revision, 44);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.upload_operation_count, 2);
    assert_eq!(plan.draw_indexed_operation_count, 1);
    assert_eq!(plan.skipped_operation_count, 0);

    let pass = &plan.passes[0];
    assert_eq!(pass.operation_count, 8);
    assert_eq!(
        pass.operations[0],
        WgpuNativeRenderPassOperation::UploadVertexBuffer {
            byte_len: 4 * std::mem::size_of::<WgpuNativeRenderBufferVertex>(),
            vertex_count: 4,
        }
    );
    assert_eq!(
        pass.operations[1],
        WgpuNativeRenderPassOperation::UploadIndexBuffer {
            byte_len: 6 * std::mem::size_of::<u32>(),
            index_count: 6,
        }
    );
    assert_eq!(
        pass.operations[2],
        WgpuNativeRenderPassOperation::BeginRenderPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
        }
    );
    assert_eq!(
        pass.operations[3],
        WgpuNativeRenderPassOperation::SetViewport {
            viewport: rect(0, 0, 1280, 720),
        }
    );
    assert_eq!(
        pass.operations[4],
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Ui,
        }
    );
    assert!(matches!(
        &pass.operations[5],
        WgpuNativeRenderPassOperation::SetPaint {
            command_id,
            paint: WgpuNativeRenderPaint::Solid { .. },
        } if command_id == "ui:panel"
    ));
    assert_eq!(
        pass.operations[6],
        WgpuNativeRenderPassOperation::DrawIndexed {
            command_id: "ui:panel".to_string(),
            first_index: 0,
            index_count: 6,
            first_vertex: 0,
            vertex_count: 4,
            physical_bounds: rect(0, 0, 20, 10),
            scissor: None,
        }
    );
    assert_eq!(
        pass.operations[7],
        WgpuNativeRenderPassOperation::EndRenderPass { pass_index: 0 }
    );
}

#[test]
fn emits_resource_binds_and_skip_operations_without_uploading_empty_buffers() {
    let plan = WgpuNativeRenderPassPlan::from_buffer_plan(&buffer_plan(
        Vec::new(),
        Vec::new(),
        vec![draw_call(
            "background:main",
            DrawBatchPipeline::Image,
            DrawCommandKind::Image,
            0,
            0,
            vec![ResourceId::from("images:bg/school.png")],
        )],
        vec![WgpuNativeRenderSkippedQuad {
            command_id: "ui:invalid".to_string(),
            reason: WgpuNativeRenderSkippedQuadReason::InvalidPaint,
            physical_bounds: rect(20, 20, 80, 20),
            resource_ids: Vec::new(),
            owner_package_id: Some("runtime.ui".to_string()),
            required_package_ids: vec!["base".to_string()],
        }],
    ));

    assert_eq!(plan.upload_operation_count, 0);
    assert_eq!(plan.draw_indexed_operation_count, 1);
    assert_eq!(plan.skipped_operation_count, 1);

    let pass = &plan.passes[0];
    assert_eq!(
        pass.operations[2],
        WgpuNativeRenderPassOperation::SetPipeline {
            pipeline: DrawBatchPipeline::Image,
        }
    );
    assert_eq!(
        pass.operations[4],
        WgpuNativeRenderPassOperation::BindResources {
            command_id: "background:main".to_string(),
            resource_ids: vec![ResourceId::from("images:bg/school.png")],
        }
    );
    assert_eq!(
        pass.operations[6],
        WgpuNativeRenderPassOperation::SkipDraw {
            command_id: "ui:invalid".to_string(),
            reason: "invalid-paint".to_string(),
            resource_ids: Vec::new(),
            owner_package_id: Some("runtime.ui".to_string()),
            required_package_ids: vec!["base".to_string()],
        }
    );
}

fn buffer_plan(
    vertices: Vec<WgpuNativeRenderBufferVertex>,
    indices: Vec<u32>,
    draw_calls: Vec<WgpuNativeRenderDrawCall>,
    skipped_quads: Vec<WgpuNativeRenderSkippedQuad>,
) -> WgpuNativeRenderBufferPlan {
    WgpuNativeRenderBufferPlan {
        revision: 44,
        pass_count: 1,
        vertex_count: vertices.len(),
        index_count: indices.len(),
        draw_call_count: draw_calls.len(),
        skipped_quad_count: skipped_quads.len(),
        invalid_paint_count: skipped_quads
            .iter()
            .filter(|quad| quad.reason == WgpuNativeRenderSkippedQuadReason::InvalidPaint)
            .count(),
        passes: vec![WgpuNativeRenderBufferPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
            vertex_count: vertices.len(),
            index_count: indices.len(),
            draw_call_count: draw_calls.len(),
            vertices,
            indices,
            draw_calls,
            skipped_quads,
        }],
    }
}

fn draw_call(
    command_id: &str,
    pipeline: DrawBatchPipeline,
    draw_kind: DrawCommandKind,
    first_index: u32,
    index_count: u32,
    resource_ids: Vec<ResourceId>,
) -> WgpuNativeRenderDrawCall {
    WgpuNativeRenderDrawCall {
        command_id: command_id.to_string(),
        pipeline,
        draw_kind,
        first_vertex: 0,
        vertex_count: 4,
        first_index,
        index_count,
        physical_bounds: rect(0, 0, 20, 10),
        scissor: None,
        paint: WgpuNativeRenderPaint::Solid {
            color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor::WHITE),
            literal: "#fff".to_string(),
        },
        opacity: 1.0,
        corner_radius: 0.0,
        resource_ids,
        owner_package_id: Some("runtime.ui".to_string()),
        required_package_ids: vec!["runtime.base".to_string()],
    }
}

fn vertex(x: f32, y: f32) -> WgpuNativeRenderBufferVertex {
    WgpuNativeRenderBufferVertex {
        position: [x, y],
        uv: [0.0, 0.0],
        color: [1.0, 1.0, 1.0, 1.0],
    }
}

fn rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}
