use super::support::{assert_frame_target_matches_report, create_noop_renderer};
use super::*;

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

const BOX_SHADOW_LAB_FRAME: &str =
    include_str!("../../../../../../../../../test-fixtures/renderer/box-shadow-feather-frame.json");

#[test]
fn real_noop_composites_nested_opacity_and_reuses_bounded_targets() {
    let mut renderer = create_noop_renderer(320, 180);
    let frame = serde_json::json!({ "container": { "width": 320, "height": 180 },
        "view": { "ui": { "visible": true, "overlays": [{ "elementId": "composite", "visible": true,
            "renderMode": "render-only", "interactive": false, "surface": { "key": "test/composite", "root": {
                "id": "parent", "kind": "Box", "visible": true,
                "bounds": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
                "style": { "opacity": 0.5, "backgroundColor": "red" }, "children": [{
                    "id": "child", "kind": "Box", "visible": true,
                    "bounds": { "x": 100, "y": 100, "width": 400, "height": 300 },
                    "style": { "opacity": 0.5, "backgroundColor": "lime" }
                }]
            } }
        }] } } }).to_string();
    renderer.prepare_and_render_json_str(&frame).unwrap();
    let buffers = renderer.backend().last_buffer_plan().unwrap();
    assert!(buffers
        .passes
        .iter()
        .flat_map(|p| &p.vertices)
        .all(|v| v.color[3] == 1.0));
    let snapshot = renderer.backend().runtime_snapshot();
    assert_eq!(
        snapshot.resident_compositor_texture_byte_len,
        2 * 320 * 180 * 4
    );
    assert_eq!(
        renderer
            .backend()
            .last_runtime_plan()
            .unwrap()
            .composite_groups["ui:composite:child"]
            .len(),
        2
    );
    renderer.prepare_and_render_json_str(&frame).unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        snapshot.resident_compositor_texture_byte_len
    );
    assert_eq!(
        renderer
            .backend()
            .last_runtime_plan()
            .unwrap()
            .queue_write_count,
        0
    );
    let mut glass: serde_json::Value = serde_json::from_str(&frame).unwrap();
    glass["view"]["ui"]["overlays"][0]["surface"]["root"]["children"][0]["style"]
        ["backdropFilter"] = serde_json::json!({"blurRadius": 8});
    renderer
        .prepare_and_render_json_str(&glass.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        3 * 320 * 180 * 4
    );
    renderer
        .prepare_and_render_json_str(&glass.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .last_runtime_plan()
            .unwrap()
            .queue_write_count,
        0
    );
    renderer
        .prepare_and_render_json_str(r#"{"container":{"width":320,"height":180},"view":{}}"#)
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        0
    );
}

#[test]
fn real_noop_runtime_executor_renders_shared_compiled_qui_qss_fixture() {
    let mut renderer = create_noop_renderer(3200, 2000);

    let result = renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should execute through real-noop wgpu");

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:menu:background-image"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:poster"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:open-settings"
    )));
    assert_eq!(
        runtime_report.draw_indexed_count,
        runtime_plan.draw_indexed_count
    );
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert_eq!(
        runtime_report
            .texture_sampler_diagnostics
            .placeholder_resource_ids_by_bind_group
            .values()
            .filter(|resource_ids| {
                resource_ids.contains(&"images:ui/panel.png".to_string())
                    || resource_ids.contains(&"images:ui/poster.png".to_string())
            })
            .count(),
        2
    );
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreateBindGroup {
            layout: WgpuNativeRenderBindGroupLayout::TextAtlas,
            ..
        }
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::SetBindGroup { command_id, .. }
            if command_id == "ui:compiled-menu:title"
    )));
    assert_frame_target_matches_report(renderer.backend(), runtime_report, Some((3200, 2000)));
    assert!(renderer.backend().diagnostics().device_attached);
}

#[test]
fn real_noop_box_shadow_lab_keeps_analytic_shadows_on_single_quads() {
    let mut renderer = create_noop_renderer(256, 144);

    renderer
        .prepare_and_render_json_str(BOX_SHADOW_LAB_FRAME)
        .expect("box shadow lab fixture should render through real-noop wgpu");

    let plan = renderer
        .backend()
        .last_buffer_plan()
        .expect("shadow frame should produce a WGPU buffer plan");
    let pass = &plan.passes[0];
    let shadow_draws = pass
        .draw_calls
        .iter()
        .filter(|draw| draw.command_id.ends_with(":box-shadow"))
        .collect::<Vec<_>>();
    assert_eq!(shadow_draws.len(), 3);
    assert!(shadow_draws
        .iter()
        .all(|draw| draw.vertex_count == 4 && draw.index_count == 6));

    let hard = shadow_draws
        .iter()
        .find(|draw| draw.command_id == "ui:box-shadow-lab:hard-control:box-shadow")
        .expect("hard control shadow should remain in the buffer plan");
    let soft = shadow_draws
        .iter()
        .find(|draw| draw.command_id == "ui:box-shadow-lab:soft-outer:box-shadow")
        .expect("soft outer shadow should remain in the buffer plan");
    let inset = shadow_draws
        .iter()
        .find(|draw| draw.command_id == "ui:box-shadow-lab:soft-inset:box-shadow")
        .expect("soft inset shadow should remain in the buffer plan");

    let hard_vertex = &pass.vertices[hard.first_vertex as usize];
    let soft_vertex = &pass.vertices[soft.first_vertex as usize];
    let inset_vertex = &pass.vertices[inset.first_vertex as usize];
    assert_eq!(hard_vertex.effect0[0], 1.0);
    assert_eq!(hard_vertex.effect0[1], 0.0);
    assert!(hard_vertex.effect0[3] > 0.0);
    assert_eq!(soft_vertex.effect0[0], 1.0);
    assert!(soft_vertex.effect0[1] > 0.0);
    assert_eq!(soft_vertex.effect0[3], 0.0);
    assert_eq!(inset_vertex.effect0[0], 2.0);
    assert!(inset_vertex.effect0[1] > 0.0);
    assert!(shadow_draws.iter().all(|draw| {
        pass.vertices[draw.first_vertex as usize].effect1[2] > 1.0
            && pass.vertices[draw.first_vertex as usize].effect1[3] < -1.0
    }));

    let vertices = &pass.vertices
        [soft.first_vertex as usize..(soft.first_vertex + soft.vertex_count) as usize];
    let min_uv = vertices.iter().fold([f32::INFINITY; 2], |mut min, vertex| {
        min[0] = min[0].min(vertex.uv[0]);
        min[1] = min[1].min(vertex.uv[1]);
        min
    });
    let max_uv = vertices
        .iter()
        .fold([f32::NEG_INFINITY; 2], |mut max, vertex| {
            max[0] = max[0].max(vertex.uv[0]);
            max[1] = max[1].max(vertex.uv[1]);
            max
        });

    assert!(
        min_uv[0] < 0.0 && min_uv[1] < 0.0 && max_uv[0] > 1.0 && max_uv[1] > 1.0,
        "analytic shadow quad must cover the expanded source-relative UV range, got min={min_uv:?} max={max_uv:?}"
    );
    assert!(vertices.iter().all(
        |vertex| vertex.effect0 == soft_vertex.effect0 && vertex.effect1 == soft_vertex.effect1
    ));
}

#[test]
fn real_noop_background_blends_share_scratch_and_release_it_with_the_frame() {
    let mut renderer = create_noop_renderer(320, 180);
    let mut frame = serde_json::json!({"layout":{"preset":"landscape"},
    "container":{"width":320,"height":180}, "view":{"background":{
        "mode":"layered", "opacity":0.5, "layers":[
            {"id":"back", "assetName":"back.png", "opacity":0.4},
            {"id":"front", "assetName":"front.png", "opacity":0.6,
             "composition":{"blendMode":"multiply", "filter":{"blur":8,"contrast":1.2}}}
        ]}}});
    for mode in [
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
    ] {
        frame["view"]["background"]["layers"][1]["composition"]["blendMode"] = mode.into();
        renderer
            .prepare_and_render_json_str(&frame.to_string())
            .unwrap();
        let plan = renderer.backend().last_runtime_plan().unwrap();
        let groups = &plan.composite_groups["background:layer:front"];
        assert_eq!(groups.len(), 2);
        assert_eq!(
            groups[1].blend_mode,
            crate::render_graph::CompositeBlendMode::from_css(mode)
        );
        assert!((groups[1].blur_radius - 8.0 / 6.0).abs() < 1e-9);
        assert_eq!(
            renderer
                .backend()
                .runtime_snapshot()
                .resident_compositor_texture_byte_len,
            3 * 320 * 180 * 4
        );
    }
    frame["view"]["background"]["layers"][1]["composition"]["blendMode"] = "normal".into();
    renderer
        .prepare_and_render_json_str(&frame.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        2 * 320 * 180 * 4
    );
    frame["view"] = serde_json::json!({});
    renderer
        .prepare_and_render_json_str(&frame.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        0
    );
}

#[test]
fn real_noop_drop_shadow_scratch_is_bounded_reused_and_released() {
    let mut renderer = create_noop_renderer(320, 180);
    let frame_bytes = 320 * 180 * 4;
    let mut frame = serde_json::json!({"layout":{"preset":"landscape"},
    "container":{"width":320,"height":180}, "view":{"background":{
        "mode":"image", "layers":[], "opacity":1.0, "assetName":"silhouette.png",
        "composition":{"isolation":true, "filter":{"dropShadow":"12px 18px 72px red"}}
    }}});
    // Exercise both directions of pyramid resizing, not just repeated startup.
    for blur in [72, 288, 72, 0] {
        frame["view"]["background"]["composition"]["filter"]["dropShadow"] =
            format!("12px 18px {blur}px red").into();
        renderer
            .prepare_and_render_json_str(&frame.to_string())
            .unwrap();
        let bytes = renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len;
        if blur == 0 {
            assert_eq!(bytes, frame_bytes);
        } else {
            assert!(bytes > frame_bytes && bytes <= 3 * frame_bytes);
        }
        renderer
            .prepare_and_render_json_str(&frame.to_string())
            .unwrap();
        assert_eq!(
            renderer
                .backend()
                .runtime_snapshot()
                .resident_compositor_texture_byte_len,
            bytes
        );
    }
    frame["view"]["background"]["composition"]["filter"]["dropShadow"] =
        "12px 18px 72px red".into();
    renderer
        .prepare_and_render_json_str(&frame.to_string())
        .unwrap();
    for (width, height) in [(640, 360), (320, 180)] {
        renderer
            .backend_mut()
            .resize_target(
                wgpu::TextureFormat::Rgba8UnormSrgb,
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            )
            .unwrap();
        frame["container"] = serde_json::json!({"width":width,"height":height});
        renderer
            .prepare_and_render_json_str(&frame.to_string())
            .unwrap();
        let bytes = renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len;
        let resized_frame_bytes = width as usize * height as usize * 4;
        assert!(bytes > resized_frame_bytes && bytes <= 3 * resized_frame_bytes);
    }
    frame["view"]["background"]["composition"]["filter"] = serde_json::json!({});
    renderer
        .prepare_and_render_json_str(&frame.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        frame_bytes,
        "isolation keeps its target; shadow scratch is released"
    );
    frame["view"] = serde_json::json!({});
    renderer
        .prepare_and_render_json_str(&frame.to_string())
        .unwrap();
    assert_eq!(
        renderer
            .backend()
            .runtime_snapshot()
            .resident_compositor_texture_byte_len,
        0
    );
}
