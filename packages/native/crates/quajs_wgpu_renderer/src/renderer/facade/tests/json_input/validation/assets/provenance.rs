use super::*;

#[test]
fn json_frame_provenance_validation_rejects_unsafe_package_ids() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let background = renderer
        .prepare_frame_json_str(json_frame_with_remote_provenance_package_input())
        .unwrap_err();
    match background {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.background.provenance.contentPackageId"
            );
            assert_eq!(validation.asset_name, "https://example.invalid/runtime.ui");
            assert!(validation.reason.contains("URLs"));
        }
        other => panic!("expected background provenance validation error, got {other:?}"),
    }

    let ui = renderer
        .prepare_frame_json_str(json_frame_with_traversal_required_package_input())
        .unwrap_err();
    match ui {
        NativeRendererJsonFrameError::Validation(validation) => {
            assert_eq!(
                validation.path,
                "view.ui.overlays[0].surface.root.provenance.requiredRuntimePackages[0]"
            );
            assert_eq!(validation.asset_name, "../base");
            assert!(validation.reason.contains("traversal"));
        }
        other => panic!("expected UI provenance validation error, got {other:?}"),
    }

    assert_eq!(renderer.state().revision(), 0);
    assert!(renderer.state().frame().is_none());
}
