use super::*;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::ui::{
    UiIntentProjection, UiOverlayProjection, UiOverlaySurfaceProjection, UiProjection,
};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommand, DrawCommandKind, DrawCommandParams, RenderPlane};
use crate::stage_layout::{
    resolve_stage_layout, stage_logical_to_client_point, ResolvedStageLayout, StageClientPoint,
    StageClientRectOrigin, StageContainerInput, StageLogicalPoint, ViewLayoutInput,
    ViewLayoutOrientation,
};

const EPSILON: f64 = 0.0001;

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

#[test]
fn resolves_pointer_intent_with_container_offset() {
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
    let logical = StageLogicalPoint {
        x: choice.bounds.x + choice.bounds.width / 2.0,
        y: choice.bounds.y + choice.bounds.height / 2.0,
    };
    let origin = StageClientRectOrigin {
        left: 88.0,
        top: 42.0,
    };
    let client = stage_logical_to_client_point(&graph.layout, logical, origin);

    let resolution = resolve_pointer_intent_at(&graph, client, origin);

    assert_close(resolution.point.x, logical.x);
    assert_close(resolution.point.y, logical.y);
    assert!(resolution.point.inside_viewport);
    assert!(resolution.point.inside_stage);
    let hit = resolution.intent.unwrap();
    assert_eq!(hit.command_id, "choice:choice-a");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("choice-a"));
}

#[test]
fn pointer_outside_viewport_returns_no_intent() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ..Default::default()
        },
    );
    let origin = StageClientRectOrigin {
        left: 88.0,
        top: 42.0,
    };

    let resolution = resolve_pointer_intent_at(
        &graph,
        StageClientPoint {
            client_x: origin.left - 1.0,
            client_y: origin.top + 100.0,
        },
        origin,
    );

    assert!(!resolution.point.inside_viewport);
    assert!(!resolution.point.inside_stage);
    assert!(resolution.intent.is_none());
}

#[test]
fn pointer_hit_on_disabled_choice_returns_no_intent() {
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
    let logical = StageLogicalPoint {
        x: disabled.bounds.x + disabled.bounds.width / 2.0,
        y: disabled.bounds.y + disabled.bounds.height / 2.0,
    };
    let client =
        stage_logical_to_client_point(&graph.layout, logical, StageClientRectOrigin::default());

    let resolution = resolve_pointer_intent_at(&graph, client, StageClientRectOrigin::default());

    assert!(resolution.point.inside_viewport);
    assert!(resolution.point.inside_stage);
    assert!(resolution.intent.is_none());
}

#[test]
fn pointer_resolution_preserves_logical_hit_metadata_without_intent() {
    let graph = build_view_render_graph(test_layout(), &ViewProjection::default());
    let logical = StageLogicalPoint { x: 320.0, y: 240.0 };
    let origin = StageClientRectOrigin {
        left: 15.0,
        top: 30.0,
    };
    let client = stage_logical_to_client_point(&graph.layout, logical, origin);

    let resolution = resolve_pointer_intent_at(&graph, client, origin);

    assert_close(resolution.point.x, logical.x);
    assert_close(resolution.point.y, logical.y);
    assert!(resolution.point.inside_viewport);
    assert!(resolution.point.inside_stage);
    assert!(resolution.intent.is_none());
}

#[test]
fn resolves_ui_overlay_intent_above_choices() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ui: Some(UiProjection::new(vec![UiOverlayProjection {
                surface: Some(UiOverlaySurfaceProjection::new("ui/menu.qui")),
                intent: Some(UiIntentProjection::new("close")),
                ..UiOverlayProjection::new("menu")
            }])),
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

    assert_eq!(hit.command_id, "ui:menu");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.element_id.as_deref(), Some("menu"));
    assert_eq!(hit.intent.action.as_deref(), Some("close"));
    assert!(hit.intent.choice_id.is_none());
}

#[test]
fn interactive_overlay_without_action_blocks_underlying_choice_intent() {
    let graph = build_view_render_graph(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
                "choice-a", "Choice A",
            )])),
            ui: Some(UiProjection::new(vec![
                UiOverlayProjection::new("menu").with_surface("ui/menu.qui")
            ])),
            ..Default::default()
        },
    );
    let choice = graph
        .commands()
        .iter()
        .find(|command| command.id == "choice:choice-a")
        .unwrap();

    assert!(resolve_renderer_intent_at(
        &graph,
        choice.bounds.x + choice.bounds.width / 2.0,
        choice.bounds.y + choice.bounds.height / 2.0,
    )
    .is_none());
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

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < EPSILON,
        "expected {actual} to be close to {expected}",
    );
}
