use super::*;
use crate::render_graph::{GradientDrawKind, GradientDrawRadialShape};

fn gradient_primitive(
    kind: GradientDrawKind,
    angle_degrees: f64,
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_offset: f64,
    end_offset: f64,
    physical_bounds: WgpuPhysicalRect,
) -> WgpuNativeRenderPrimitive {
    gradient_primitive_with_options(
        kind,
        GradientDrawRadialShape::Circle,
        angle_degrees,
        center_x,
        center_y,
        radius,
        start_offset,
        end_offset,
        true,
        true,
        physical_bounds,
    )
}

#[allow(clippy::too_many_arguments)]
fn gradient_primitive_with_options(
    kind: GradientDrawKind,
    radial_shape: GradientDrawRadialShape,
    angle_degrees: f64,
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_offset: f64,
    end_offset: f64,
    fill_before_start: bool,
    fill_after_end: bool,
    physical_bounds: WgpuPhysicalRect,
) -> WgpuNativeRenderPrimitive {
    primitive(
        "ui:scrim",
        DrawBatchPipeline::Shape,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPrimitiveKind::Gradient {
            kind,
            radial_shape,
            start_color: "rgba(0,0,0,1)".to_string(),
            end_color: "rgba(255,255,255,1)".to_string(),
            angle_degrees,
            center_x,
            center_y,
            radius,
            start_offset,
            end_offset,
            fill_before_start,
            fill_after_end,
            corner_radius: 0.0,
        },
        physical_bounds,
        Vec::new(),
    )
}

fn only_quad(primitive: WgpuNativeRenderPrimitive) -> WgpuNativeRenderQuad {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive]));
    plan.passes[0].quads[0].clone()
}

/// Global progress the shader computes before applying one stop interval.
fn linear_progress(quad: &WgpuNativeRenderQuad, u: f32, v: f32) -> f32 {
    (u - 0.5) * quad.effect1[0] + (v - 0.5) * quad.effect1[1] + quad.effect1[2]
}

/// Progress the shader would compute for a radial gradient at a given UV.
fn radial_progress(quad: &WgpuNativeRenderQuad, u: f32, v: f32) -> f32 {
    let dx = u - quad.effect1[0];
    let dy = v - quad.effect1[1];
    (dx * dx + dy * dy).sqrt() * quad.effect1[2]
}

/// Segment-local interpolation or `None` when the shader discards this draw.
fn segment_progress(quad: &WgpuNativeRenderQuad, global_progress: f32) -> Option<f32> {
    if global_progress < quad.effect2[0] && quad.effect2[2] < 0.5 {
        return None;
    }
    if global_progress >= quad.effect2[1] && quad.effect2[3] < 0.5 {
        return None;
    }
    Some(
        ((global_progress - quad.effect2[0]) / (quad.effect2[1] - quad.effect2[0]).max(0.000_001))
            .clamp(0.0, 1.0),
    )
}

fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() <= 0.001,
        "expected {expected}, got {actual}"
    );
}

#[test]
fn projects_a_horizontal_linear_gradient_across_the_quad_width() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Linear,
        90.0,
        0.5,
        0.5,
        0.0,
        0.0,
        1.0,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert_eq!(quad.effect1[3], 4.0);
    assert_close(linear_progress(&quad, 0.0, 0.5), 0.0);
    assert_close(linear_progress(&quad, 0.5, 0.5), 0.5);
    assert_close(linear_progress(&quad, 1.0, 0.5), 1.0);
    // A 90deg gradient must not vary along the cross axis.
    assert_close(
        linear_progress(&quad, 0.25, 0.0),
        linear_progress(&quad, 0.25, 1.0),
    );
}

#[test]
fn projects_a_vertical_linear_gradient_across_the_quad_height() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Linear,
        180.0,
        0.5,
        0.5,
        0.0,
        0.0,
        1.0,
        physical_rect(0, 0, 1920, 1080),
    ));

    // UVs are aspect-warped, so the vertical extremes are no longer 0 and 1.
    let aspect = 1080.0 / 1920.0;
    let top = (0.0 - 0.5) * aspect + 0.5;
    let bottom = (1.0 - 0.5) * aspect + 0.5;
    assert_close(linear_progress(&quad, 0.5, top), 0.0);
    assert_close(linear_progress(&quad, 0.5, bottom), 1.0);
}

#[test]
fn narrows_a_linear_gradient_to_its_color_stop_window() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Linear,
        90.0,
        0.5,
        0.5,
        0.0,
        0.25,
        0.75,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert_eq!(quad.effect2, [0.25, 0.75, 1.0, 1.0]);
    assert_close(
        segment_progress(&quad, linear_progress(&quad, 0.25, 0.5)).unwrap(),
        0.0,
    );
    assert_close(
        segment_progress(&quad, linear_progress(&quad, 0.5, 0.5)).unwrap(),
        0.5,
    );
    assert_close(
        segment_progress(&quad, linear_progress(&quad, 0.75, 0.5)).unwrap(),
        1.0,
    );
    assert_close(
        segment_progress(&quad, linear_progress(&quad, 0.0, 0.5)).unwrap(),
        0.0,
    );
    assert_close(
        segment_progress(&quad, linear_progress(&quad, 1.0, 0.5)).unwrap(),
        1.0,
    );
}

#[test]
fn keeps_a_radial_gradient_circular_on_a_wide_quad() {
    // A radial gradient measured in raw UV space would be an ellipse on a 16:9
    // quad. Equal pixel distances must give equal progress on both axes.
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Radial,
        0.0,
        0.5,
        0.5,
        0.5,
        0.0,
        1.0,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert_eq!(quad.effect1[3], 5.0);
    let aspect = 1080.0f32 / 1920.0;
    // 192 physical px right of centre, and the same 192 px below it.
    let horizontal = radial_progress(&quad, 0.5 + 0.1, 0.5);
    let vertical = radial_progress(&quad, 0.5, (0.5 + 0.1 / aspect - 0.5) * aspect + 0.5);
    assert_close(horizontal, vertical);
    assert_close(horizontal, 0.2);
}

#[test]
fn scales_a_radial_gradient_ramp_by_its_end_offset() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Radial,
        0.0,
        0.5,
        0.5,
        0.5,
        0.0,
        0.5,
        physical_rect(0, 0, 1920, 1080),
    ));

    // Geometry remains global; the segment window performs local interpolation.
    assert_close(
        segment_progress(&quad, radial_progress(&quad, 0.5 + 0.125, 0.5)).unwrap(),
        0.5,
    );
    assert_close(
        segment_progress(&quad, radial_progress(&quad, 0.5 + 0.25, 0.5)).unwrap(),
        1.0,
    );
}

#[test]
fn preserves_a_non_zero_radial_start_stop() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Radial,
        0.0,
        0.5,
        0.5,
        0.5,
        0.46,
        1.0,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert_eq!(quad.effect2, [0.46, 1.0, 1.0, 1.0]);
    assert_close(segment_progress(&quad, 0.0).unwrap(), 0.0);
    assert_close(segment_progress(&quad, 0.46).unwrap(), 0.0);
    assert_close(segment_progress(&quad, 0.73).unwrap(), 0.5);
    assert_close(segment_progress(&quad, 1.0).unwrap(), 1.0);
}

#[test]
fn masks_adjacent_translucent_segments_to_non_overlapping_intervals() {
    let first = only_quad(gradient_primitive_with_options(
        GradientDrawKind::Linear,
        GradientDrawRadialShape::Circle,
        90.0,
        0.5,
        0.5,
        0.0,
        0.0,
        0.5,
        true,
        false,
        physical_rect(0, 0, 1920, 1080),
    ));
    let second = only_quad(gradient_primitive_with_options(
        GradientDrawKind::Linear,
        GradientDrawRadialShape::Circle,
        90.0,
        0.5,
        0.5,
        0.0,
        0.5,
        1.0,
        false,
        true,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert!(segment_progress(&first, 0.25).is_some());
    assert!(segment_progress(&second, 0.25).is_none());
    assert!(segment_progress(&first, 0.5).is_none());
    assert_close(segment_progress(&second, 0.5).unwrap(), 0.0);
    assert!(segment_progress(&first, 0.75).is_none());
    assert!(segment_progress(&second, 0.75).is_some());
}

#[test]
fn keeps_ellipse_geometry_in_normalized_uv_space() {
    let quad = only_quad(gradient_primitive_with_options(
        GradientDrawKind::Radial,
        GradientDrawRadialShape::Ellipse,
        0.0,
        0.52,
        0.4,
        0.7,
        0.0,
        1.0,
        true,
        true,
        physical_rect(0, 0, 1920, 1080),
    ));

    assert_close(quad.effect1[0], 0.52);
    assert_close(quad.effect1[1], 0.4);
    assert_close(
        radial_progress(&quad, 0.62, 0.4),
        radial_progress(&quad, 0.52, 0.5),
    );
    for vertex in &quad.vertices {
        assert!(vertex.uv[1] == 0.0 || vertex.uv[1] == 1.0);
    }
}

#[test]
fn offsets_a_radial_gradient_center_by_the_quad_aspect() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Radial,
        0.0,
        0.52,
        0.4,
        0.62,
        0.0,
        1.0,
        physical_rect(0, 0, 1920, 1080),
    ));

    let aspect = 1080.0f32 / 1920.0;
    assert_close(quad.effect1[0], 0.52);
    assert_close(quad.effect1[1], (0.4 - 0.5) * aspect + 0.5);
}

#[test]
fn leaves_square_quad_gradients_unwarped() {
    let quad = only_quad(gradient_primitive(
        GradientDrawKind::Radial,
        0.0,
        0.5,
        0.5,
        0.5,
        0.0,
        1.0,
        physical_rect(0, 0, 256, 256),
    ));

    assert_close(quad.effect1[1], 0.5);
    for vertex in &quad.vertices {
        assert!(vertex.uv[1] == 0.0 || vertex.uv[1] == 1.0);
    }
}

#[test]
fn keeps_the_shadow_effect_channel_reachable_for_non_gradient_primitives() {
    // The solid shader dispatches on effect1.w for gradients and then falls
    // through to effect0.x for shadows. Gradient sentinels must not leak into
    // primitives that rely on that fallthrough.
    let quad = only_quad(primitive(
        "ui:panel",
        DrawBatchPipeline::Shape,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPrimitiveKind::Panel {
            role: String::new(),
            fill_color: "#336699".to_string(),
            corner_radius: 0.0,
            border: WgpuNativeRenderPrimitiveBorder {
                color: None,
                width: 0.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 1920, 1080),
        Vec::new(),
    ));

    assert_eq!(quad.effect1[3], 0.0);
    assert_eq!(quad.effect0[0], 0.0);
}
