use super::*;
use crate::projection::background::BackgroundProjection;
use crate::projection::view::ViewProjection;
use crate::resources::{
    NativeResourceKind, NativeResourceLedger, NativeResourceRecord, ResourceId,
};

#[test]
fn summarizes_backend_resource_diagnostics_from_submissions() {
    let frame = frame_with_background();
    let runtime_frame = prepare_native_frame(
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
        frame: &runtime_frame,
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
        diagnostics.missing_resources_by_kind[&NativeResourceKind::Texture],
        2
    );
    assert_eq!(
        diagnostics.last_missing_resources,
        missing_third.missing_resources
    );
    assert_eq!(
        diagnostics.missing_resources_by_owner_package["runtime.background"],
        1
    );
    assert_eq!(diagnostics.missing_resources_by_required_package["base"], 1);
    assert_eq!(
        diagnostics.missing_resources_by_owner_package.get("base"),
        None
    );
}
