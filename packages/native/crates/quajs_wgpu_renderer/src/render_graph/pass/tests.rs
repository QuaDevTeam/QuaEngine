use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::character::CharacterProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::dialogue::DialogueProjection;
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawBatchPipeline, RenderPlane};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn creates_non_empty_passes_in_plane_order() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let plan = plan_render_passes(&graph);
    let planes = plan
        .passes
        .iter()
        .map(|pass| pass.plane)
        .collect::<Vec<_>>();

    assert_eq!(
        planes,
        vec![RenderPlane::Scene, RenderPlane::Subject, RenderPlane::Safe]
    );
    assert_eq!(plan.batch_count, 8);
    assert_eq!(plan.command_count, graph.commands().len());
    assert_eq!(plan.pass(RenderPlane::Overlay), None);
}

#[test]
fn keeps_batches_grouped_under_their_render_plane() {
    let graph = build_view_render_graph(test_layout(), &full_view());
    let plan = plan_render_passes(&graph);

    let scene = plan.pass(RenderPlane::Scene).unwrap();
    assert_eq!(scene.command_count, 1);
    assert_eq!(scene.batches[0].key.pipeline, DrawBatchPipeline::Image);

    let subject = plan.pass(RenderPlane::Subject).unwrap();
    assert_eq!(subject.command_count, 1);
    assert_eq!(
        subject.batches[0].key.pipeline,
        DrawBatchPipeline::Character
    );

    let safe = plan.pass(RenderPlane::Safe).unwrap();
    assert_eq!(safe.command_count, 11);
    assert_eq!(safe.batches[0].key.pipeline, DrawBatchPipeline::Shape);
    assert_eq!(safe.batches[1].key.pipeline, DrawBatchPipeline::Text);
    assert_eq!(safe.batches[1].command_ids, vec!["dialogue:speaker"]);
    assert_eq!(safe.batches[3].command_ids, vec!["dialogue:text"]);
    assert_eq!(safe.batches[5].key.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(
        safe.batches[5].command_ids,
        vec!["choice:stay", "choice:leave"]
    );
}

#[test]
fn exposes_viewport_metadata_from_resolved_layout() {
    let layout = test_layout();
    let graph = build_view_render_graph(layout.clone(), &full_view());
    let plan = plan_render_passes(&graph);
    let viewport = plan.pass(RenderPlane::Scene).unwrap().viewport;

    assert_eq!(viewport.logical_width, layout.logical_width);
    assert_eq!(viewport.logical_height, layout.logical_height);
    assert_eq!(viewport.viewport_width, layout.viewport_width);
    assert_eq!(viewport.viewport_height, layout.viewport_height);
    assert_eq!(
        viewport.physical_viewport_width,
        layout.physical_viewport_width
    );
    assert_eq!(
        viewport.physical_viewport_height,
        layout.physical_viewport_height
    );
    assert_eq!(viewport.scale, layout.scale);
    assert_eq!(viewport.device_pixel_ratio, layout.device_pixel_ratio);
}

#[test]
fn empty_graph_creates_empty_pass_plan() {
    let graph = build_view_render_graph(test_layout(), &ViewProjection::default());
    let plan = plan_render_passes(&graph);

    assert!(plan.passes.is_empty());
    assert_eq!(plan.batch_count, 0);
    assert_eq!(plan.command_count, 0);
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
