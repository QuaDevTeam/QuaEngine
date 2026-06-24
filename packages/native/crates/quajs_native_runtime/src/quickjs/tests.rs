use super::*;

#[test]
fn serializes_quickjs_evaluation_request_with_ts_field_names() {
    let request = QuickJsEvaluationRequest {
        module: QuickJsRuntimeModuleRecord {
            asset_name: "scripts/opening.js".to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: "export default function opening() {}".to_string(),
            bytes: vec![1, 2, 3],
        },
        limits: QuickJsSandboxLimits::default(),
    };

    let json = serde_json::to_value(request).unwrap();

    assert_eq!(json["module"]["assetName"], "scripts/opening.js");
    assert_eq!(json["module"]["bundleName"], "runtime.chapter.native-ui");
    assert_eq!(json["module"]["packageId"], "runtime.chapter.native-ui");
    assert_eq!(json["module"]["kind"], "script");
    assert_eq!(json["limits"]["maxHeapBytes"], 64 * 1024 * 1024);
    assert_eq!(json["limits"]["maxModuleBytes"], 4 * 1024 * 1024);
}

#[test]
fn accepts_package_relative_runtime_module_assets_under_limits() {
    let request = request_for_asset("scripts/opening.js", vec![1, 2, 3]);

    assert_eq!(validate_quickjs_evaluation_request(&request), Ok(()));
}

#[test]
fn rejects_absolute_uri_parent_and_oversized_runtime_module_assets() {
    for asset_name in [
        "",
        "/tmp/opening.js",
        "\\tmp\\opening.js",
        "../opening.js",
        "scripts/../opening.js",
        "https://example.invalid/opening.js",
        "file:///tmp/opening.js",
    ] {
        let request = request_for_asset(asset_name, vec![1]);
        let error = validate_quickjs_evaluation_request(&request).unwrap_err();
        assert!(matches!(
            error.code,
            QuickJsEvaluationErrorCode::MissingAssetName
                | QuickJsEvaluationErrorCode::ForbiddenAssetName
        ));
    }

    let mut request = request_for_asset("scripts/large.js", vec![0; 4]);
    request.limits.max_module_bytes = 3;
    let error = validate_quickjs_evaluation_request(&request).unwrap_err();
    assert_eq!(error.code, QuickJsEvaluationErrorCode::ModuleTooLarge);
    assert_eq!(error.asset_name, Some("scripts/large.js".to_string()));
}

#[test]
fn serializes_evaluation_success_and_error_responses() {
    let success = QuickJsEvaluationResponse::success("runtime.chapter.native-ui:scripts/opening.js");
    let error = QuickJsEvaluationResponse::error(QuickJsEvaluationError {
        code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
        message: "QuickJS host is not initialized.".to_string(),
        asset_name: Some("scripts/opening.js".to_string()),
        detail: None,
    });

    let success_json = serde_json::to_value(success).unwrap();
    let error_json = serde_json::to_value(error).unwrap();

    assert_eq!(success_json["ok"], true);
    assert_eq!(
        success_json["moduleNamespaceId"],
        "runtime.chapter.native-ui:scripts/opening.js"
    );
    assert_eq!(error_json["ok"], false);
    assert_eq!(error_json["error"]["code"], "unsupportedRuntime");
    assert_eq!(error_json["error"]["assetName"], "scripts/opening.js");
}

fn request_for_asset(asset_name: &str, bytes: Vec<u8>) -> QuickJsEvaluationRequest {
    QuickJsEvaluationRequest {
        module: QuickJsRuntimeModuleRecord {
            asset_name: asset_name.to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: String::new(),
            bytes,
        },
        limits: QuickJsSandboxLimits::default(),
    }
}
