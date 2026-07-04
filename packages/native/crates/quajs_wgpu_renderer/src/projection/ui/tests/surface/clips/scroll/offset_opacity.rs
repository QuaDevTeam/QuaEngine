use super::support::{
    build_menu_commands, button_child, scroll_bounds, scroll_node, scroll_root_with_child,
};
use super::*;

#[test]
fn scroll_surface_offsets_child_projection_without_moving_viewport() {
    let commands = build_menu_commands(scroll_root_with_child(
        UiSurfaceNodeProjection {
            scroll_offset_y: 72.0,
            ..scroll_node()
        },
        button_child("inside", 24.0, 112.0, 220.0, 56.0, "inside"),
    ));
    let scroll = commands
        .iter()
        .find(|command| command.id == "ui:menu:scroll")
        .unwrap();
    let inside = commands
        .iter()
        .find(|command| command.id == "ui:menu:inside")
        .unwrap();
    let scroll_bounds = scroll_bounds();

    assert_eq!(scroll.bounds, scroll_bounds);
    assert_eq!(
        inside.bounds,
        LogicalRect {
            x: 24.0,
            y: 40.0,
            width: 220.0,
            height: 56.0,
        }
    );
    assert_eq!(inside.clip_bounds, vec![scroll_bounds]);
}

#[test]
fn scroll_surface_opacity_applies_to_panel_and_children() {
    let commands = build_menu_commands(scroll_root_with_child(
        UiSurfaceNodeProjection {
            opacity: 0.5,
            ..scroll_node()
        },
        UiSurfaceNodeProjection {
            opacity: 0.6,
            ..button_child("inside", 24.0, 44.0, 220.0, 56.0, "inside")
        },
    ));
    let scroll = commands
        .iter()
        .find(|command| command.id == "ui:menu:scroll")
        .unwrap();
    let inside = commands
        .iter()
        .find(|command| command.id == "ui:menu:inside")
        .unwrap();
    let clip_start = commands
        .iter()
        .find(|command| command.id == "ui:menu:scroll:clip-start")
        .unwrap();
    let clip_end = commands
        .iter()
        .find(|command| command.id == "ui:menu:scroll:clip-end")
        .unwrap();

    assert!((scroll.opacity - 0.5).abs() < 0.0001);
    assert!((inside.opacity - 0.3).abs() < 0.0001);
    assert_eq!(clip_start.opacity, 1.0);
    assert_eq!(clip_end.opacity, 1.0);
}
