use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::resources::NativeResourceLedger;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn creates_submission_stats_from_frame_ref() {
    let frame = prepare_native_frame(
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
        ),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    let resources = NativeResourceLedger::new();
    let frame_ref = NativeRenderFrameRef {
        revision: 7,
        frame: &frame,
        resources: &resources,
    };

    assert_eq!(
        frame_ref.submission(),
        NativeRenderSubmission {
            revision: 7,
            pass_count: 1,
            batch_count: 1,
            command_count: 1,
            resource_count: 0,
        }
    );
}
