use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::view::ViewProjection;
use crate::renderer::{
    NativeRenderBackend, NativeRenderBackendResult, NativeRenderFrameRef, NativeRenderSubmission,
};
use crate::stage_layout::{
    resolve_stage_layout, stage_logical_to_client_point, ResolvedStageLayout, StageClientPoint,
    StageClientRectOrigin, StageContainerInput, StageLogicalPoint, ViewLayoutInput,
    ViewLayoutOrientation,
};

mod frame;
mod json_input;
mod metrics;
mod pointer;
mod resources;

#[derive(Clone, Debug, Default, PartialEq)]
struct RecordingBackend {
    submissions: Vec<NativeRenderSubmission>,
}

impl NativeRenderBackend for RecordingBackend {
    fn submit_frame(&mut self, frame: NativeRenderFrameRef<'_>) -> NativeRenderBackendResult {
        let submission = frame.submission();
        self.submissions.push(submission.clone());
        Ok(submission)
    }
}

fn view_with_background_and_choice() -> ViewProjection {
    ViewProjection {
        background: Some(BackgroundProjection {
            asset_name: Some("bg/school.png".to_string()),
            provenance: provenance("base", []),
            ..Default::default()
        }),
        choices: Some(ChoiceSetProjection {
            motion: Default::default(),
            visible: true,
            provenance: provenance("runtime.choices", ["base"]),
            choices: vec![
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("stay", "Stay")
                },
                ChoiceProjection {
                    provenance: provenance("runtime.choices", ["base"]),
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ],
        }),
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

fn client_point_for_choice<B>(
    renderer: &NativeRenderer<B>,
    command_id: &str,
) -> (StageClientPoint, StageClientRectOrigin)
where
    B: NativeRenderBackend,
{
    client_point_for_command(renderer, command_id)
}

fn client_point_for_command<B>(
    renderer: &NativeRenderer<B>,
    command_id: &str,
) -> (StageClientPoint, StageClientRectOrigin)
where
    B: NativeRenderBackend,
{
    let command = renderer
        .state()
        .frame()
        .unwrap()
        .graph
        .commands()
        .iter()
        .find(|command| command.id == command_id)
        .unwrap();
    let logical = StageLogicalPoint {
        x: command.bounds.x + command.bounds.width / 2.0,
        y: command.bounds.y + command.bounds.height / 2.0,
    };
    let origin = StageClientRectOrigin {
        left: 64.0,
        top: 32.0,
    };
    let client = stage_logical_to_client_point(
        &renderer.state().frame().unwrap().graph.layout,
        logical,
        origin,
    );

    (client, origin)
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
