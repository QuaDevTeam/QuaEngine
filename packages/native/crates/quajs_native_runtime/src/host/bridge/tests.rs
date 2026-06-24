use super::*;
use crate::host::{
    InMemoryNativeHostApi, NativeHostApiErrorCode, NativeHostInfoBuilder, NativePlatform,
    NativeProfile,
};
use crate::quickjs::{
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsModuleEvaluator,
    QuickJsRuntimeModuleKind, QuickJsRuntimeModuleRecord, QuickJsSandboxLimits,
};

#[test]
fn serializes_bridge_requests_and_responses_with_ts_field_names() {
    let request = NativeHostApiRequest::ReadAssetBytes(NativeAssetReadRequest {
        url: "images/bg.png".to_string(),
        bundle_name: Some("base".to_string()),
        asset_id: Some("bg".to_string()),
    });
    let response = NativeHostApiResponse::success(NativeHostApiResponsePayload::StorageKeys(vec![
        "profile/save-1".to_string(),
    ]));

    let request_json = serde_json::to_value(request).unwrap();
    let response_json = serde_json::to_value(response).unwrap();

    assert_eq!(request_json["method"], "readAssetBytes");
    assert_eq!(request_json["params"]["bundleName"], "base");
    assert_eq!(request_json["params"]["assetId"], "bg");
    assert_eq!(response_json["ok"], true);
    assert_eq!(response_json["payload"]["type"], "storageKeys");
    assert_eq!(response_json["payload"]["value"][0], "profile/save-1");

    let quickjs_request = NativeHostApiRequest::EvaluateQuickJsModule(quickjs_request_for_asset(
        "scripts/opening.js",
    ));
    let quickjs_json = serde_json::to_value(quickjs_request).unwrap();
    assert_eq!(quickjs_json["method"], "evaluateQuickJsModule");
    assert_eq!(
        quickjs_json["params"]["module"]["assetName"],
        "scripts/opening.js"
    );
}

#[test]
fn dispatches_host_info_assets_storage_and_renderer_intents() {
    let mut host =
        InMemoryNativeHostApi::new(host_info()).with_asset("images/bg.png", vec![1, 2, 3]);

    let host_info = dispatch_native_host_api_request(&mut host, NativeHostApiRequest::GetHostInfo);
    assert!(host_info.ok);
    match host_info.payload.unwrap() {
        NativeHostApiResponsePayload::HostInfo(info) => {
            assert_eq!(info.app.bundle_id, "dev.quajs.fixture")
        }
        _ => panic!("expected host info payload"),
    }

    let asset = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::ReadAssetBytes(NativeAssetReadRequest {
            url: "images/bg.png".to_string(),
            bundle_name: None,
            asset_id: None,
        }),
    );
    assert_eq!(
        asset.payload,
        Some(NativeHostApiResponsePayload::AssetBytes(vec![1, 2, 3]))
    );

    let write = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::WriteStorage(NativeHostApiWriteStorageRequest {
            key: "profile/save-1".to_string(),
            value: vec![9, 8, 7],
        }),
    );
    assert!(write.ok);
    assert!(write.payload.is_none());

    let read = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::ReadStorage(NativeHostApiStorageKeyRequest {
            key: "profile/save-1".to_string(),
        }),
    );
    assert_eq!(
        read.payload,
        Some(NativeHostApiResponsePayload::StorageBytes(Some(vec![
            9, 8, 7
        ])))
    );

    let keys = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::ListStorageKeys(NativeHostApiListStorageKeysRequest {
            prefix: "profile/".to_string(),
        }),
    );
    assert_eq!(
        keys.payload,
        Some(NativeHostApiResponsePayload::StorageKeys(vec![
            "profile/save-1".to_string()
        ]))
    );

    let delete = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::DeleteStorage(NativeHostApiStorageKeyRequest {
            key: "profile/save-1".to_string(),
        }),
    );
    assert!(delete.ok);

    let intent = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::EmitRendererIntent(NativeRendererIntent {
            r#type: "ui/intent".to_string(),
            payload_json: Some("{\"action\":\"close\"}".to_string()),
        }),
    );
    assert!(intent.ok);
    assert_eq!(host.renderer_intents().len(), 1);
}

#[test]
fn dispatches_structured_errors_without_panicking() {
    let mut host = InMemoryNativeHostApi::new(host_info());

    let missing = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::ReadAssetBytes(NativeAssetReadRequest {
            url: "missing.png".to_string(),
            bundle_name: None,
            asset_id: None,
        }),
    );
    assert!(!missing.ok);
    assert_eq!(missing.payload, None);
    assert_eq!(
        missing.error.as_ref().map(|error| error.code),
        Some(NativeHostApiErrorCode::AssetNotFound)
    );
    assert_eq!(
        missing
            .error
            .as_ref()
            .and_then(|error| error.asset_url.clone()),
        Some("missing.png".to_string())
    );

    let hash = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::HashBytes(NativeHostApiHashBytesRequest {
            bytes: vec![1, 2, 3],
            algorithm: "sha256".to_string(),
        }),
    );
    assert!(!hash.ok);
    assert_eq!(
        hash.error.as_ref().map(|error| error.code),
        Some(NativeHostApiErrorCode::UnsupportedOperation)
    );
}

#[test]
fn dispatches_quickjs_evaluation_with_default_unsupported_runtime() {
    let mut host = InMemoryNativeHostApi::new(host_info());

    let response = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::EvaluateQuickJsModule(quickjs_request_for_asset(
            "scripts/opening.js",
        )),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsEvaluation(evaluation) => {
            assert!(!evaluation.ok);
            assert_eq!(
                evaluation.error.unwrap().code,
                QuickJsEvaluationErrorCode::UnsupportedRuntime
            );
        }
        _ => panic!("expected quickjs evaluation payload"),
    }
}

#[test]
fn dispatches_quickjs_evaluation_through_injected_evaluator() {
    struct TestQuickJsEvaluator;

    impl QuickJsModuleEvaluator for TestQuickJsEvaluator {
        fn evaluate_module(
            &mut self,
            request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            if request.module.asset_name == "scripts/fail.js" {
                return Err(QuickJsEvaluationError {
                    code: QuickJsEvaluationErrorCode::EvaluationFailed,
                    message: "test evaluation failed".to_string(),
                    asset_name: Some(request.module.asset_name.clone()),
                    detail: None,
                });
            }
            Ok(QuickJsEvaluationResponse::success(format!(
                "{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut quickjs = TestQuickJsEvaluator;
    let response = dispatch_native_host_api_request_with_quickjs(
        &mut host,
        &mut quickjs,
        NativeHostApiRequest::EvaluateQuickJsModule(quickjs_request_for_asset(
            "scripts/opening.js",
        )),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsEvaluation(evaluation) => {
            assert!(evaluation.ok);
            assert_eq!(
                evaluation.module_namespace_id,
                Some("runtime.chapter.native-ui:scripts/opening.js".to_string())
            );
        }
        _ => panic!("expected quickjs evaluation payload"),
    }
}

fn host_info() -> NativeHostInfo {
    NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
        .app_version("1.0.0")
        .build_number("100")
        .profile(NativeProfile::Debug)
        .platform(NativePlatform::MacOs)
        .arch("arm64")
        .build()
}

fn quickjs_request_for_asset(asset_name: &str) -> QuickJsEvaluationRequest {
    QuickJsEvaluationRequest {
        module: QuickJsRuntimeModuleRecord {
            asset_name: asset_name.to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: "export default function opening() {}".to_string(),
            bytes: vec![1, 2, 3],
        },
        limits: QuickJsSandboxLimits::default(),
    }
}
