use super::*;

pub(super) fn scroll_bounds() -> LogicalRect {
    LogicalRect {
        x: 20.0,
        y: 30.0,
        width: 300.0,
        height: 160.0,
    }
}

pub(super) fn menu_overlay_with_scroll_root(root: UiSurfaceNodeProjection) -> UiOverlayProjection {
    UiOverlayProjection {
        surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui").with_root(root)),
        ..UiOverlayProjection::new("menu")
    }
}

pub(super) fn scroll_root_with_child(
    root: UiSurfaceNodeProjection,
    child: UiSurfaceNodeProjection,
) -> UiSurfaceNodeProjection {
    root.with_children(vec![child])
}

pub(super) fn scroll_node() -> UiSurfaceNodeProjection {
    UiSurfaceNodeProjection::new(
        "scroll",
        UiSurfaceNodeKind::Scroll,
        rect(20.0, 30.0, 300.0, 160.0),
    )
}

pub(super) fn button_child(
    id: &str,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    action: &str,
) -> UiSurfaceNodeProjection {
    UiSurfaceNodeProjection::new(id, UiSurfaceNodeKind::Button, rect(x, y, width, height))
        .with_text("Inside")
        .with_intent(UiIntentProjection::new(action))
}

pub(super) fn build_menu_commands(
    root: UiSurfaceNodeProjection,
) -> Vec<crate::render_graph::DrawCommand> {
    let layout = test_layout();
    let ui = UiProjection::new(vec![menu_overlay_with_scroll_root(root)]);

    build_ui_commands(&layout, &ui)
}

pub(super) fn append_menu_to_graph(root: UiSurfaceNodeProjection) -> RenderGraph {
    let mut graph = RenderGraph::new(test_layout());
    append_ui_commands(
        &mut graph,
        &UiProjection::new(vec![UiOverlayProjection {
            interactive: Some(false),
            ..menu_overlay_with_scroll_root(root)
        }]),
    );
    graph
}
