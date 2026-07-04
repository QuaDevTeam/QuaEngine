use super::*;

#[test]
fn emits_border_segments_as_solid_rect_draw_calls() {
    let mut panel = quad(
        "ui:panel",
        DrawBatchPipeline::Ui,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 100, 40),
        Vec::new(),
    );
    panel.border = Some(WgpuNativeRenderQuadBorder {
        color: Some(rgba(0xff, 0x00, 0x00, 0xff)),
        literal: Some("#f00".to_string()),
        width: 2.0,
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![panel]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 20);
    assert_eq!(pass.index_count, 30);
    assert_eq!(pass.draw_call_count, 5);
    assert_eq!(
        pass.draw_calls
            .iter()
            .map(|draw_call| draw_call.command_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "ui:panel",
            "ui:panel:border:top",
            "ui:panel:border:right",
            "ui:panel:border:bottom",
            "ui:panel:border:left",
        ]
    );
    assert_eq!(pass.draw_calls[1].draw_kind, DrawCommandKind::Rect);
    assert_eq!(pass.draw_calls[1].first_vertex, 4);
    assert_eq!(pass.draw_calls[1].first_index, 6);
    assert_eq!(pass.vertices[4].position, [10.0, 20.0]);
    assert_eq!(pass.vertices[6].position, [110.0, 22.0]);
    assert_eq!(pass.vertices[4].color, [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(
        pass.draw_calls[1].owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert_eq!(
        pass.draw_calls[1].required_package_ids,
        vec!["runtime.base".to_string()]
    );
}

#[test]
fn border_segments_inherit_parent_scissor_opacity_and_package_provenance() {
    let scissor = rect(12, 22, 96, 36);
    let mut panel = quad(
        "ui:panel",
        DrawBatchPipeline::Ui,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 100, 40),
        Vec::new(),
    );
    panel.scissor = Some(scissor);
    panel.opacity = 0.5;
    panel.owner_package_id = Some("runtime.theme".to_string());
    panel.required_package_ids = vec!["runtime.base".to_string(), "runtime.ui".to_string()];
    panel.border = Some(WgpuNativeRenderQuadBorder {
        color: Some(rgba(0xff, 0x00, 0x00, 0xff)),
        literal: Some("#f00".to_string()),
        width: 2.0,
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![panel]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 5);
    for draw_call in pass.draw_calls.iter().skip(1) {
        assert_eq!(draw_call.scissor, Some(scissor));
        assert_eq!(draw_call.opacity, 0.5);
        assert_eq!(draw_call.owner_package_id.as_deref(), Some("runtime.theme"));
        assert_eq!(
            draw_call.required_package_ids,
            vec!["runtime.base".to_string(), "runtime.ui".to_string()]
        );
    }
    assert_eq!(pass.vertices[4].color, [1.0, 0.0, 0.0, 0.5]);
}

#[test]
fn tessellates_rounded_rects_into_triangle_fans() {
    let mut panel = quad(
        "ui:rounded",
        DrawBatchPipeline::Ui,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 100, 40),
        Vec::new(),
    );
    panel.corner_radius = 10.0;

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![panel]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 29);
    assert_eq!(pass.index_count, 84);
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.draw_calls[0].command_id, "ui:rounded");
    assert_eq!(pass.draw_calls[0].vertex_count, 29);
    assert_eq!(pass.draw_calls[0].index_count, 84);
    assert_eq!(pass.vertices[0].position, [60.0, 40.0]);
    assert_eq!(pass.vertices[1].position, [100.0, 20.0]);
    assert_eq!(pass.vertices[1].uv, [0.9, 0.0]);
}

#[test]
fn tessellates_rounded_texture_quads_with_cropped_uvs() {
    let mut image = quad(
        "ui:rounded-image",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPaint::Texture {
            resource_id: Some(ResourceId::from("images/ui/card.png")),
            tint: WgpuNativeRenderColor::WHITE,
        },
        rect(10, 20, 100, 40),
        vec![ResourceId::from("images/ui/card.png")],
    );
    image.corner_radius = 10.0;
    image.scissor = Some(rect(12, 22, 96, 36));
    image.vertices = [
        WgpuNativeRenderVertex {
            position: [10.0, 20.0],
            uv: [0.25, 0.125],
        },
        WgpuNativeRenderVertex {
            position: [110.0, 20.0],
            uv: [0.75, 0.125],
        },
        WgpuNativeRenderVertex {
            position: [110.0, 60.0],
            uv: [0.75, 0.875],
        },
        WgpuNativeRenderVertex {
            position: [10.0, 60.0],
            uv: [0.25, 0.875],
        },
    ];

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![image]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 29);
    assert_eq!(pass.index_count, 84);
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.draw_calls[0].command_id, "ui:rounded-image");
    assert_eq!(pass.draw_calls[0].pipeline, DrawBatchPipeline::Image);
    assert_eq!(pass.draw_calls[0].draw_kind, DrawCommandKind::Image);
    assert_eq!(pass.draw_calls[0].vertex_count, 29);
    assert_eq!(pass.draw_calls[0].index_count, 84);
    assert_eq!(pass.draw_calls[0].scissor, Some(rect(12, 22, 96, 36)));
    assert_eq!(
        pass.draw_calls[0].resource_ids,
        vec![ResourceId::from("images/ui/card.png")]
    );
    assert_uv_close(pass.vertices[0].uv, [0.5, 0.5]);
    assert_uv_close(pass.vertices[1].uv, [0.7, 0.125]);
}

#[test]
fn emits_rounded_border_as_single_ring_draw_call() {
    let mut panel = quad(
        "ui:rounded",
        DrawBatchPipeline::Ui,
        DrawCommandKind::RoundedRect,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 100, 40),
        Vec::new(),
    );
    panel.corner_radius = 10.0;
    panel.border = Some(WgpuNativeRenderQuadBorder {
        color: Some(rgba(0xff, 0x00, 0x00, 0xff)),
        literal: Some("#f00".to_string()),
        width: 2.0,
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![panel]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 85);
    assert_eq!(pass.index_count, 252);
    assert_eq!(pass.draw_call_count, 2);
    assert_eq!(
        pass.draw_calls
            .iter()
            .map(|draw_call| draw_call.command_id.as_str())
            .collect::<Vec<_>>(),
        vec!["ui:rounded", "ui:rounded:border"]
    );
    assert_eq!(pass.draw_calls[1].draw_kind, DrawCommandKind::RoundedRect);
    assert_eq!(pass.draw_calls[1].vertex_count, 56);
    assert_eq!(pass.draw_calls[1].index_count, 168);
    assert_eq!(pass.vertices[29].position, [100.0, 20.0]);
    assert_eq!(pass.vertices[30].position, [100.0, 22.0]);
    assert_eq!(pass.vertices[29].color, [1.0, 0.0, 0.0, 1.0]);
}

fn assert_uv_close(actual: [f32; 2], expected: [f32; 2]) {
    const EPSILON: f32 = 0.000_01;
    assert!(
        (actual[0] - expected[0]).abs() <= EPSILON && (actual[1] - expected[1]).abs() <= EPSILON,
        "expected uv {:?}, got {:?}",
        expected,
        actual
    );
}
