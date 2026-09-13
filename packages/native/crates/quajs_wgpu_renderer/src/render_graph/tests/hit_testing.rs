use super::support::test_layout;
use super::*;

#[test]
fn hit_tests_topmost_interactive_command() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        DrawCommand::new(
            "panel",
            RenderPlane::Safe,
            DrawCommandKind::RoundedRect,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 500.0,
                height: 300.0,
            },
        )
        .interactive(true),
        DrawCommand::new(
            "button",
            RenderPlane::Safe,
            DrawCommandKind::UiSurface,
            LogicalRect {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 80.0,
            },
        )
        .z_index(10)
        .interactive(true),
        DrawCommand::new(
            "toast",
            RenderPlane::Overlay,
            DrawCommandKind::UiSurface,
            LogicalRect {
                x: 120.0,
                y: 120.0,
                width: 100.0,
                height: 40.0,
            },
        ),
    ]);

    assert_eq!(graph.hit_test(150.0, 130.0).unwrap().id, "button");
    assert_eq!(graph.hit_test(10.0, 10.0).unwrap().id, "panel");
    assert!(graph.hit_test(800.0, 800.0).is_none());
}

#[test]
fn hit_test_respects_command_clip_bounds() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([DrawCommand::new(
        "button",
        RenderPlane::Safe,
        DrawCommandKind::UiSurface,
        LogicalRect {
            x: 40.0,
            y: 40.0,
            width: 160.0,
            height: 120.0,
        },
    )
    .clip_bounds([LogicalRect {
        x: 20.0,
        y: 20.0,
        width: 220.0,
        height: 80.0,
    }])
    .interactive(true)]);

    assert_eq!(graph.hit_test(80.0, 80.0).unwrap().id, "button");
    assert!(graph.hit_test(80.0, 130.0).is_none());
}
