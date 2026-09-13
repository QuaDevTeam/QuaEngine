use super::*;

#[test]
fn dims_disabled_button_quads_without_dropping_label_overlay() {
    let mut button = primitive(
        "ui:disabled-button",
        DrawBatchPipeline::Ui,
        DrawCommandKind::UiSurface,
        WgpuNativeRenderPrimitiveKind::UiButton {
            label: "Locked".to_string(),
            enabled: false,
            background_color: "#202020".to_string(),
            text_color: "#ffffff".to_string(),
            text_style: text_style(20.0, TextAlign::Center, EdgeInsetsDrawParam::default()),
            corner_radius: 4.0,
            border: WgpuNativeRenderPrimitiveBorder::default(),
        },
        physical_rect(20, 70, 160, 48),
        Vec::new(),
    );
    button.opacity = 0.8;

    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![button]));
    let button = &plan.passes[0].quads[0];

    assert!((button.opacity - 0.44).abs() <= 0.0001);
    assert!(button.is_visible());
    assert!(matches!(
        &button.text_overlay,
        Some(WgpuNativeRenderTextOverlay { text, .. }) if text == "Locked"
    ));
}
