use super::support::{
    build_menu_commands, button_child, scroll_bounds, scroll_node, scroll_root_with_child,
};
use super::*;

#[test]
fn expands_scroll_surface_nodes_to_clip_commands() {
    let commands = build_menu_commands(scroll_root_with_child(
        scroll_node().with_style(UiSurfaceResolvedStyle {
            background_color: Some("#101820".to_string()),
            border_radius: Some(12.0),
            ..Default::default()
        }),
        button_child("inside", 24.0, 44.0, 220.0, 56.0, "inside"),
    ));
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        vec![
            "ui:menu",
            "ui:menu:scroll",
            "ui:menu:scroll:clip-start",
            "ui:menu:inside",
            "ui:menu:scroll:clip-end"
        ]
    );

    let scroll_bounds = scroll_bounds();

    assert_eq!(commands[1].kind, DrawCommandKind::RoundedRect);
    assert!(commands[1].clip_bounds.is_empty());
    match &commands[1].params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.role, "ui-scroll");
            assert_eq!(params.fill_color, "#101820");
            assert_eq!(params.corner_radius, 12.0);
        }
        _ => panic!("expected scroll panel params"),
    }

    assert_eq!(commands[2].kind, DrawCommandKind::ClipStart);
    assert_eq!(commands[2].bounds, scroll_bounds);
    assert_eq!(commands[3].kind, DrawCommandKind::UiSurface);
    assert_eq!(commands[3].clip_bounds, vec![scroll_bounds]);
    assert_eq!(commands[4].kind, DrawCommandKind::ClipEnd);
    assert_eq!(commands[4].bounds, scroll_bounds);
}

#[test]
fn nested_scroll_surface_preserves_outer_and_viewport_clip_bounds() {
    let outer_bounds = LogicalRect {
        x: 10.0,
        y: 20.0,
        width: 260.0,
        height: 120.0,
    };
    let scroll_bounds = scroll_bounds();
    let commands = build_menu_commands(
        UiSurfaceNodeProjection {
            clip_children: true,
            ..UiSurfaceNodeProjection::new(
                "outer",
                UiSurfaceNodeKind::Panel,
                rect(10.0, 20.0, 260.0, 120.0),
            )
        }
        .with_children(vec![scroll_root_with_child(
            scroll_node(),
            button_child("inside", 24.0, 44.0, 220.0, 56.0, "inside"),
        )]),
    );
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        ids,
        vec![
            "ui:menu",
            "ui:menu:outer",
            "ui:menu:scroll",
            "ui:menu:scroll:clip-start",
            "ui:menu:inside",
            "ui:menu:scroll:clip-end"
        ]
    );

    let command = |id: &str| {
        commands
            .iter()
            .find(|command| command.id == id)
            .unwrap_or_else(|| panic!("missing command {id}"))
    };

    assert!(command("ui:menu:outer").clip_bounds.is_empty());
    assert_eq!(command("ui:menu:scroll").clip_bounds, vec![outer_bounds]);
    assert_eq!(
        command("ui:menu:scroll:clip-start").clip_bounds,
        vec![outer_bounds]
    );
    assert_eq!(
        command("ui:menu:inside").clip_bounds,
        vec![outer_bounds, scroll_bounds]
    );
    assert_eq!(
        command("ui:menu:scroll:clip-end").clip_bounds,
        vec![outer_bounds]
    );
}

#[test]
fn scroll_surface_background_image_stays_inside_viewport_clip_order() {
    let commands = build_menu_commands(scroll_root_with_child(
        scroll_node().with_style(UiSurfaceResolvedStyle {
            background_image: Some(UiSurfaceImageProjection::new("ui/scroll-bg.png")),
            background_position: Some(UiSurfaceBackgroundPositionProjection { x: 0.0, y: 1.0 }),
            background_size: Some(UiSurfaceObjectFitProjection::Cover),
            ..Default::default()
        }),
        button_child("inside", 24.0, 44.0, 220.0, 56.0, "inside"),
    ));
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();
    let scroll_bounds = scroll_bounds();

    assert_eq!(
        ids,
        vec![
            "ui:menu",
            "ui:menu:scroll:background-fill",
            "ui:menu:scroll:background-image",
            "ui:menu:scroll",
            "ui:menu:scroll:clip-start",
            "ui:menu:inside",
            "ui:menu:scroll:clip-end"
        ]
    );

    let image = &commands[2];
    assert_eq!(image.kind, DrawCommandKind::Image);
    assert_eq!(image.bounds, scroll_bounds);
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("images:ui/scroll-bg.png")]
    );
    match &image.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.fit, MediaFit::Cover);
            assert_eq!(params.origin.x, 0.0);
            assert_eq!(params.origin.y, 1.0);
            assert_eq!(params.source, scroll_bounds);
        }
        _ => panic!("expected scroll background image params"),
    }

    assert_eq!(commands[3].kind, DrawCommandKind::RoundedRect);
    assert_eq!(commands[4].kind, DrawCommandKind::ClipStart);
    assert_eq!(commands[5].clip_bounds, vec![scroll_bounds]);
    assert_eq!(commands[6].kind, DrawCommandKind::ClipEnd);
}
