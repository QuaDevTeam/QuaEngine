use super::*;
use crate::render_graph::{
    BorderDrawParams, DrawBatchPipeline, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    FontStyleDrawParam, FontWeightDrawParam, ImageDrawParams, LogicalRect, MediaFit, MediaOrigin,
    PanelDrawParams, RenderPlane, TextAlign, TextDecorationDrawParam, TextDrawParams,
    TextOverflowDrawParam, TextTransformDrawParam, UiButtonDrawParams, WhiteSpaceDrawParam,
};
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderPrimitive, WgpuNativeRenderPrimitiveBorder, WgpuNativeRenderPrimitiveKind,
    WgpuNativeRenderPrimitivePass, WgpuNativeRenderPrimitivePlan, WgpuNativeRenderTextStyle,
    WgpuNativeRenderVerticalAlign, WgpuPhysicalRect,
};
use crate::resources::ResourceId;

mod basic;
mod button;
mod chevron;
mod diagnostics;
mod gradient; // Analytic gradient geometry and stop-interval coverage.
mod media;
mod text;

fn primitive_plan(primitives: Vec<WgpuNativeRenderPrimitive>) -> WgpuNativeRenderPrimitivePlan {
    let primitive_count = primitives.len();
    let skipped_draw_count = primitives
        .iter()
        .filter(|primitive| {
            matches!(
                primitive.kind,
                WgpuNativeRenderPrimitiveKind::Skipped { .. }
            )
        })
        .count();
    let visible_primitive_count = primitives
        .iter()
        .filter(|primitive| primitive.is_visible())
        .count();

    WgpuNativeRenderPrimitivePlan {
        revision: 99,
        pass_count: 1,
        primitive_count,
        skipped_draw_count,
        visible_primitive_count,
        passes: vec![WgpuNativeRenderPrimitivePass {
            pass_index: 0,
            plane: RenderPlane::Overlay,
            viewport: physical_rect(0, 0, 1280, 720),
            primitive_count,
            skipped_draw_count,
            visible_primitive_count,
            primitives,
        }],
    }
}

fn primitive(
    command_id: &str,
    pipeline: DrawBatchPipeline,
    draw_kind: DrawCommandKind,
    kind: WgpuNativeRenderPrimitiveKind,
    physical_bounds: WgpuPhysicalRect,
    resource_ids: Vec<ResourceId>,
) -> WgpuNativeRenderPrimitive {
    WgpuNativeRenderPrimitive {
        command_id: command_id.to_string(),
        pipeline,
        draw_kind,
        kind,
        logical_bounds: LogicalRect {
            x: 10.0,
            y: 20.0,
            width: 120.0,
            height: 36.0,
        },
        physical_bounds,
        scissor: None,
        opacity: 1.0,
        owner_package_id: Some("runtime.menu".to_string()),
        required_package_ids: vec!["runtime.ui".to_string()],
        resource_ids,
    }
}

fn physical_rect(x: u32, y: u32, width: u32, height: u32) -> WgpuPhysicalRect {
    WgpuPhysicalRect {
        x,
        y,
        width,
        height,
    }
}

fn quad_vertices(x: f32, y: f32, width: f32, height: f32) -> [WgpuNativeRenderVertex; 4] {
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

fn rgba(red: u8, green: u8, blue: u8, alpha: u8) -> WgpuNativeRenderPaintColor {
    WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
        r: red as f32 / 255.0,
        g: green as f32 / 255.0,
        b: blue as f32 / 255.0,
        a: alpha as f32 / 255.0,
    })
}

fn text_style(
    font_size: f64,
    align: TextAlign,
    padding: EdgeInsetsDrawParam,
) -> WgpuNativeRenderTextStyle {
    WgpuNativeRenderTextStyle {
        inline: None,
        font_family: vec!["Inter".to_string()],
        font_size,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: font_size + 8.0,
        align,
        vertical_align: WgpuNativeRenderVerticalAlign::Middle,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        blur_radius: 0.0,
        padding,
    }
}

fn rich_text_style() -> WgpuNativeRenderTextStyle {
    WgpuNativeRenderTextStyle {
        inline: None,
        font_family: vec!["Inter".to_string(), "Noto Serif".to_string()],
        font_size: 24.0,
        font_style: FontStyleDrawParam::Italic,
        font_weight: Some(FontWeightDrawParam::Number(700)),
        letter_spacing: 1.25,
        line_height: 32.0,
        align: TextAlign::Right,
        vertical_align: WgpuNativeRenderVerticalAlign::Middle,
        text_decoration: TextDecorationDrawParam::Underline,
        text_overflow: TextOverflowDrawParam::Ellipsis,
        text_transform: TextTransformDrawParam::Uppercase,
        white_space: WhiteSpaceDrawParam::NoWrap,
        blur_radius: 0.0,
        padding: EdgeInsetsDrawParam {
            top: 2.0,
            right: 8.0,
            bottom: 2.0,
            left: 4.0,
        },
    }
}

fn assert_position_close(actual: [f32; 2], expected: [f32; 2]) {
    const EPSILON: f32 = 0.0001;
    assert!(
        (actual[0] - expected[0]).abs() <= EPSILON,
        "x position {actual:?} did not match {expected:?}"
    );
    assert!(
        (actual[1] - expected[1]).abs() <= EPSILON,
        "y position {actual:?} did not match {expected:?}"
    );
}

#[allow(dead_code)]
fn _draw_param_compile_guard() {
    let _ = DrawCommandParams::Image(ImageDrawParams {
        asset_type: "images".to_string(),
        asset_name: "bg.png".to_string(),
        fit: MediaFit::Cover,
        origin: MediaOrigin::default(),
        source: LogicalRect::default(),
        rotation_degrees: 0.0,
        brightness: 1.0,
        saturation: 1.0,
        contrast: 1.0,
        grayscale: 0.0,
        sepia: 0.0,
        hue_rotate_radians: 0.0,
        invert: 0.0,
    });
    let _ = DrawCommandParams::Text(TextDrawParams {
        inline: None,
        text: "x".to_string(),
        font_family: vec!["Inter".to_string()],
        font_size: 16.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: 20.0,
        align: TextAlign::Left,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        color: "#fff".to_string(),
        blur_radius: 0.0,
        padding: EdgeInsetsDrawParam::default(),
        role: "body".to_string(),
        rotation_degrees: 0.0,
    });
    let _ = DrawCommandParams::Panel(PanelDrawParams {
        role: "panel".to_string(),
        rotation_degrees: 0.0,
        corner_radius: 0.0,
        fill_color: "#000".to_string(),
        border: BorderDrawParams::default(),
        padding: EdgeInsetsDrawParam::default(),
        intent: None,
    });
    let _ = DrawCommandParams::UiButton(UiButtonDrawParams {
        label: "x".to_string(),
        enabled: true,
        role: "button".to_string(),
        background_color: "#000".to_string(),
        text_color: "#fff".to_string(),
        corner_radius: 0.0,
        border: BorderDrawParams::default(),
        font_family: Vec::new(),
        font_size: 16.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        letter_spacing: 0.0,
        line_height: 20.0,
        align: TextAlign::Center,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::Normal,
        padding: EdgeInsetsDrawParam::default(),
        intent: None,
    });
}
