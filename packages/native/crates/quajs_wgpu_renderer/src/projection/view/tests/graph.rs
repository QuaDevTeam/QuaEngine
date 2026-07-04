use super::support::{full_view, test_layout};
use super::*;
use crate::render_graph::{DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane};

#[test]
fn builds_empty_view_graph() {
    let layout = test_layout();
    let graph = build_view_render_graph(layout.clone(), &ViewProjection::default());

    assert_eq!(graph.layout, layout);
    assert!(graph.commands().is_empty());
    assert_eq!(graph.summary().command_count, 0);
}

#[test]
fn builds_full_view_graph_in_render_plane_order() {
    let graph = build_view_render_graph(test_layout(), &full_view());

    let ids: Vec<_> = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect();

    assert_eq!(
        ids,
        vec![
            "background:main",
            "character:yuki",
            "dialogue:panel",
            "dialogue:speaker",
            "dialogue:text",
            "choices:panel",
            "choice:stay",
            "choice:leave",
        ]
    );

    assert_eq!(graph.commands()[0].plane, RenderPlane::Scene);
    assert_eq!(graph.commands()[1].plane, RenderPlane::Subject);
    assert!(graph.commands()[6].interactive);
    assert!(!graph.commands()[7].interactive);
}

#[test]
fn hit_tests_enabled_choice_from_combined_graph() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:stay")
        .unwrap();
    let hit = graph
        .hit_test(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0,
        )
        .unwrap();

    assert_eq!(hit.id, "choice:stay");
    match &hit.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.intent.as_ref().unwrap().event, "choice/select");
            assert_eq!(
                params.intent.as_ref().unwrap().choice_id.as_deref(),
                Some("stay")
            );
        }
        _ => panic!("expected choice button params"),
    }
}

#[test]
fn append_view_commands_keeps_existing_commands() {
    let layout = test_layout();
    let mut graph = RenderGraph::new(layout);
    graph.push(crate::render_graph::DrawCommand::new(
        "screen:debug",
        RenderPlane::Screen,
        DrawCommandKind::UiSurface,
        crate::render_graph::LogicalRect {
            x: 0.0,
            y: 0.0,
            width: 120.0,
            height: 40.0,
        },
    ));

    append_view_commands(&mut graph, &full_view());

    assert_eq!(graph.commands().last().unwrap().id, "screen:debug");
    assert_eq!(graph.summary().command_count, 9);
}
