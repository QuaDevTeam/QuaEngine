use super::*;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn resolves_choice_select_intent_from_combined_graph_hit() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ..Default::default()
        },
    );
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:choice-a")
        .unwrap();

    let hit = resolve_renderer_intent_at(
        &graph,
        choice.bounds.x + choice.bounds.width / 2.0,
        choice.bounds.y + choice.bounds.height / 2.0,
    )
    .unwrap();

    assert_eq!(hit.command_id, "choice:choice-a");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("choice-a"));
}

#[test]
fn ignores_disabled_choice_hit() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection {
                enabled: false,
                ..ChoiceProjection::new("locked", "Locked")
            }])),
            ..Default::default()
        },
    );
    let disabled = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:locked")
        .unwrap();

    assert!(resolve_renderer_intent_at(
        &graph,
        disabled.bounds.x + disabled.bounds.width / 2.0,
        disabled.bounds.y + disabled.bounds.height / 2.0,
    )
    .is_none());
}

#[test]
fn ignores_interactive_commands_without_declared_intent() {
    let mut graph = crate::render_graph::RenderGraph::new(test_layout());
    graph.push(
        DrawCommand::new(
            "panel:focus",
            RenderPlane::Safe,
            DrawCommandKind::UiSurface,
            crate::render_graph::LogicalRect {
                x: 20.0,
                y: 20.0,
                width: 120.0,
                height: 80.0,
            },
        )
        .interactive(true)
        .params(DrawCommandParams::None),
    );

    assert!(resolve_renderer_intent_at(&graph, 40.0, 40.0).is_none());
}

#[test]
fn returns_none_when_no_interactive_command_is_hit() {
    let graph = build_view_render_graph(test_layout(), &ViewProjection::default());

    assert!(resolve_renderer_intent_at(&graph, 100.0, 100.0).is_none());
}

fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}
