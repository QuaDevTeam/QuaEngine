use super::*;

#[test]
fn composites_surface_group_opacity_without_changing_child_alpha() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection {
                    opacity: 0.5,
                    ..UiSurfaceNodeProjection::new(
                        "group",
                        UiSurfaceNodeKind::Fragment,
                        rect(0.0, 0.0, 0.0, 0.0),
                    )
                }
                .with_children(vec![UiSurfaceNodeProjection {
                    opacity: 0.5,
                    ..UiSurfaceNodeProjection::new(
                        "foreground",
                        UiSurfaceNodeKind::Layer,
                        rect(0.0, 0.0, 0.0, 0.0),
                    )
                }
                .with_children(vec![UiSurfaceNodeProjection {
                    opacity: 0.8,
                    ..UiSurfaceNodeProjection::new(
                        "title",
                        UiSurfaceNodeKind::Text,
                        rect(40.0, 48.0, 240.0, 44.0),
                    )
                }
                .with_text("Faded")])]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let title = commands
        .iter()
        .find(|command| command.id == "ui:menu:title")
        .unwrap();

    assert_eq!(title.kind, DrawCommandKind::Text);
    assert_eq!(title.opacity, 1.0);
    assert_eq!(
        title
            .composite_groups
            .iter()
            .map(|g| (g.id.as_str(), g.opacity))
            .collect::<Vec<_>>(),
        vec![
            ("ui:menu:group", 0.5),
            ("ui:menu:foreground", 0.5),
            ("ui:menu:title", 0.8)
        ]
    );
}

#[test]
fn composites_surface_style_opacity_without_changing_child_alpha() {
    let layout = test_layout();
    let ui = UiProjection::new(vec![UiOverlayProjection {
        surface: Some(
            UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(
                UiSurfaceNodeProjection::new(
                    "group",
                    UiSurfaceNodeKind::Fragment,
                    rect(0.0, 0.0, 0.0, 0.0),
                )
                .with_style(UiSurfaceResolvedStyle {
                    opacity: Some(0.5),
                    ..Default::default()
                })
                .with_children(vec![UiSurfaceNodeProjection::new(
                    "title",
                    UiSurfaceNodeKind::Text,
                    rect(40.0, 48.0, 240.0, 44.0),
                )
                .with_text("Styled fade")
                .with_style(UiSurfaceResolvedStyle {
                    opacity: Some(0.8),
                    ..Default::default()
                })]),
            ),
        ),
        ..UiOverlayProjection::new("menu")
    }]);

    let commands = build_ui_commands(&layout, &ui);
    let title = commands
        .iter()
        .find(|command| command.id == "ui:menu:title")
        .unwrap();

    assert_eq!(title.kind, DrawCommandKind::Text);
    assert_eq!(title.opacity, 1.0);
    assert_eq!(
        title
            .composite_groups
            .iter()
            .map(|g| g.opacity)
            .collect::<Vec<_>>(),
        vec![0.5, 0.8]
    );
}
