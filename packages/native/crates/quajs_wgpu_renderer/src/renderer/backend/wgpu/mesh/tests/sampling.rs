use super::*;
use crate::render_graph::{ImageSampling, NineSliceDrawParams};

fn image(sampling: ImageSampling) -> WgpuNativeRenderPrimitive {
    let mut image = primitive(
        "sample",
        DrawBatchPipeline::Image,
        DrawCommandKind::Image,
        WgpuNativeRenderPrimitiveKind::Image {
            sampling,
            asset_type: "images".into(),
            asset_name: "atlas.png".into(),
            fit: MediaFit::Fill,
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
        },
        physical_rect(20, 40, 400, 200),
        vec![ResourceId::from("images:atlas.png")],
    );
    image.logical_bounds = LogicalRect {
        x: 10.0,
        y: 20.0,
        width: 200.0,
        height: 100.0,
    };
    image
}

fn mesh(sampling: ImageSampling, size: Option<(u32, u32)>) -> WgpuNativeRenderMeshPlan {
    WgpuNativeRenderMeshPlan::from_primitive_plan_with_texture_dimensions(
        &primitive_plan(vec![image(sampling)]),
        &size
            .map(|s| [("images:atlas.png".into(), s)].into())
            .unwrap_or_default(),
    )
}

#[test]
fn atlas_uses_decoded_texels_and_flips_within_the_frame() {
    let frame = LogicalRect {
        x: 32.0,
        y: 16.0,
        width: 16.0,
        height: 32.0,
    };
    let plan = mesh(
        ImageSampling {
            frame: Some(frame),
            flip_horizontal: true,
            ..Default::default()
        },
        Some((64, 64)),
    );
    let quad = &plan.passes[0].quads[0];
    assert!(quad.is_visible());
    assert_eq!(quad.vertices[0].uv, [0.75, 0.25]);
    assert_eq!(quad.vertices[2].uv, [0.5, 0.75]);
    assert_eq!(quad.vertices[0].position, [20.0, 40.0]);
    assert_eq!(quad.vertices[2].position, [420.0, 240.0]);
    assert_eq!(
        quad.effect2,
        [32.5 / 64.0, 16.5 / 64.0, 47.5 / 64.0, 47.5 / 64.0]
    );
}

#[test]
fn invalid_or_unresolved_atlas_frames_never_show_the_whole_texture() {
    for (frame, size) in [
        (
            LogicalRect {
                x: 60.0,
                y: 0.0,
                width: 8.0,
                height: 8.0,
            },
            Some((64, 64)),
        ),
        (
            LogicalRect {
                x: -1.0,
                y: 0.0,
                width: 8.0,
                height: 8.0,
            },
            Some((64, 64)),
        ),
        (
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 8.0,
            },
            Some((64, 64)),
        ),
        (
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 8.0,
                height: 8.0,
            },
            None,
        ),
    ] {
        let plan = mesh(
            ImageSampling {
                frame: Some(frame),
                ..Default::default()
            },
            size,
        );
        assert_eq!(plan.visible_quad_count, 0);
        assert!(!plan.passes[0].quads[0].is_visible());
    }
}

#[test]
fn nine_slice_keeps_source_texels_and_scales_destination_edges_with_dpr() {
    let slice = NineSliceDrawParams {
        slice: [8.0, 16.0, 8.0, 16.0],
        width: [10.0, 20.0, 10.0, 20.0],
        repeat: false,
        fill: false,
    };
    let plan = mesh(
        ImageSampling {
            nine_slice: Some(slice),
            ..Default::default()
        },
        Some((64, 32)),
    );
    let quads = &plan.passes[0].quads;
    assert_eq!(quads.len(), 8);
    assert_eq!(quads[0].vertices[0].position, [20.0, 40.0]);
    assert_eq!(quads[0].vertices[2].position, [60.0, 60.0]);
    assert_eq!(quads[0].vertices[2].uv, [0.25, 0.25]);
    assert_eq!(quads[7].vertices[0].position, [380.0, 220.0]);
    assert_eq!(quads[7].vertices[2].position, [420.0, 240.0]);
    assert_eq!(quads[7].vertices[0].uv, [0.75, 0.75]);
    assert!(quads
        .iter()
        .all(|q| q.resource_ids == [ResourceId::from("images:atlas.png")]));
    let filled = mesh(
        ImageSampling {
            nine_slice: Some(NineSliceDrawParams {
                fill: true,
                ..slice
            }),
            ..Default::default()
        },
        Some((64, 32)),
    );
    assert_eq!(filled.quad_count, 9);
    assert_eq!(filled.passes[0].quads[4].vertices[0].position, [60.0, 60.0]);
    assert_eq!(
        filled.passes[0].quads[4].vertices[2].position,
        [380.0, 220.0]
    );
}

#[test]
fn repeated_nine_slice_tiles_keep_geometry_and_mesh_growth_bounded() {
    let plan = mesh(
        ImageSampling {
            nine_slice: Some(NineSliceDrawParams {
                slice: [1.0; 4],
                width: [0.0001; 4],
                repeat: true,
                fill: true,
            }),
            ..Default::default()
        },
        Some((3, 3)),
    );
    assert!(plan.quad_count <= 4096);
    assert!(plan.passes[0]
        .quads
        .iter()
        .all(|q| q.vertices.iter().all(|v| v.position[0] >= 20.0
            && v.position[0] <= 420.0
            && v.position[1] >= 40.0
            && v.position[1] <= 240.0)));
}
