use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::{
    BackgroundMode, BackgroundProjection, BackgroundVideoProjection,
};
use crate::projection::view::ViewProjection;
use crate::render_graph::{DrawBatchPipeline, DrawCommandKind, RenderPlane};
use crate::renderer::{
    NativeRenderBackendErrorKind, NativeRenderFallbackDiagnostic, NativeRenderMissingResource,
};
use crate::resources::{NativeResourceKind, NativeResourceLedger};
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
    let expected_encoder_plan =
        NativeBackendEncoderPlan::from_draw_plan(backend.last_draw_plan().unwrap());
    let expected_command_stream_plan =
        NativeBackendCommandStreamPlan::from_encoder_plan(&expected_encoder_plan);
    let expected_execution_report =
        NativeBackendExecutionReport::from_command_stream_plan(&expected_command_stream_plan);

    assert_eq!(backend.submissions(), &[submission.clone()]);
    assert_eq!(backend.last_submission(), Some(&submission));
    assert_eq!(backend.last_encoder_plan(), Some(&expected_encoder_plan));
    assert_eq!(
        backend.last_command_stream_plan(),
        Some(&expected_command_stream_plan)
    );
    assert_eq!(
        backend.execution_reports(),
        &[expected_execution_report.clone()]
    );
    assert_eq!(
        backend.last_execution_report(),
        Some(&expected_execution_report)
    );
    assert_eq!(
        backend.diagnostics(),
        NullNativeRenderBackendDiagnostics {
            submitted_frames: 1,
            resources: NativeRenderBackendResourceDiagnostics {
                frames_with_missing_resources: 1,
                missing_resource_count: 1,
                last_missing_resources: submission.missing_resources.clone(),
                missing_resources_by_kind: [(NativeResourceKind::Texture, 1)].into(),
                ..Default::default()
            },
            fallback_warnings: NativeRenderFallbackWarningDiagnostics::default(),
            last_submission: Some(submission),
            last_draw_plan: backend.last_draw_plan().cloned(),
            last_encoder_plan: Some(expected_encoder_plan),
            last_command_stream_plan: Some(expected_command_stream_plan),
            last_execution_report: Some(expected_execution_report),
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
            owner_package_ids: Default::default(),
            required_package_ids: Default::default(),
        }]
    );
}

#[test]
fn reports_fallback_warnings_once_per_backend() {
    let mut backend = NullNativeRenderBackend::new();
    let frame = frame_with_video_fallback();
    let resources = NativeResourceLedger::new();

    let first = backend
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

    assert_eq!(diagnostics.fallback_warnings.warning_count, 1);
    assert_eq!(
        diagnostics.fallback_warnings.last_warnings,
        Vec::<NativeRenderFallbackDiagnostic>::new()
    );
    assert_eq!(first.fallback_diagnostics.len(), 1);
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

fn frame_with_video_fallback() -> crate::frame::PreparedNativeFrame {
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
                mode: BackgroundMode::Video,
                video: Some(BackgroundVideoProjection {
                    poster: Some("poster.png".to_string()),
                    ..BackgroundVideoProjection::new("opening.mp4")
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
}
