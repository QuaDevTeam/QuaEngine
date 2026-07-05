use crate::host::bridge::{
    dispatch_native_host_api_request, dispatch_native_host_api_request_with_quickjs,
    dispatch_native_host_api_request_with_quickjs_registry, NativeHostApiRequest,
    NativeHostApiResponsePayload, NativeQuickJsReleaseNamespaceRequest,
    NativeQuickJsReleasePackageRequest,
};
use crate::host::InMemoryNativeHostApi;
use crate::quickjs::{
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsModuleEvaluator,
    QuickJsModuleNamespaceRegistry, QuickJsModuleNamespaceSummary,
};

use super::helpers::{host_info, quickjs_request_for_asset};

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

#[test]
fn dispatches_quickjs_namespace_summary_and_release_with_registry() {
    struct TestQuickJsEvaluator;

    impl QuickJsModuleEvaluator for TestQuickJsEvaluator {
        fn evaluate_module(
            &mut self,
            request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            Ok(QuickJsEvaluationResponse::success(format!(
                "quickjs:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut quickjs = TestQuickJsEvaluator;
    let mut registry = QuickJsModuleNamespaceRegistry::new();

    for asset_name in ["scripts/opening.js", "scripts/menu.js"] {
        let response = dispatch_native_host_api_request_with_quickjs_registry(
            &mut host,
            &mut quickjs,
            &mut registry,
            NativeHostApiRequest::EvaluateQuickJsModule(quickjs_request_for_asset(asset_name)),
        );
        assert!(response.ok);
    }

    let summary = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::GetQuickJsNamespaceSummary,
    );
    assert_eq!(
        summary.payload,
        Some(NativeHostApiResponsePayload::QuickJsNamespaceSummary(
            QuickJsModuleNamespaceSummary {
                namespace_count: 2,
                package_count: 1,
                module_bytes: 6,
                code_bytes: 72,
                total_bytes: 78,
            }
        ))
    );

    let package_summary = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::GetQuickJsPackageNamespaceSummary(
            NativeQuickJsReleasePackageRequest {
                package_id: "runtime.chapter.native-ui".to_string(),
            },
        ),
    );
    assert_eq!(
        package_summary.payload,
        Some(NativeHostApiResponsePayload::QuickJsNamespaceSummary(
            QuickJsModuleNamespaceSummary {
                namespace_count: 2,
                package_count: 1,
                module_bytes: 6,
                code_bytes: 72,
                total_bytes: 78,
            }
        ))
    );

    let release_one = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::ReleaseQuickJsModuleNamespace(NativeQuickJsReleaseNamespaceRequest {
            module_namespace_id: "quickjs:runtime.chapter.native-ui:scripts/opening.js".to_string(),
        }),
    );
    match release_one.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsNamespace(Some(record)) => {
            assert_eq!(record.asset_name, "scripts/opening.js");
            assert_eq!(record.package_id, "runtime.chapter.native-ui");
        }
        payload => panic!("expected quickjs namespace payload, got {payload:?}"),
    }

    let release_missing = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::ReleaseQuickJsModuleNamespace(NativeQuickJsReleaseNamespaceRequest {
            module_namespace_id: "quickjs:missing".to_string(),
        }),
    );
    assert_eq!(
        release_missing.payload,
        Some(NativeHostApiResponsePayload::QuickJsNamespace(None))
    );

    let release_package = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::ReleaseQuickJsPackageNamespaces(NativeQuickJsReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    );
    match release_package.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsNamespaces(records) => {
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].asset_name, "scripts/menu.js");
        }
        payload => panic!("expected quickjs namespaces payload, got {payload:?}"),
    }

    let empty_summary = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::GetQuickJsNamespaceSummary,
    );
    assert_eq!(
        empty_summary.payload,
        Some(NativeHostApiResponsePayload::QuickJsNamespaceSummary(
            QuickJsModuleNamespaceSummary::default()
        ))
    );
}
