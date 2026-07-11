use super::*;
use crate::render_graph::{
    DrawBatchPipeline, EdgeInsetsDrawParam, FontStyleDrawParam, RenderPlane, TextAlign,
    TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam, WhiteSpaceDrawParam,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferVertex, WgpuNativeRenderColor, WgpuNativeRenderPaint,
    WgpuNativeRenderPaintColor, WgpuNativeRenderPass, WgpuNativeRenderPassOperation,
    WgpuNativeRenderTextStyle, WgpuNativeRenderVerticalAlign,
};

mod operations;
mod resources;
mod text_resources;

fn render_pass_plan(operations: Vec<WgpuNativeRenderPassOperation>) -> WgpuNativeRenderPassPlan {
    let upload_operation_count = operations
        .iter()
        .filter(|operation| {
            matches!(
                operation,
                WgpuNativeRenderPassOperation::UploadVertexBuffer { .. }
                    | WgpuNativeRenderPassOperation::UploadIndexBuffer { .. }
            )
        })
        .count();
    let draw_indexed_operation_count = operations
        .iter()
        .filter(|operation| matches!(operation, WgpuNativeRenderPassOperation::DrawIndexed { .. }))
        .count();
    let skipped_operation_count = operations
        .iter()
        .filter(|operation| matches!(operation, WgpuNativeRenderPassOperation::SkipDraw { .. }))
        .count();
    let operation_count = operations.len();

    WgpuNativeRenderPassPlan {
        revision: 7,
        pass_count: 1,
        operation_count,
        upload_operation_count,
        draw_indexed_operation_count,
        skipped_operation_count,
        passes: vec![WgpuNativeRenderPass {
            pass_index: 0,
            plane: Some(RenderPlane::Overlay),
            viewport: rect(0, 0, 1280, 720),
            operation_count,
            upload_operation_count,
            draw_indexed_operation_count,
            skipped_operation_count,
            operations,
        }],
    }
}

fn solid(literal: &str) -> WgpuNativeRenderPaint {
    WgpuNativeRenderPaint::Solid {
        color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor::WHITE),
        literal: literal.to_string(),
    }
}

fn texture(asset_name: &str) -> WgpuNativeRenderPaint {
    WgpuNativeRenderPaint::Texture {
        resource_id: Some(ResourceId::from(asset_name)),
        tint: WgpuNativeRenderColor::WHITE,
    }
}

fn text_style() -> WgpuNativeRenderTextStyle {
    WgpuNativeRenderTextStyle {
        font_family: vec!["Qua Sans".to_string()],
        font_size: 24.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: 30.0,
        align: TextAlign::Center,
        vertical_align: WgpuNativeRenderVerticalAlign::Middle,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::NoWrap,
        padding: EdgeInsetsDrawParam::default(),
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
