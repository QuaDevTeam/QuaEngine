use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::renderer::{NativeRenderBackendErrorKind, NativeRenderMissingResource};
use crate::resources::NativeResourceLedger;
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

#[test]
fn records_submissions_without_gpu_work() {
    let mut backend = NullNativeRenderBackend::new();
    let frame = frame_with_background();
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
            resources: NativeRenderBackendResourceDiagnostics {
                frames_with_missing_resources: 1,
                missing_resource_count: 1,
                last_missing_resources: submission.missing_resources.clone(),
            },
            last_submission: Some(submission),
        }
    );
}

#[test]
fn can_reject_submissions_with_missing_resources() {
    let mut backend = NullNativeRenderBackend::with_resource_policy(
        NativeRenderBackendResourcePolicy::RejectMissingResources,
    );
    let frame = frame_with_background();
    let resources = NativeResourceLedger::new();

    let error = backend
        .submit_frame(NativeRenderFrameRef {
            revision: 4,
            frame: &frame,
            resources: &resources,
        })
        .unwrap_err();

    assert_eq!(
        backend.resource_policy(),
        NativeRenderBackendResourcePolicy::RejectMissingResources
    );
    assert_eq!(error.kind, NativeRenderBackendErrorKind::BackendRejected);
    assert!(error.message.contains("missing resource"));
    assert!(error.message.contains("images:bg/school.png"));
    assert!(backend.submissions().is_empty());
    assert_eq!(
        backend.diagnostics().resources,
        NativeRenderBackendResourceDiagnostics::default()
    );
}

#[test]
fn summarizes_missing_resource_diagnostics() {
    let mut backend = NullNativeRenderBackend::new();
    let frame = frame_with_background();
    let resources = NativeResourceLedger::new();

    backend
        .submit_frame(NativeRenderFrameRef {
            revision: 1,
            frame: &frame,
            resources: &resources,
        })
        .unwrap();
    backend
        .submit_frame(NativeRenderFrameRef {
            revision: 2,
            frame: &frame,
            resources: &resources,
        })
        .unwrap();

    let diagnostics = backend.diagnostics();

    assert_eq!(diagnostics.resources.frames_with_missing_resources, 2);
    assert_eq!(diagnostics.resources.missing_resource_count, 2);
    assert_eq!(
        diagnostics.resources.last_missing_resources,
        vec![NativeRenderMissingResource {
            resource_id: "images:bg/school.png".into(),
            plane: RenderPlane::Scene,
            pipeline: DrawBatchPipeline::Image,
            kind: DrawCommandKind::Image,
            command_ids: vec!["background:main".to_string()],
        }]
    );
}

fn frame_with_background() -> crate::frame::PreparedNativeFrame {
    prepare_native_frame(
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
    )
}
