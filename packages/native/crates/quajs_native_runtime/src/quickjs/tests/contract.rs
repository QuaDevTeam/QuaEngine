use super::super::*;

#[test]
fn reports_explicit_quickjs_runtime_version() {
    let version = quickjs_runtime_version();

    assert!(!version.trim().is_empty());
    assert_ne!(version, "pending");
}

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
fn serializes_evaluation_success_and_error_responses() {
    let success =
        QuickJsEvaluationResponse::success("runtime.chapter.native-ui:scripts/opening.js");
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
fn serializes_module_export_call_requests_and_responses() {
    let request = QuickJsModuleExportCallRequest {
        module_namespace_id: "quickjs:rquickjs:1".to_string(),
        export_name: "default".to_string(),
        args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
    };
    let success = QuickJsModuleExportCallResponse::success(Some("{\"ok\":true}".to_string()));
    let error = QuickJsModuleExportCallResponse::error(QuickJsEvaluationError {
        code: QuickJsEvaluationErrorCode::MissingExport,
        message: "Missing export.".to_string(),
        asset_name: None,
        detail: None,
    });

    let request_json = serde_json::to_value(request).unwrap();
    let success_json = serde_json::to_value(success).unwrap();
    let error_json = serde_json::to_value(error).unwrap();

    assert_eq!(request_json["moduleNamespaceId"], "quickjs:rquickjs:1");
    assert_eq!(request_json["exportName"], "default");
    assert_eq!(request_json["argsJson"], "[{\"scene\":\"opening\"}]");
    assert_eq!(success_json["ok"], true);
    assert_eq!(success_json["valueJson"], "{\"ok\":true}");
    assert_eq!(error_json["ok"], false);
    assert_eq!(error_json["error"]["code"], "missingExport");
}
