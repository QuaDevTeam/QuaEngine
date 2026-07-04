use super::*;
use crate::projection::common::FontFamilyProjection;
use crate::projection::dialogue::{DialogueProjection, RichTextStyle};
use crate::projection::view::ViewProjection;
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

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

    let font_only_frame = prepare_native_frame(
        test_layout(),
        &ViewProjection {
            dialogue: Some(DialogueProjection {
                speaker: Some("Yuki".into()),
                speaker_style: RichTextStyle {
                    font_family: Some(FontFamilyProjection::new(["Missing Serif"])),
                    ..Default::default()
                },
                ..DialogueProjection::say("Hello")
            }),
            ..Default::default()
        },
    );
    let font_only = NativeRenderFrameRef {
        revision: 13,
        frame: &font_only_frame,
        resources: &empty_resources,
    }
    .submission();
    assert_eq!(font_only.missing_resource_count, 0);
    assert!(NativeRenderBackendResourcePolicy::RejectMissingResources
        .validate_submission(&font_only)
        .is_ok());
}
