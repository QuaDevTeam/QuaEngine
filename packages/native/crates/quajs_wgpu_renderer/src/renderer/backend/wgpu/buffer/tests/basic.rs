use super::*;

#[test]
fn packs_visible_quads_into_contiguous_vertex_and_index_buffers() {
    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![
        quad(
            "ui:panel",
            DrawBatchPipeline::Ui,
            DrawCommandKind::RoundedRect,
            WgpuNativeRenderPaint::Solid {
                color: rgba(0x33, 0x66, 0x99, 0xff),
                literal: "#336699".to_string(),
            },
            rect(10, 20, 120, 40),
            Vec::new(),
        ),
        quad(
            "background:main",
            DrawBatchPipeline::Image,
            DrawCommandKind::Image,
            WgpuNativeRenderPaint::Texture {
                resource_id: Some(ResourceId::from("images:bg/school.png")),
                tint: WgpuNativeRenderColor::WHITE,
            },
            rect(0, 0, 1280, 720),
            vec![ResourceId::from("images:bg/school.png")],
        ),
    ]));

    assert_eq!(plan.revision, 31);
    assert_eq!(plan.vertex_count, 8);
    assert_eq!(plan.index_count, 12);
    assert_eq!(plan.draw_call_count, 2);
    assert_eq!(plan.skipped_quad_count, 0);
    assert_eq!(plan.invalid_paint_count, 0);

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 8);
    assert_eq!(pass.index_count, 12);
    assert_eq!(pass.draw_call_count, 2);
    assert_eq!(pass.indices, vec![0, 1, 2, 0, 2, 3, 0, 1, 2, 0, 2, 3]);
    assert_eq!(
        pass.vertices[0],
        WgpuNativeRenderBufferVertex {
            position: [10.0, 20.0],
            uv: [0.0, 0.0],
            color: [0.033_104_762, 0.132_868_33, 0.318_546_83, 1.0],
        }
    );
    assert_eq!(
        pass.vertices[7],
        WgpuNativeRenderBufferVertex {
            position: [0.0, 720.0],
            uv: [0.0, 1.0],
            color: [1.0, 1.0, 1.0, 1.0],
        }
    );

    assert_eq!(pass.draw_calls[0].command_id, "ui:panel");
    assert_eq!(pass.draw_calls[0].first_vertex, 0);
    assert_eq!(pass.draw_calls[0].first_index, 0);
    assert_eq!(pass.draw_calls[0].vertex_count, 4);
    assert_eq!(pass.draw_calls[0].index_count, 6);
    assert_eq!(
        pass.draw_calls[0].owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert_eq!(
        pass.draw_calls[0].required_package_ids,
        vec!["runtime.base".to_string()]
    );
    assert_eq!(pass.draw_calls[1].command_id, "background:main");
    assert_eq!(pass.draw_calls[1].first_vertex, 4);
    assert_eq!(pass.draw_calls[1].first_index, 6);
    assert_eq!(&pass.indices[6..12], &[0, 1, 2, 0, 2, 3]);
    assert_eq!(
        pass.draw_calls[1].resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
}

#[test]
fn preserves_texture_uv_scissor_and_provenance_in_buffer_plan() {
    let mut portrait = quad(
        "ui:portrait",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPaint::Texture {
            resource_id: Some(ResourceId::from("images/portraits/hero.png")),
            tint: WgpuNativeRenderColor::WHITE,
        },
        rect(100, 120, 320, 180),
        vec![ResourceId::from("images/portraits/hero.png")],
    );
    portrait.scissor = Some(rect(120, 140, 280, 140));
    portrait.owner_package_id = Some("runtime.characters".to_string());
    portrait.required_package_ids =
        vec!["runtime.base".to_string(), "runtime.characters".to_string()];
    portrait.vertices = [
        WgpuNativeRenderVertex {
            position: [100.0, 120.0],
            uv: [0.25, 0.125],
        },
        WgpuNativeRenderVertex {
            position: [420.0, 120.0],
            uv: [0.75, 0.125],
        },
        WgpuNativeRenderVertex {
            position: [420.0, 300.0],
            uv: [0.75, 0.875],
        },
        WgpuNativeRenderVertex {
            position: [100.0, 300.0],
            uv: [0.25, 0.875],
        },
    ];

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![portrait]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 4);
    assert_eq!(pass.index_count, 6);
    assert_eq!(pass.draw_call_count, 1);
    assert_eq!(pass.vertices[0].uv, [0.25, 0.125]);
    assert_eq!(pass.vertices[2].uv, [0.75, 0.875]);

    let draw_call = &pass.draw_calls[0];
    assert_eq!(draw_call.command_id, "ui:portrait");
    assert_eq!(draw_call.pipeline, DrawBatchPipeline::Image);
    assert_eq!(draw_call.draw_kind, DrawCommandKind::Image);
    assert_eq!(draw_call.physical_bounds, rect(100, 120, 320, 180));
    assert_eq!(draw_call.scissor, Some(rect(120, 140, 280, 140)));
    assert_eq!(
        draw_call.resource_ids,
        vec![ResourceId::from("images/portraits/hero.png")]
    );
    assert_eq!(
        draw_call.owner_package_id.as_deref(),
        Some("runtime.characters")
    );
    assert_eq!(
        draw_call.required_package_ids,
        vec!["runtime.base".to_string(), "runtime.characters".to_string()]
    );
}
