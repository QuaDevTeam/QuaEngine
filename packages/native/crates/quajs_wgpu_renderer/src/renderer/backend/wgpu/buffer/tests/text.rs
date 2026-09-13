use super::*;

mod bitmap;
mod placeholder;

fn text_placeholder_bounds_with_style(style: WgpuNativeRenderTextStyle) -> WgpuPhysicalRect {
    text_placeholder_bounds_for_text_with_style("Wïdë", style)
}

fn min_x_at_y(vertices: &[WgpuNativeRenderBufferVertex], y: f32) -> f32 {
    vertices
        .iter()
        .filter(|vertex| (vertex.position[1] - y).abs() < 0.0001)
        .map(|vertex| vertex.position[0])
        .fold(f32::INFINITY, f32::min)
}

fn bitmap_text_overflow_pass(text_overflow: TextOverflowDrawParam) -> WgpuNativeRenderBufferPass {
    let mut style = text_style(21.0, TextAlign::Left, EdgeInsetsDrawParam::default());
    style.white_space = WhiteSpaceDrawParam::NoWrap;
    style.text_overflow = text_overflow;
    WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:bitmap-overflow",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "HI THERE AGAIN".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 88, 48),
        Vec::new(),
    )]))
    .passes
    .into_iter()
    .next()
    .unwrap()
}

fn text_placeholder_bounds_for_text_with_style(
    text: &str,
    style: WgpuNativeRenderTextStyle,
) -> WgpuPhysicalRect {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:label",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: text.to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 260, 80),
        Vec::new(),
    )]));

    plan.passes[0].draw_calls[0].physical_bounds
}

fn text_placeholder_pass_with_style(
    style: WgpuNativeRenderTextStyle,
) -> WgpuNativeRenderBufferPass {
    WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![quad(
        "ui:justified-body",
        DrawBatchPipeline::Text,
        DrawCommandKind::Text,
        WgpuNativeRenderPaint::TextPlaceholder {
            text: "Onë Twø Sïx Tën Rëd Døg".to_string(),
            color: rgba(0xff, 0xff, 0xff, 0xff),
            literal: "#fff".to_string(),
            style,
        },
        rect(10, 20, 120, 120),
        Vec::new(),
    )]))
    .passes
    .into_iter()
    .next()
    .unwrap()
}

#[test]
fn blurred_text_shadow_expands_glyph_quads_without_adding_draws() {
    let baseline_style = text_style(
        28.0,
        TextAlign::Left,
        EdgeInsetsDrawParam {
            top: 18.0,
            right: 18.0,
            bottom: 18.0,
            left: 18.0,
        },
    );
    let baseline = text_placeholder_pass_with_style(baseline_style.clone());
    let mut shadow_style = baseline_style;
    shadow_style.blur_radius = 12.0;
    let shadow = text_placeholder_pass_with_style(shadow_style);

    assert_eq!(shadow.draw_call_count, 1);
    assert_eq!(shadow.vertex_count, baseline.vertex_count);
    assert_eq!(shadow.index_count, baseline.index_count);
    assert!(
        shadow.draw_calls[0].physical_bounds.width > baseline.draw_calls[0].physical_bounds.width
    );
    assert!(
        shadow.draw_calls[0].physical_bounds.height > baseline.draw_calls[0].physical_bounds.height
    );
    assert!(shadow
        .vertices
        .iter()
        .all(|vertex| vertex.effect0[0] == 1.0));
    assert!(shadow
        .vertices
        .iter()
        .all(|vertex| vertex.effect0[1] == 6.0));
    assert!(shadow.vertices.iter().all(|vertex| {
        vertex.effect0[2] <= vertex.effect1[0] && vertex.effect0[3] <= vertex.effect1[1]
    }));
}
