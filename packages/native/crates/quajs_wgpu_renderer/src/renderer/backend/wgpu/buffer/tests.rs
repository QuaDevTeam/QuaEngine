use super::*;
use crate::render_graph::{
    DrawBatchPipeline, DrawCommandKind, EdgeInsetsDrawParam, FontStyleDrawParam,
    FontWeightDrawParam, RenderPlane, TextAlign, TextDecorationDrawParam, TextOverflowDrawParam,
    TextTransformDrawParam, WhiteSpaceDrawParam,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderColor, WgpuNativeRenderMeshPass, WgpuNativeRenderMeshPlan,
    WgpuNativeRenderPaint, WgpuNativeRenderPaintColor, WgpuNativeRenderQuad,
    WgpuNativeRenderQuadBorder, WgpuNativeRenderTextOverlay, WgpuNativeRenderTextStyle,
    WgpuNativeRenderVertex, WgpuPhysicalRect,
};
use crate::resources::ResourceId;

mod basic;
mod border;
mod button;
mod skip;
mod text;

fn mesh_plan(quads: Vec<WgpuNativeRenderQuad>) -> WgpuNativeRenderMeshPlan {
    let quad_count = quads.len();
    let visible_quad_count = quads.iter().filter(|quad| quad.is_visible()).count();
    let skipped_quad_count = quads
        .iter()
        .filter(|quad| matches!(quad.paint, WgpuNativeRenderPaint::Skipped { .. }))
        .count();
    let invalid_paint_count = quads
        .iter()
        .filter(|quad| matches!(quad.paint, WgpuNativeRenderPaint::InvalidColor { .. }))
        .count();

    WgpuNativeRenderMeshPlan {
        revision: 31,
        pass_count: 1,
        quad_count,
        visible_quad_count,
        skipped_quad_count,
        invalid_paint_count,
        passes: vec![WgpuNativeRenderMeshPass {
            pass_index: 0,
            plane: RenderPlane::Overlay,
            viewport: rect(0, 0, 1280, 720),
            quad_count,
            visible_quad_count,
            skipped_quad_count,
            invalid_paint_count,
            quads,
        }],
    }
}

fn text_placeholder_bounds(align: TextAlign, padding: EdgeInsetsDrawParam) -> WgpuPhysicalRect {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Hi".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style: text_style(20.0, align, padding),
        },
        rect(10, 20, 200, 40),
        Vec::new(),
    )]));

    plan.passes[0].draw_calls[0].physical_bounds
}

fn quad(
    command_id: &str,
    pipeline: DrawBatchPipeline,
    draw_kind: DrawCommandKind,
    paint: WgpuNativeRenderPaint,
    physical_bounds: WgpuPhysicalRect,
    resource_ids: Vec<ResourceId>,
) -> WgpuNativeRenderQuad {
    WgpuNativeRenderQuad {
        command_id: command_id.to_string(),
        pipeline,
        draw_kind,
        physical_bounds,
        scissor: None,
        vertices: vertices(physical_bounds),
        indices: [0, 1, 2, 0, 2, 3],
        paint,
        opacity: 1.0,
        corner_radius: 0.0,
        border: None,
        text_overlay: None,
        owner_package_id: Some("runtime.ui".to_string()),
        required_package_ids: vec!["runtime.base".to_string()],
        resource_ids,
    }
}

fn text_style(
    font_size: f64,
    align: TextAlign,
    padding: EdgeInsetsDrawParam,
) -> WgpuNativeRenderTextStyle {
    WgpuNativeRenderTextStyle {
        font_family: vec!["Inter".to_string()],
        font_size,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: font_size + 8.0,
        align,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        padding,
    }
}

fn vertices(rect: WgpuPhysicalRect) -> [WgpuNativeRenderVertex; 4] {
    let x = rect.x as f32;
    let y = rect.y as f32;
    let width = rect.width as f32;
    let height = rect.height as f32;

    [
        WgpuNativeRenderVertex {
            position: [x, y],
            uv: [0.0, 0.0],
        },
        WgpuNativeRenderVertex {
            position: [x + width, y],
            uv: [1.0, 0.0],
        },
        WgpuNativeRenderVertex {
            position: [x + width, y + height],
            uv: [1.0, 1.0],
        },
        WgpuNativeRenderVertex {
            position: [x, y + height],
            uv: [0.0, 1.0],
        },
    ]
}

fn rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}

fn rgba(red: u8, green: u8, blue: u8, alpha: u8) -> WgpuNativeRenderPaintColor {
    WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
        r: red as f32 / 255.0,
        g: green as f32 / 255.0,
        b: blue as f32 / 255.0,
        a: alpha as f32 / 255.0,
    })
}
