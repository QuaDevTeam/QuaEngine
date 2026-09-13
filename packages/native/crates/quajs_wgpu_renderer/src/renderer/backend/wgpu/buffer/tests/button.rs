use super::*;

#[test]
fn emits_button_text_overlay_as_bitmap_text_draw_call() {
    let mut button = quad(
        "ui:button",
        DrawBatchPipeline::Ui,
        DrawCommandKind::UiSurface,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 160, 48),
        Vec::new(),
    );
    button.text_overlay = Some(WgpuNativeRenderTextOverlay {
        text: "Stärt".to_string(),
        color: rgba(0xff, 0xff, 0xff, 0xff),
        literal: "#fff".to_string(),
        style: text_style(24.0, TextAlign::Center, EdgeInsetsDrawParam::default()),
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![button]));

    let pass = &plan.passes[0];
    assert_eq!(pass.vertex_count, 24);
    assert_eq!(pass.index_count, 36);
    assert_eq!(pass.draw_call_count, 2);
    assert_eq!(
        pass.draw_calls
            .iter()
            .map(|draw_call| draw_call.command_id.as_str())
            .collect::<Vec<_>>(),
        vec!["ui:button", "ui:button:label"]
    );
    let label = &pass.draw_calls[1];
    assert_eq!(label.pipeline, DrawBatchPipeline::Text);
    assert_eq!(label.draw_kind, DrawCommandKind::Text);
    assert!(label.physical_bounds.width < 160);
    assert!(label.physical_bounds.height < 48);
    assert!(matches!(
        &label.paint,
        WgpuNativeRenderPaint::TextPlaceholder { text, style, .. }
            if text == "Stärt" && style.font_size == 24.0
    ));
    assert_eq!(pass.vertices[4].color, [1.0, 1.0, 1.0, 1.0]);
}

#[test]
fn emits_button_text_overlay_with_parent_scissor() {
    let scissor = rect(12, 22, 148, 40);
    let mut button = quad(
        "ui:button",
        DrawBatchPipeline::Ui,
        DrawCommandKind::UiSurface,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 160, 48),
        Vec::new(),
    );
    button.scissor = Some(scissor);
    button.text_overlay = Some(WgpuNativeRenderTextOverlay {
        text: "Settings".to_string(),
        color: rgba(0xff, 0xff, 0xff, 0xff),
        literal: "#fff".to_string(),
        style: text_style(20.0, TextAlign::Center, EdgeInsetsDrawParam::default()),
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![button]));

    let pass = &plan.passes[0];
    assert_eq!(
        pass.draw_calls
            .iter()
            .map(|draw_call| draw_call.command_id.as_str())
            .collect::<Vec<_>>(),
        vec!["ui:button", "ui:button:label"]
    );
    assert_eq!(pass.draw_calls[0].scissor, Some(scissor));
    assert_eq!(pass.draw_calls[1].scissor, Some(scissor));
    assert!(matches!(
        &pass.draw_calls[1].paint,
        WgpuNativeRenderPaint::TextPlaceholder { text, .. } if text == "Settings"
    ));
}

#[test]
fn button_text_overlay_inherits_parent_opacity_and_package_provenance() {
    let mut button = quad(
        "ui:button",
        DrawBatchPipeline::Ui,
        DrawCommandKind::UiSurface,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x10, 0x20, 0x30, 0xff),
            literal: "#102030".to_string(),
        },
        rect(10, 20, 160, 48),
        Vec::new(),
    );
    button.opacity = 0.4;
    button.owner_package_id = Some("runtime.menu".to_string());
    button.required_package_ids = vec!["runtime.base".to_string(), "runtime.theme".to_string()];
    button.text_overlay = Some(WgpuNativeRenderTextOverlay {
        text: "Continue".to_string(),
        color: rgba(0xff, 0xff, 0xff, 0xff),
        literal: "#fff".to_string(),
        style: text_style(20.0, TextAlign::Center, EdgeInsetsDrawParam::default()),
    });

    let plan = WgpuNativeRenderBufferPlan::from_mesh_plan(&mesh_plan(vec![button]));

    let pass = &plan.passes[0];
    assert_eq!(pass.draw_call_count, 2);
    let label = &pass.draw_calls[1];
    assert_eq!(label.command_id, "ui:button:label");
    assert_eq!(label.opacity, 0.4);
    assert_eq!(label.owner_package_id.as_deref(), Some("runtime.menu"));
    assert_eq!(
        label.required_package_ids,
        vec!["runtime.base".to_string(), "runtime.theme".to_string()]
    );
    assert_eq!(pass.vertices[4].color, [1.0, 1.0, 1.0, 0.4]);
}
