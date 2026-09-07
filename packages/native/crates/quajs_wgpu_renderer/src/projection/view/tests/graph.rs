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
            "dialogue:backdrop-blur",
            "dialogue:shadow",
            "dialogue:panel",
            "dialogue:gradient",
            "dialogue:inset-highlight",
            "dialogue:accent-left",
            "dialogue:accent-right",
            "dialogue:speaker:shadow",
            "dialogue:text:shadow",
            "dialogue:speaker",
            "dialogue:speaker-accent",
            "dialogue:text",
            "choices:panel",
            "choice:stay",
            "choice:leave",
        ]
    );

    assert_eq!(graph.commands()[0].plane, RenderPlane::Scene);
    assert_eq!(graph.commands()[1].plane, RenderPlane::Subject);
    assert!(
        graph
            .commands()
            .iter()
            .find(|command| command.id == "choice:stay")
            .unwrap()
            .interactive
    );
    assert!(
        !graph
            .commands()
            .iter()
            .find(|command| command.id == "choice:leave")
            .unwrap()
            .interactive
    );
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
    assert_eq!(graph.summary().command_count, 18);
}

#[test]
fn motion_projects_scene_groups_and_moves_choice_hit_tests() {
    use crate::projection::motion::MotionProjection;
    let mut view = full_view();
    view.stage = Some(MotionProjection {
        x: Some(100.0),
        opacity: Some(0.5),
        ..Default::default()
    });
    let set = view.choices.as_mut().unwrap();
    set.choices[0].motion.y = Some(-200.0);
    set.choices[0].motion.scale = Some(0.5);
    let graph = build_view_render_graph(test_layout(), &view);
    let choice = graph
        .commands()
        .iter()
        .find(|c| c.id.starts_with("choice:"))
        .unwrap();
    let cx = choice.bounds.x + choice.bounds.width / 2.0;
    let cy = choice.bounds.y + choice.bounds.height / 2.0;
    assert_eq!(
        graph.hit_test(cx, cy - 200.0).map(|c| c.id.as_str()),
        Some(choice.id.as_str())
    );
    assert_ne!(
        graph.hit_test(cx, cy).map(|c| c.id.as_str()),
        Some(choice.id.as_str())
    );
    let character = graph
        .commands()
        .iter()
        .find(|c| c.id.starts_with("character:"))
        .unwrap();
    assert_eq!(character.composite_groups[0].id, "motion:stage");
    assert_eq!(character.composite_groups[0].opacity, 0.5);
    assert_eq!(character.composite_groups[0].transform[4], 100.0);
    assert!(!choice
        .composite_groups
        .iter()
        .any(|g| g.id == "motion:stage"));
}
