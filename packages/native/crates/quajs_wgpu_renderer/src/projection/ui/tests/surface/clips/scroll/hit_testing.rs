use super::support::{append_menu_to_graph, button_child};
use super::*;

#[test]
fn scroll_surface_offset_updates_button_hit_testing() {
    let graph = append_menu_to_graph(
        UiSurfaceNodeProjection {
            scroll_offset_y: 72.0,
            ..UiSurfaceNodeProjection::new(
                "scroll",
                UiSurfaceNodeKind::Scroll,
                rect(40.0, 40.0, 220.0, 90.0),
            )
        }
        .with_children(vec![button_child(
            "inside", 60.0, 132.0, 180.0, 64.0, "inside",
        )]),
    );

    let hit = resolve_renderer_intent_at(&graph, 80.0, 84.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:inside");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:inside"));
    assert_eq!(hit.intent.action.as_deref(), Some("inside"));
    assert!(resolve_renderer_intent_at(&graph, 80.0, 152.0).is_none());
}

#[test]
fn scroll_surface_clip_bounds_filter_button_intents() {
    let graph = append_menu_to_graph(
        UiSurfaceNodeProjection::new(
            "scroll",
            UiSurfaceNodeKind::Scroll,
            rect(40.0, 40.0, 220.0, 90.0),
        )
        .with_children(vec![button_child(
            "inside", 60.0, 60.0, 180.0, 140.0, "inside",
        )]),
    );

    let hit = resolve_renderer_intent_at(&graph, 80.0, 80.0).unwrap();

    assert_eq!(hit.command_id, "ui:menu:inside");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu:inside"));
    assert_eq!(hit.intent.action.as_deref(), Some("inside"));
    assert!(resolve_renderer_intent_at(&graph, 80.0, 160.0).is_none());
}
