use super::*;

fn chevron_quad(primitive: WgpuNativeRenderPrimitive) -> WgpuNativeRenderQuad {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive]));
    plan.passes[0].quads[0].clone()
}

#[test]
fn collapses_a_right_chevron_role_into_a_sideways_triangle() {
    let quad = chevron_quad(primitive(
        "ui:menu:start:chevron",
        DrawBatchPipeline::Shape,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPrimitiveKind::Panel {
            role: "ui-chevron-right".to_string(),
            fill_color: "rgba(255,250,242,0.34)".to_string(),
            corner_radius: 0.0,
            border: WgpuNativeRenderPrimitiveBorder {
                color: None,
                width: 0.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(100, 40, 12, 20),
        Vec::new(),
    ));

    let positions = quad.vertices.map(|vertex| vertex.position);
    // Two vertices on the left edge, and a doubled apex at the right midpoint.
    assert_eq!(positions[0], [100.0, 40.0]);
    assert_eq!(positions[1], [100.0, 60.0]);
    assert_eq!(positions[2], [112.0, 50.0]);
    assert_eq!(positions[3], positions[2]);
}
