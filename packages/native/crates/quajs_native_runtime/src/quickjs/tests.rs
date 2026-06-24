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

#[test]
fn evaluator_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl QuickJsModuleEvaluator for CountingEvaluator {
        fn evaluate_module(
            &mut self,
            _request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            self.calls += 1;
            Ok(QuickJsEvaluationResponse::success("unused"))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response = evaluate_quickjs_module(
        &mut evaluator,
        &request_for_asset("../opening.js", vec![1]),
    );

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        QuickJsEvaluationErrorCode::ForbiddenAssetName
    );
}

#[test]
fn unsupported_evaluator_returns_structured_runtime_error() {
    let mut evaluator = UnsupportedQuickJsModuleEvaluator;
    let response = evaluate_quickjs_module(
        &mut evaluator,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(!response.ok);
    let error = response.error.unwrap();
    assert_eq!(error.code, QuickJsEvaluationErrorCode::UnsupportedRuntime);
    assert_eq!(error.asset_name, Some("scripts/opening.js".to_string()));
    assert_eq!(
        error.detail,
        Some("No QuickJS evaluator backend has been installed.".to_string())
    );
}

#[test]
fn evaluator_helper_returns_backend_success_response() {
    struct NamespaceEvaluator;

    impl QuickJsModuleEvaluator for NamespaceEvaluator {
        fn evaluate_module(
            &mut self,
            request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            Ok(QuickJsEvaluationResponse::success(format!(
                "{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut evaluator = NamespaceEvaluator;
    let response = evaluate_quickjs_module(
        &mut evaluator,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(response.ok);
    assert_eq!(
        response.module_namespace_id,
        Some("runtime.chapter.native-ui:scripts/opening.js".to_string())
    );
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
