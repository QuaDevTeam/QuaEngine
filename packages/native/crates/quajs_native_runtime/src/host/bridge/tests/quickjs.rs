use crate::host::bridge::{
    dispatch_native_host_api_request, dispatch_native_host_api_request_with_quickjs,
    dispatch_native_host_api_request_with_quickjs_registry, NativeHostApiRequest,
    NativeHostApiResponsePayload, NativeQuickJsReleaseNamespaceRequest,
    NativeQuickJsReleasePackageRequest,
};
use crate::host::InMemoryNativeHostApi;
use crate::quickjs::{
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsGameStepCommand,
    QuickJsGameStepDescriptor, QuickJsGameStepFactoryCallRequest,
    QuickJsGameStepFactoryCallResponse, QuickJsGameStepFactoryCallResult,
    QuickJsGameStepRunRequest, QuickJsGameStepRunResponse, QuickJsGameStepRunResult,
    QuickJsModuleEvaluator, QuickJsModuleExportCallRequest, QuickJsModuleExportCallResponse,
    QuickJsModuleExportCallResult, QuickJsModuleNamespaceRegistry, QuickJsModuleNamespaceSummary,
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
fn dispatches_quickjs_export_calls_through_injected_evaluator() {
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

        fn call_module_export(
            &mut self,
            request: &QuickJsModuleExportCallRequest,
        ) -> QuickJsModuleExportCallResult {
            Ok(QuickJsModuleExportCallResponse::success(Some(format!(
                "{{\"namespace\":\"{}\",\"exportName\":\"{}\",\"args\":{}}}",
                request.module_namespace_id,
                request.export_name,
                request.args_json.as_deref().unwrap_or("[]")
            ))))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut quickjs = TestQuickJsEvaluator;
    let response = dispatch_native_host_api_request_with_quickjs(
        &mut host,
        &mut quickjs,
        NativeHostApiRequest::CallQuickJsModuleExport(QuickJsModuleExportCallRequest {
            module_namespace_id: "quickjs:rquickjs:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
        }),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsExportCall(call) => {
            assert!(call.ok);
            assert_eq!(
                call.value_json,
                Some(
                    "{\"namespace\":\"quickjs:rquickjs:1\",\"exportName\":\"default\",\"args\":[{\"scene\":\"opening\"}]}".to_string()
                )
            );
        }
        payload => panic!("expected quickjs export call payload, got {payload:?}"),
    }
}

#[test]
fn dispatches_quickjs_game_step_calls_through_injected_evaluator() {
    #[derive(Default)]
    struct TestQuickJsEvaluator {
        run_calls: usize,
    }

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

        fn call_game_step_factory(
            &mut self,
            request: &QuickJsGameStepFactoryCallRequest,
        ) -> QuickJsGameStepFactoryCallResult {
            Ok(QuickJsGameStepFactoryCallResponse::success(vec![
                QuickJsGameStepDescriptor {
                    uuid: "intro.1".to_string(),
                    run_handle_id: format!("{}:run:1", request.module_namespace_id),
                    metadata_json: Some(format!(
                        "{{\"exportName\":\"{}\",\"scope\":{}}}",
                        request.export_name,
                        request.scope_json.as_deref().unwrap_or("{}")
                    )),
                },
            ]))
        }

        fn call_game_step_run(
            &mut self,
            _request: &QuickJsGameStepRunRequest,
        ) -> QuickJsGameStepRunResult {
            self.run_calls += 1;
            Ok(QuickJsGameStepRunResponse::success(vec![
                QuickJsGameStepCommand {
                    target: "engine".to_string(),
                    method: "clearChoices".to_string(),
                    args_json: Some("[]".to_string()),
                },
            ]))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut quickjs = TestQuickJsEvaluator::default();
    let factory = dispatch_native_host_api_request_with_quickjs(
        &mut host,
        &mut quickjs,
        NativeHostApiRequest::CallQuickJsGameStepFactory(QuickJsGameStepFactoryCallRequest {
            module_namespace_id: "quickjs:rquickjs:1".to_string(),
            export_name: "default".to_string(),
            scope_json: Some("{\"route\":\"main\"}".to_string()),
        }),
    );

    match factory.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsGameStepFactoryCall(call) => {
            assert!(call.ok);
            let steps = call.steps.unwrap();
            assert_eq!(steps[0].uuid, "intro.1");
            assert_eq!(steps[0].run_handle_id, "quickjs:rquickjs:1:run:1");
            assert_eq!(
                steps[0].metadata_json,
                Some("{\"exportName\":\"default\",\"scope\":{\"route\":\"main\"}}".to_string())
            );
        }
        payload => panic!("expected quickjs GameStep factory payload, got {payload:?}"),
    }

    let run = dispatch_native_host_api_request_with_quickjs(
        &mut host,
        &mut quickjs,
        NativeHostApiRequest::CallQuickJsGameStepRun(QuickJsGameStepRunRequest {
            run_handle_id: "quickjs:rquickjs:1:run:1".to_string(),
            ctx_json: Some("{\"stepId\":\"intro.1\"}".to_string()),
        }),
    );

    match run.payload.unwrap() {
        NativeHostApiResponsePayload::QuickJsGameStepRun(call) => {
            assert!(call.ok);
            assert_eq!(call.commands.unwrap()[0].method, "clearChoices");
        }
        payload => panic!("expected quickjs GameStep run payload, got {payload:?}"),
    }
    assert_eq!(quickjs.run_calls, 1);
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

#[test]
fn dispatches_quickjs_release_hooks_to_injected_evaluator() {
    #[derive(Default)]
    struct TrackingQuickJsEvaluator {
        released: Vec<String>,
    }

    impl QuickJsModuleEvaluator for TrackingQuickJsEvaluator {
        fn evaluate_module(
            &mut self,
            request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            Ok(QuickJsEvaluationResponse::success(format!(
                "quickjs:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }

        fn release_module_namespace(&mut self, module_namespace_id: &str) {
            self.released.push(module_namespace_id.to_string());
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut quickjs = TrackingQuickJsEvaluator::default();
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

    let response = dispatch_native_host_api_request_with_quickjs_registry(
        &mut host,
        &mut quickjs,
        &mut registry,
        NativeHostApiRequest::ReleaseQuickJsPackageNamespaces(NativeQuickJsReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    );

    assert!(response.ok);
    assert_eq!(
        quickjs.released,
        vec![
            "quickjs:runtime.chapter.native-ui:scripts/menu.js",
            "quickjs:runtime.chapter.native-ui:scripts/opening.js",
        ]
    );
}
