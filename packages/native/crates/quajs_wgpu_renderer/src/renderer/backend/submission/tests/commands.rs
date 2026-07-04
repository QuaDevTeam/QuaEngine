use crate::frame::prepare_native_frame;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandParams};
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

use super::super::NativeRenderFrameRef;
use super::support::{frame_with_background, test_layout};

#[test]
fn summarizes_batch_command_metadata() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            choices: Some(ChoiceSetProjection::new(vec![
                ChoiceProjection::new("stay", "Stay"),
                ChoiceProjection {
                    enabled: false,
                    ..ChoiceProjection::new("leave", "Leave")
                },
            ])),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();
    let frame_ref = NativeRenderFrameRef {
        revision: 13,
        frame: &frame,
        resources: &resources,
    };

    let submission = frame_ref.submission();
    let choice_batch = submission.passes[0]
        .batches
        .iter()
        .find(|batch| {
            batch
                .command_ids
                .iter()
                .map(String::as_str)
                .eq(["choice:stay", "choice:leave"])
        })
        .unwrap();

    assert_eq!(choice_batch.pipeline, DrawBatchPipeline::Ui);
    assert_eq!(choice_batch.command_count, 2);
    assert_eq!(choice_batch.commands.len(), 2);
    assert_eq!(choice_batch.commands[0].command.id, "choice:stay");
    assert_eq!(choice_batch.commands[1].command.id, "choice:leave");
    match &choice_batch.commands[0].command.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Stay");
            assert!(params.enabled);
        }
        _ => panic!("expected choice button command snapshot"),
    }
    match &choice_batch.commands[1].command.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Leave");
            assert!(!params.enabled);
        }
        _ => panic!("expected choice button command snapshot"),
    }
    assert_eq!(
        choice_batch.first_command_id.as_deref(),
        Some("choice:stay")
    );
    assert_eq!(
        choice_batch.last_command_id.as_deref(),
        Some("choice:leave")
    );
}

#[test]
fn command_snapshots_preserve_per_command_resource_resolution() {
    let frame = frame_with_background();
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(512, 4096),
    );

    let submission = NativeRenderFrameRef {
        revision: 15,
        frame: &frame,
        resources: &resources,
    }
    .submission();
    let command = &submission.passes[0].batches[0].commands[0];

    assert_eq!(command.command.id, "background:main");
    assert_eq!(
        command.resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert!(command.missing_resource_ids.is_empty());
    assert_eq!(submission.missing_resource_count, 0);
}
