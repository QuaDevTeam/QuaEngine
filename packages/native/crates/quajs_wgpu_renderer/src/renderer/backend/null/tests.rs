use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::resources::NativeResourceLedger;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn records_submissions_without_gpu_work() {
    let mut backend = NullNativeRenderBackend::new();
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

    let submission = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 3,
            frame: &frame,
            resources: &resources,
        })
        .unwrap();

    assert_eq!(backend.submissions(), &[submission.clone()]);
    assert_eq!(backend.last_submission(), Some(&submission));
    assert_eq!(
        backend.diagnostics(),
        NullNativeRenderBackendDiagnostics {
            submitted_frames: 1,
            last_submission: Some(submission),
        }
    );
}
