use std::collections::BTreeSet;

use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::common::FontFamilyProjection;
use crate::projection::dialogue::{DialogueProjection, RichTextStyle};
use crate::projection::view::ViewProjection;
use crate::resources::{NativeResourceKind, NativeResourceLedger, ResourceId};

#[test]
fn summarizes_missing_resources_from_batches() {
    let frame = frame_with_background();
    let resources = NativeResourceLedger::new();
    let submission = NativeRenderFrameRef {
        revision: 8,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 1);
    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("images:bg/school.png"),
            plane: crate::render_graph::RenderPlane::Scene,
            pipeline: crate::render_graph::DrawBatchPipeline::Image,
            kind: crate::render_graph::DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
            owner_package_ids: BTreeSet::new(),
            required_package_ids: BTreeSet::new(),
        }]
    );
}

#[test]
fn missing_resource_diagnostics_preserve_command_package_provenance() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/runtime.png".to_string()),
                provenance: package_provenance("runtime.background", ["base"]),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 10,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(
        submission.missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: ResourceId::from("images:bg/runtime.png"),
            plane: crate::render_graph::RenderPlane::Scene,
            pipeline: crate::render_graph::DrawBatchPipeline::Image,
            kind: crate::render_graph::DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
            owner_package_ids: BTreeSet::from(["runtime.background".to_string()]),
            required_package_ids: BTreeSet::from(["base".to_string()]),
        }]
    );
}

#[test]
fn missing_font_resources_remain_command_local_without_blocking_submission() {
    let frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            dialogue: Some(DialogueProjection {
                speaker: Some("Yuki".into()),
                speaker_style: RichTextStyle {
                    font_family: Some(FontFamilyProjection::new(["Qua Serif"])),
                    ..Default::default()
                },
                provenance: package_provenance("runtime.dialogue", ["runtime.fonts"]),
                ..DialogueProjection::say("Hello")
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();

    let submission = NativeRenderFrameRef {
        revision: 12,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());

    let speaker_batch = submission
        .passes
        .iter()
        .flat_map(|pass| pass.batches.iter())
        .find(|batch| batch.command_ids == vec!["dialogue:speaker".to_string()])
        .unwrap();
    assert_eq!(
        speaker_batch.missing_resource_ids,
        vec![ResourceId::from("fonts:Qua Serif")]
    );
    assert_eq!(
        speaker_batch.commands[0].missing_resource_ids,
        vec![ResourceId::from("fonts:Qua Serif")]
    );

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[submission]);
    assert_eq!(diagnostics.missing_resource_count, 0);
    assert_eq!(
        diagnostics
            .missing_resources_by_kind
            .get(&NativeResourceKind::FontFace),
        None
    );
}
