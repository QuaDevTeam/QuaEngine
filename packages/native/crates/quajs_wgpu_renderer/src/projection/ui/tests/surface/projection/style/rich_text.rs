use super::*;

#[test]
fn projects_rich_text_surface_nodes_as_text_pipeline_commands() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/dialog.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "root",
                    UiSurfaceNodeKind::Box,
                    rect(0.0, 0.0, 640.0, 240.0),
                )
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "body",
                    UiSurfaceNodeKind::RichText,
                    rect(32.0, 40.0, 560.0, 120.0),
                )
                .with_text("Native rich text")
                .with_style(UiSurfaceResolvedStyle {
                    color: Some("#fff4d6".to_string()),
                    font_family: Some(FontFamilyProjection::new(["Qua Serif", "Fallback Serif"])),
                    font_size: Some(30.0),
                    font_weight: Some(FontWeightProjection::keyword("semibold")),
                    line_height: Some(42.0),
                    text_align: Some(UiSurfaceTextAlignProjection::Left),
                    ..Default::default()
                })]),
            ),
        ),
        ..UiOverlayProjection::new("dialog")
    }]);

    let commands = build_ui_commands(&layout, &ui);

    assert_eq!(commands[2].kind, DrawCommandKind::RichText);
    assert_eq!(
        commands[2].resource_ids,
        vec![
            ResourceId::from("fonts:Qua Serif"),
            ResourceId::from("fonts:Fallback Serif")
        ]
    );

    match &commands[2].params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Native rich text");
            assert_eq!(params.role, "ui-rich-text");
            assert_eq!(params.color, "#fff4d6");
            assert_eq!(params.font_family, vec!["Qua Serif", "Fallback Serif"]);
            assert_eq!(params.font_size, 30.0);
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("semibold".to_string()))
            );
            assert_eq!(params.line_height, 42.0);
            assert_eq!(params.align, TextAlign::Left);
        }
        _ => panic!("expected text params for rich text command"),
    }
}
