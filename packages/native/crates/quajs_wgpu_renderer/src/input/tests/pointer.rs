use crate::input::resolve_pointer_intent_at;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::stage_layout::{
    resolve_stage_layout, stage_logical_to_client_point, StageClientPoint, StageClientRectOrigin,
    StageContainerInput, StageLogicalPoint, ViewLayoutInput, ViewLayoutOrientation,
};

use super::support::{assert_close, test_layout};

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
fn pointer_in_letterbox_gutter_returns_no_intent() {
    let layout = resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(2560.0),
            height: Some(1080.0),
            ..Default::default()
        },
    );
    let graph = build_view_render_graph(
        layout,
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
    let origin = StageClientRectOrigin {
        left: 12.0,
        top: 24.0,
    };

    assert_close(graph.layout.viewport_x, 320.0);
    let gutter = resolve_pointer_intent_at(
        &graph,
        StageClientPoint {
            client_x: origin.left + graph.layout.viewport_x - 1.0,
            client_y: origin.top + graph.layout.viewport_height / 2.0,
        },
        origin,
    );

    assert!(!gutter.point.inside_viewport);
    assert!(!gutter.point.inside_stage);
    assert!(gutter.intent.is_none());

    let logical = StageLogicalPoint {
        x: choice.bounds.x + choice.bounds.width / 2.0,
        y: choice.bounds.y + choice.bounds.height / 2.0,
    };
    let viewport = resolve_pointer_intent_at(
        &graph,
        stage_logical_to_client_point(&graph.layout, logical, origin),
        origin,
    );

    assert!(viewport.point.inside_viewport);
    assert!(viewport.point.inside_stage);
    assert_eq!(viewport.intent.unwrap().command_id, "choice:choice-a");
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
