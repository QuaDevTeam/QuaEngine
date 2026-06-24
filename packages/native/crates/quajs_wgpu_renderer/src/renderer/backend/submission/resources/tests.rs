use super::*;
use crate::frame::prepare_native_frame;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};
use crate::stage_layout::{
    resolve_stage_layout, StageContainerInput, ViewLayoutInput, ViewLayoutOrientation,
};

use super::super::NativeRenderFrameRef;

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
        }]
    );
}

#[test]
fn summarizes_backend_resource_diagnostics_from_submissions() {
    let frame = frame_with_background();
    let empty_resources = NativeResourceLedger::new();
    let mut resolved_resources = NativeResourceLedger::new();
    resolved_resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(1, 1),
    );
    let missing_first = NativeRenderFrameRef {
        revision: 1,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();
    let resolved_second = NativeRenderFrameRef {
        revision: 2,
        frame: &frame,
        resources: &resolved_resources,
    }
    .submission();
    let missing_third = NativeRenderFrameRef {
        revision: 3,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();

    let diagnostics = NativeRenderBackendResourceDiagnostics::from_submissions(&[
        missing_first,
        resolved_second,
        missing_third.clone(),
    ]);

    assert_eq!(diagnostics.frames_with_missing_resources, 2);
    assert_eq!(diagnostics.missing_resource_count, 2);
    assert_eq!(
        diagnostics.last_missing_resources,
        missing_third.missing_resources
    );
}

#[test]
fn resource_policy_rejects_only_submissions_with_missing_resources() {
    let frame = frame_with_background();
    let empty_resources = NativeResourceLedger::new();
    let mut resolved_resources = NativeResourceLedger::new();
    resolved_resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .memory(1, 1),
    );
    let missing = NativeRenderFrameRef {
        revision: 11,
        frame: &frame,
        resources: &empty_resources,
    }
    .submission();
    let resolved = NativeRenderFrameRef {
        revision: 12,
        frame: &frame,
        resources: &resolved_resources,
    }
    .submission();

    let error = NativeRenderBackendResourcePolicy::RejectMissingResources
        .validate_submission(&missing)
        .unwrap_err();

    assert_eq!(
        error.kind,
        crate::renderer::NativeRenderBackendErrorKind::BackendRejected
    );
    assert!(error.message.contains("submission 11"));
    assert!(error.message.contains("images:bg/school.png"));
    assert!(NativeRenderBackendResourcePolicy::RejectMissingResources
        .validate_submission(&resolved)
        .is_ok());
    assert!(NativeRenderBackendResourcePolicy::AllowMissingResources
        .validate_submission(&missing)
        .is_ok());
}

#[test]
fn summarizes_resolved_submission_resource_memory() {
    let frame = frame_with_background();
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:bg/school.png"),
            NativeResourceKind::Texture,
        )
        .owned_by("base")
        .require_package("runtime.ui")
        .memory(512, 4096),
    );
    resources.insert(
        NativeResourceRecord::new(
            ResourceId::from("images:unused.png"),
            NativeResourceKind::Texture,
        )
        .memory(1024, 8192),
    );
    let submission = NativeRenderFrameRef {
        revision: 9,
        frame: &frame,
        resources: &resources,
    }
    .submission();

    assert_eq!(submission.resource_count, 2);
    assert_eq!(submission.missing_resource_count, 0);
    assert!(submission.missing_resources.is_empty());
    assert_eq!(submission.resolved_resource_memory.total.cpu_bytes, 512);
    assert_eq!(submission.resolved_resource_memory.total.gpu_bytes, 4096);
    assert_eq!(
        submission.resolved_resource_memory.by_kind[&NativeResourceKind::Texture].gpu_bytes,
        4096
    );
    assert_eq!(
        submission.resolved_resource_memory.by_owner_package["base"].cpu_bytes,
        512
    );
    assert_eq!(
        submission.resolved_resource_memory.by_required_package["runtime.ui"].gpu_bytes,
        4096
    );
    assert_ne!(submission.resolved_resource_memory.total.cpu_bytes, 1536);
    assert_ne!(submission.resolved_resource_memory.total.gpu_bytes, 12288);
    assert_eq!(submission.passes[0].resolved_resource_count, 1);
    assert_eq!(submission.passes[0].missing_resource_count, 0);
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0]
            .resolved_resource_memory
            .by_owner_package["base"]
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0].resolved_resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .cpu_bytes,
        512
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .total
            .gpu_bytes,
        4096
    );
    assert_eq!(
        submission.passes[0].batches[0]
            .resolved_resource_memory
            .by_required_package["runtime.ui"]
            .cpu_bytes,
        512
    );
}

fn frame_with_background() -> crate::frame::PreparedNativeFrame {
    prepare_native_frame(
        test_layout(),
        &ViewProjection {
            background: Some(BackgroundProjection {
                asset_name: Some("bg/school.png".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
}

fn test_layout() -> crate::stage_layout::ResolvedStageLayout {
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
