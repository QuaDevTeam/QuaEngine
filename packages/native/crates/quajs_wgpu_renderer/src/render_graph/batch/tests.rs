use super::*;
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::projection::{
    background::BackgroundProjection,
    character::CharacterProjection,
    choices::{ChoiceProjection, ChoiceSetProjection},
    dialogue::DialogueProjection,
};
use crate::render_graph::{
    BorderDrawParams, DrawCommand, DrawCommandKind, DrawCommandParams, EdgeInsetsDrawParam,
    LogicalRect, PanelDrawParams, RenderGraph, RenderPlane,
};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn groups_adjacent_commands_with_matching_batch_keys() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("a", "images:shared.png"),
        image_command("b", "images:shared.png"),
        image_command("c", "images:other.png"),
        image_command("d", "images:shared.png"),
    ]);

    let batches = plan_draw_batches(&graph);

    assert_eq!(batches.len(), 3);
    assert_eq!(batches[0].key.pipeline, DrawBatchPipeline::Image);
    assert_eq!(batches[0].command_ids, vec!["a", "b"]);
    assert_eq!(batches[0].command_count(), 2);
    assert_eq!(batches[1].command_ids, vec!["c"]);
    assert_eq!(batches[2].command_ids, vec!["d"]);
}

#[test]
fn keeps_different_planes_and_kinds_in_separate_batches() {
    let mut graph = RenderGraph::new(test_layout());
    graph.extend([
        image_command("scene", "images:shared.png"),
        DrawCommand::new(
            "subject",
            RenderPlane::Subject,
            DrawCommandKind::Image,
            rect(),
        )
        .resource("images:shared.png"),
        DrawCommand::new(
            "panel",
            RenderPlane::Subject,
            DrawCommandKind::RoundedRect,
            rect(),
        )
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: "panel".to_string(),
            corner_radius: 8.0,
            fill_color: "#000".to_string(),
            border: BorderDrawParams::default(),
            padding: EdgeInsetsDrawParam::default(),
            intent: None,
        })),
    ]);

    let batches = plan_draw_batches(&graph);

    assert_eq!(batches.len(), 3);
    assert_eq!(batches[0].command_ids, vec!["scene"]);
    assert_eq!(batches[1].command_ids, vec!["subject"]);
    assert_eq!(batches[2].command_ids, vec!["panel"]);
    assert_eq!(batches[0].key.plane, RenderPlane::Scene);
    assert_eq!(batches[1].key.plane, RenderPlane::Subject);
    assert_eq!(batches[1].key.pipeline, DrawBatchPipeline::Image);
    assert_eq!(batches[2].key.pipeline, DrawBatchPipeline::Shape);
}

#[test]
fn batches_full_view_without_changing_draw_order() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let batches = plan_draw_batches(&graph);
    let flattened_ids = batches
        .iter()
        .flat_map(|batch| batch.command_ids.iter().map(String::as_str))
        .collect::<Vec<_>>();
    let graph_ids = graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(flattened_ids, graph_ids);
    assert_eq!(batches[0].key.pipeline, DrawBatchPipeline::Image);
    assert_eq!(batches[1].key.pipeline, DrawBatchPipeline::Character);
    assert_eq!(batches[2].key.pipeline, DrawBatchPipeline::Shape);
    assert_eq!(batches[3].key.pipeline, DrawBatchPipeline::Text);
    assert_eq!(batches[3].command_ids, vec!["dialogue:speaker"]);
    assert_eq!(batches[4].key.pipeline, DrawBatchPipeline::Shape);
    assert_eq!(batches[5].key.pipeline, DrawBatchPipeline::Text);
    assert_eq!(batches[5].command_ids, vec!["dialogue:text"]);
    assert_eq!(batches[6].key.pipeline, DrawBatchPipeline::Shape);
    assert_eq!(batches[7].key.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(batches[7].command_ids, vec!["choice:stay", "choice:leave"]);
}

fn full_view() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            ..Default::default()
        }),
        characters: vec![CharacterProjection {
            sprite: Some("yuki/default.png".to_string()),
            ..CharacterProjection::new("yuki", "Yuki")
        }],
        dialogue: Some(DialogueProjection {
            speaker: Some("Yuki".into()),
            ..DialogueProjection::say("Hello")
        }),
        choices: Some(ChoiceSetProjection::new(vec![
            ChoiceProjection::new("stay", "Stay"),
            ChoiceProjection {
                enabled: false,
                ..ChoiceProjection::new("leave", "Leave")
            },
        ])),
        ..Default::default()
    }
}

fn image_command(id: &str, resource_id: &str) -> DrawCommand {
    DrawCommand::new(id, RenderPlane::Scene, DrawCommandKind::Image, rect()).resource(resource_id)
}

fn rect() -> LogicalRect {
    LogicalRect {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    }
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
