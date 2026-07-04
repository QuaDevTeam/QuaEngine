use super::support::{command, test_layout};
use super::*;

#[test]
fn sorts_commands_by_web_aligned_plane_order_and_z_index() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("overlay", RenderPlane::Overlay, DrawCommandKind::Rect).z_index(-10),
        command("scene-front", RenderPlane::Scene, DrawCommandKind::Image).z_index(20),
        command("subject", RenderPlane::Subject, DrawCommandKind::Image),
        command("scene-back", RenderPlane::Scene, DrawCommandKind::Clear).z_index(-10),
        command("screen", RenderPlane::Screen, DrawCommandKind::UiSurface),
        command("safe", RenderPlane::Safe, DrawCommandKind::Text),
    ]);

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(
        ids,
        vec![
            "scene-back",
            "scene-front",
            "subject",
            "safe",
            "overlay",
            "screen"
        ]
    );
}

#[test]
fn sorts_commands_with_extreme_internal_z_index_without_overflowing() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        command("max", RenderPlane::Screen, DrawCommandKind::UiSurface).z_index(i32::MAX),
        command("min", RenderPlane::Scene, DrawCommandKind::Image).z_index(i32::MIN),
        command("normal", RenderPlane::Safe, DrawCommandKind::Text),
    ]);

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(ids, vec!["min", "normal", "max"]);
}
