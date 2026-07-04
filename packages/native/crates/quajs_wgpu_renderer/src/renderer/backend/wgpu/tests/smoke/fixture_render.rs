use super::super::super::*;
use crate::renderer::{NativeRenderBackendResourcePolicy, NativeRenderer};
use crate::resources::ResourceId;

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");

#[test]
fn renders_shared_compiled_qui_qss_fixture_through_wgpu_backend_plans() {
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::new(
        WgpuNativeRenderBackendConfig {
            adapter_name: Some("test-adapter".to_string()),
            surface_format: Some("Bgra8UnormSrgb".to_string()),
            present_mode: WgpuPresentMode::Fifo,
            resource_policy: NativeRenderBackendResourcePolicy::AllowMissingResources,
        },
    ));

    let result = renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should render through WGPU backend");

    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);

    let primitive_plan = renderer
        .backend()
        .last_primitive_plan()
        .expect("expected primitive plan");
    let primitive_ids = primitive_plan
        .passes
        .iter()
        .flat_map(|pass| pass.primitives.iter())
        .map(|primitive| primitive.command_id.as_str())
        .collect::<Vec<_>>();
    assert!(primitive_ids.contains(&"ui:compiled-menu:menu:background-image"));
    assert!(primitive_ids.contains(&"ui:compiled-menu:title"));
    assert!(primitive_ids.contains(&"ui:compiled-menu:poster"));
    assert!(primitive_ids.contains(&"ui:compiled-menu:open-settings"));

    let mesh_plan = renderer
        .backend()
        .last_mesh_plan()
        .expect("expected mesh plan");
    let panel_background = mesh_plan
        .passes
        .iter()
        .flat_map(|pass| pass.quads.iter())
        .find(|quad| quad.command_id == "ui:compiled-menu:menu:background-image")
        .expect("expected panel background image quad");
    assert_eq!(
        panel_background.paint,
        WgpuNativeRenderPaint::Texture {
            resource_id: Some(ResourceId::from("images:ui/panel.png")),
            tint: WgpuNativeRenderColor::WHITE,
        }
    );

    let title = mesh_plan
        .passes
        .iter()
        .flat_map(|pass| pass.quads.iter())
        .find(|quad| quad.command_id == "ui:compiled-menu:title")
        .expect("expected title text quad");
    assert!(matches!(
        &title.paint,
        WgpuNativeRenderPaint::TextPlaceholder { text, .. } if text == "Compiled Menu"
    ));

    let settings = mesh_plan
        .passes
        .iter()
        .flat_map(|pass| pass.quads.iter())
        .find(|quad| quad.command_id == "ui:compiled-menu:open-settings")
        .expect("expected settings button quad");
    assert!(matches!(
        &settings.text_overlay,
        Some(WgpuNativeRenderTextOverlay { text, .. }) if text == "Settings"
    ));

    let runtime_plan = renderer
        .backend()
        .last_runtime_plan()
        .expect("expected runtime plan");
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:menu:background-image"
    )));
    assert!(runtime_plan.operations.iter().any(|operation| matches!(
        operation,
        WgpuNativeRenderRuntimeOperation::DrawIndexed { command_id, .. }
            if command_id == "ui:compiled-menu:open-settings"
    )));
}
