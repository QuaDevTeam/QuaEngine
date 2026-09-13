use super::super::fixtures::text_ui_view;
use super::support::{create_noop_renderer, landscape_layout};
use super::*;
use crate::fonts::{FontBackendAtlasGlyph, FontBackendAtlasLayout};
use crate::projection::common::FontFamilyProjection;
use crate::resources::ResourceId;

#[test]
fn real_noop_runtime_executor_renders_generated_text_placeholder_frame_plan() {
    let mut renderer = create_noop_renderer(1600, 900);

    let result = renderer
        .prepare_and_render(landscape_layout(1600.0, 900.0), &text_ui_view())
        .unwrap();

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected generated runtime plan");
    let runtime_report = renderer
        .backend()
        .last_runtime_report()
        .expect("expected generated runtime report");

    assert_eq!(result.submission.revision, 1);
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::CreatePipeline { key, .. }
            if key.shader == WgpuNativeRenderShader::TextPlaceholder
                && key.bind_group_layout == WgpuNativeRenderBindGroupLayout::TextAtlas
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:caption:label"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::SetBindGroup { command_id, .. }
            if command_id == "ui:caption:label"
    )));
    assert_eq!(runtime_report.draw_indexed_count, 1);
    assert_eq!(runtime_report.bind_group_create_count, 1);
    assert_eq!(runtime_report.resident_bind_group_count, 1);
    assert_eq!(runtime_report.submitted_command_buffer_count, 1);
    assert!(renderer.backend().diagnostics().device_attached);
}

#[test]
fn real_noop_backend_rebuilds_text_atlas_bind_group_after_font_upload() {
    let mut renderer = create_noop_renderer(1600, 900);
    let layout = landscape_layout(1600.0, 900.0);
    let mut view = text_ui_view();
    view.ui.as_mut().unwrap().overlays[0]
        .surface
        .as_mut()
        .unwrap()
        .root
        .as_mut()
        .unwrap()
        .style
        .font_family = Some(FontFamilyProjection::new(["Qua Sans"]));
    renderer
        .backend_mut()
        .register_font_atlas_layout(FontBackendAtlasLayout {
            resource_id: ResourceId::from("fonts:Qua Sans"),
            family: "Qua Sans".to_string(),
            raster_size: 32.0,
            ascent: 24.0,
            descent: -8.0,
            line_height: 36.0,
            is_default: true,
            glyphs: "Native text placeholder"
                .chars()
                .map(|character| {
                    (
                        character,
                        FontBackendAtlasGlyph {
                            uv_top_left: [0.0, 0.0],
                            uv_bottom_right: [1.0, 1.0],
                            advance: 16.0,
                            bearing_x: 0.0,
                            bearing_y: -24.0,
                            width: 16.0,
                            height: 24.0,
                        },
                    )
                })
                .collect(),
            glyphs_by_id: Default::default(),
            shaping_face: None,
        });

    renderer.prepare_and_render(layout, &view).unwrap();
    assert_eq!(
        renderer
            .backend()
            .last_runtime_report()
            .unwrap()
            .texture_sampler_diagnostics
            .decoded_resource_ids_by_bind_group
            .values()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["glyph-atlas:builtin-bitmap-ascii"]
    );

    renderer
        .backend_mut()
        .upload_decoded_texture_rgba8(
            "fonts:Qua Sans",
            RealWgpuDecodedTextureRgba8::new(1, 1, vec![255, 255, 255, 255]),
        )
        .unwrap();
    renderer.prepare_and_render(layout, &view).unwrap();

    let report = renderer.backend().last_runtime_report().unwrap();
    assert_eq!(report.bind_group_create_count, 1);
    assert_eq!(
        report.texture_sampler_diagnostics.decoded_bind_group_count,
        1
    );
    assert_eq!(
        report
            .texture_sampler_diagnostics
            .decoded_resource_ids_by_bind_group
            .values()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["fonts:Qua Sans"]
    );
}
