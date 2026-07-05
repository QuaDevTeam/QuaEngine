use super::*;
use crate::renderer::backend::wgpu::{
    WgpuNativeRenderBufferPlan, WgpuNativeRenderSkippedQuadReason,
};

#[test]
fn uses_normalized_image_source_rect_for_texture_uvs() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "ui:crop",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "atlas/menu.png".to_string(),
            fit: MediaFit::Fill,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.25,
                y: 0.125,
                width: 0.5,
                height: 0.25,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(10, 20, 200, 100),
        vec![ResourceId::from("images:atlas/menu.png")],
    )]));

    let vertices = plan.passes[0].quads[0].vertices;

    assert_eq!(vertices[0].uv, [0.25, 0.125]);
    assert_eq!(vertices[1].uv, [0.75, 0.125]);
    assert_eq!(vertices[2].uv, [0.75, 0.375]);
    assert_eq!(vertices[3].uv, [0.25, 0.375]);
}

#[test]
fn keeps_full_texture_uvs_for_logical_image_source_rects() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "ui:logical-source",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "card.png".to_string(),
            fit: MediaFit::Fill,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 20.0,
                y: 30.0,
                width: 200.0,
                height: 100.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(20, 30, 200, 100),
        vec![ResourceId::from("images:card.png")],
    )]));

    assert_eq!(
        plan.passes[0].quads[0].vertices,
        quad_vertices(20.0, 30.0, 200.0, 100.0)
    );
}

#[test]
fn rotates_image_quad_vertices_around_the_physical_center() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "background:rotated",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "rotated.png".to_string(),
            fit: MediaFit::Fill,
            origin: MediaOrigin::default(),
            source: LogicalRect::default(),
            rotation_degrees: 90.0,
        },
        physical_rect(10, 20, 100, 50),
        vec![ResourceId::from("images:rotated.png")],
    )]));

    let vertices = plan.passes[0].quads[0].vertices;

    assert_position_close(vertices[0].position, [85.0, -5.0]);
    assert_position_close(vertices[1].position, [85.0, 95.0]);
    assert_position_close(vertices[2].position, [35.0, 95.0]);
    assert_position_close(vertices[3].position, [35.0, -5.0]);
    assert_eq!(vertices[0].uv, [0.0, 0.0]);
    assert_eq!(vertices[2].uv, [1.0, 1.0]);
}

#[test]
fn applies_contain_media_fit_with_resolved_origin_to_image_vertices() {
    let mut image = primitive(
        "ui:contain",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "portrait.png".to_string(),
            fit: MediaFit::Contain,
            origin: MediaOrigin { x: 1.0, y: 0.0 },
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 100.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:portrait.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));

    assert_eq!(
        plan.passes[0].quads[0].vertices,
        quad_vertices(150.0, 0.0, 50.0, 100.0)
    );
}

#[test]
fn applies_none_media_fit_without_scaling_source_rect() {
    let mut image = primitive(
        "ui:none-fit",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "badge.png".to_string(),
            fit: MediaFit::None,
            origin: MediaOrigin { x: 0.25, y: 0.75 },
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 60.0,
                height: 40.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:badge.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_eq!(quad.vertices, quad_vertices(35.0, 45.0, 60.0, 40.0));
    assert_eq!(quad.scissor, None);
}

#[test]
fn clips_none_media_fit_when_unscaled_source_overflows() {
    let mut image = primitive(
        "ui:none-overflow",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "wide.png".to_string(),
            fit: MediaFit::None,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 300.0,
                height: 80.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:wide.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_eq!(quad.vertices, quad_vertices(-50.0, 10.0, 300.0, 80.0));
    assert_eq!(quad.scissor, Some(physical_rect(0, 0, 200, 100)));
}

#[test]
fn keeps_scale_down_media_fit_at_intrinsic_size_when_source_is_smaller() {
    let mut image = primitive(
        "ui:scale-down-small",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "thumbnail.png".to_string(),
            fit: MediaFit::ScaleDown,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 50.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:thumbnail.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_eq!(quad.vertices, quad_vertices(75.0, 25.0, 50.0, 50.0));
    assert_eq!(quad.scissor, None);
}

#[test]
fn downscales_scale_down_media_fit_to_contain_when_source_is_larger() {
    let mut image = primitive(
        "ui:scale-down-large",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "poster.png".to_string(),
            fit: MediaFit::ScaleDown,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 400.0,
                height: 400.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:poster.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_eq!(quad.vertices, quad_vertices(50.0, 0.0, 100.0, 100.0));
    assert_eq!(quad.scissor, None);
}

#[test]
fn clips_cover_media_fit_to_the_command_bounds_when_it_overflows() {
    let mut image = primitive(
        "ui:cover",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "portrait.png".to_string(),
            fit: MediaFit::Cover,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 100.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:portrait.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_position_close(quad.vertices[0].position, [0.0, -150.0]);
    assert_position_close(quad.vertices[2].position, [200.0, 250.0]);
    assert_eq!(quad.scissor, Some(physical_rect(0, 0, 200, 100)));
}

#[test]
fn intersects_existing_scissor_when_cover_media_fit_overflows() {
    let mut image = primitive(
        "ui:cover-clipped",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "portrait.png".to_string(),
            fit: MediaFit::Cover,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 100.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:portrait.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    image.scissor = Some(physical_rect(40, 10, 220, 80));
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &plan.passes[0].quads[0];

    assert_position_close(quad.vertices[0].position, [0.0, -150.0]);
    assert_position_close(quad.vertices[2].position, [200.0, 250.0]);
    assert_eq!(quad.scissor, Some(physical_rect(40, 10, 160, 80)));
}

#[test]
fn skips_media_quad_when_existing_scissor_is_disjoint_after_overflow_clip() {
    let mut image = primitive(
        "ui:cover-disjoint-clip",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            asset_type: "images".to_string(),
            asset_name: "portrait.png".to_string(),
            fit: MediaFit::Cover,
            origin: MediaOrigin::default(),
            source: LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 100.0,
            },
            rotation_degrees: 0.0,
        },
        physical_rect(0, 0, 200, 100),
        vec![ResourceId::from("images:portrait.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 100.0,
    };
    image.scissor = Some(physical_rect(300, 0, 40, 40));
    let mesh_plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![image]));
    let quad = &mesh_plan.passes[0].quads[0];

    assert_eq!(quad.scissor, Some(physical_rect(300, 0, 0, 40)));
    assert!(!quad.is_visible());

    let buffer_plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan);
    assert_eq!(buffer_plan.vertex_count, 0);
    assert_eq!(buffer_plan.draw_call_count, 0);
    assert_eq!(buffer_plan.skipped_quad_count, 1);
    assert_eq!(
        buffer_plan.passes[0].skipped_quads[0].reason,
        WgpuNativeRenderSkippedQuadReason::EmptyBounds
    );
}

#[test]
fn prefers_video_poster_texture_when_available() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![primitive(
        "background:video",
        DrawBatchPipeline::Video,
        DrawCommandKind::VideoFrame,
        WgpuNativeRenderPrimitiveKind::VideoFallback {
            asset_type: "videos".to_string(),
            asset_name: "opening.mp4".to_string(),
            poster_asset_name: Some("opening-poster.png".to_string()),
            looped: Some(true),
            muted: Some(true),
            volume: Some(0.8),
            playback_rate: Some(1.0),
            fit: MediaFit::Fill,
            origin: MediaOrigin::default(),
            source: LogicalRect::default(),
            fallback_reason: Some("decode-unavailable".to_string()),
        },
        physical_rect(0, 0, 1280, 720),
        vec![
            ResourceId::from("videos:opening.mp4"),
            ResourceId::from("images:opening-poster.png"),
        ],
    )]));

    assert_eq!(
        plan.passes[0].quads[0].paint,
        WgpuNativeRenderPaint::Texture {
            resource_id: Some(ResourceId::from("images:opening-poster.png")),
            tint: WgpuNativeRenderColor::WHITE,
        }
    );
}
