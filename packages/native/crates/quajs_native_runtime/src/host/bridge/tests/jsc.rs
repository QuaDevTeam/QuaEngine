use crate::host::bridge::{
    dispatch_native_host_api_request, dispatch_native_host_api_request_with_jsc,
    dispatch_native_host_api_request_with_jsc_registry, NativeHostApiRequest,
    NativeHostApiResponsePayload, NativeJscReleaseNamespaceRequest, NativeJscReleasePackageRequest,
};
use crate::host::InMemoryNativeHostApi;
use crate::jsc::{
    JscEvaluationError, JscEvaluationErrorCode, JscEvaluationRequest, JscEvaluationResponse,
    JscEvaluationResult, JscGameStepCommand, JscGameStepDescriptor, JscGameStepFactoryCallRequest,
    JscGameStepFactoryCallResponse, JscGameStepFactoryCallResult, JscGameStepResumeRequest,
    JscGameStepRunRequest, JscGameStepRunResponse, JscGameStepRunResult, JscModuleEvaluator,
    JscModuleExportCallRequest, JscModuleExportCallResponse, JscModuleExportCallResult,
    JscModuleNamespaceRegistry, JscModuleNamespaceSummary, JscPipelineListenerDispatchRequest,
    JscPipelineListenerDispatchResponse, JscPipelineListenerDispatchResult,
    JscPipelineSubscriptionChange, JscPipelineSubscriptionOperation,
};

use super::helpers::{host_info, jsc_request_for_asset};

#[test]
fn dispatches_jsc_evaluation_with_default_unsupported_runtime() {
    let mut host = InMemoryNativeHostApi::new(host_info());

    let response = dispatch_native_host_api_request(
        &mut host,
        NativeHostApiRequest::EvaluateJscModule(jsc_request_for_asset("scripts/opening.js")),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::JscEvaluation(evaluation) => {
            assert!(!evaluation.ok);
            assert_eq!(
                evaluation.error.unwrap().code,
                JscEvaluationErrorCode::UnsupportedRuntime
            );
        }
        _ => panic!("expected jsc evaluation payload"),
    }
}

#[test]
fn dispatches_jsc_evaluation_through_injected_evaluator() {
    struct TestJscEvaluator;

    impl JscModuleEvaluator for TestJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            if request.module.asset_name == "scripts/fail.js" {
                return Err(JscEvaluationError {
                    code: JscEvaluationErrorCode::EvaluationFailed,
                    message: "test evaluation failed".to_string(),
                    asset_name: Some(request.module.asset_name.clone()),
                    detail: None,
                });
            }
            Ok(JscEvaluationResponse::success(format!(
                "{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TestJscEvaluator;
    let response = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::EvaluateJscModule(jsc_request_for_asset("scripts/opening.js")),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::JscEvaluation(evaluation) => {
            assert!(evaluation.ok);
            assert_eq!(
                evaluation.module_namespace_id,
                Some("runtime.chapter.native-ui:scripts/opening.js".to_string())
            );
        }
        _ => panic!("expected jsc evaluation payload"),
    }
}

#[test]
fn dispatches_jsc_export_calls_through_injected_evaluator() {
    struct TestJscEvaluator;

    impl JscModuleEvaluator for TestJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "jsc:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }

        fn call_module_export(
            &mut self,
            request: &JscModuleExportCallRequest,
        ) -> JscModuleExportCallResult {
            Ok(JscModuleExportCallResponse::success(Some(format!(
                "{{\"namespace\":\"{}\",\"exportName\":\"{}\",\"args\":{}}}",
                request.module_namespace_id,
                request.export_name,
                request.args_json.as_deref().unwrap_or("[]")
            ))))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TestJscEvaluator;
    let response = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::CallJscModuleExport(JscModuleExportCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
        }),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::JscExportCall(call) => {
            assert!(call.ok);
            assert_eq!(
                call.value_json,
                Some(
                    "{\"namespace\":\"jsc:1\",\"exportName\":\"default\",\"args\":[{\"scene\":\"opening\"}]}".to_string()
                )
            );
        }
        payload => panic!("expected jsc export call payload, got {payload:?}"),
    }
}

#[test]
fn dispatches_jsc_game_step_calls_through_injected_evaluator() {
    #[derive(Default)]
    struct TestJscEvaluator {
        run_calls: usize,
    }

    impl JscModuleEvaluator for TestJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "jsc:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }

        fn call_game_step_factory(
            &mut self,
            request: &JscGameStepFactoryCallRequest,
        ) -> JscGameStepFactoryCallResult {
            Ok(JscGameStepFactoryCallResponse::success(vec![
                JscGameStepDescriptor {
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

        fn call_game_step_run(&mut self, _request: &JscGameStepRunRequest) -> JscGameStepRunResult {
            self.run_calls += 1;
            Ok(JscGameStepRunResponse::success(vec![JscGameStepCommand {
                target: "engine".to_string(),
                method: "clearChoices".to_string(),
                args_json: Some("[]".to_string()),
            }]))
        }

        fn resume_game_step_run(
            &mut self,
            _request: &JscGameStepResumeRequest,
        ) -> JscGameStepRunResult {
            self.run_calls += 1;
            Ok(JscGameStepRunResponse::success(vec![JscGameStepCommand {
                target: "engine".to_string(),
                method: "clearChoices".to_string(),
                args_json: Some("[]".to_string()),
            }]))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TestJscEvaluator::default();
    let factory = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::CallJscGameStepFactory(JscGameStepFactoryCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            scope_json: Some("{\"route\":\"main\"}".to_string()),
        }),
    );

    match factory.payload.unwrap() {
        NativeHostApiResponsePayload::JscGameStepFactoryCall(call) => {
            assert!(call.ok);
            let steps = call.steps.unwrap();
            assert_eq!(steps[0].uuid, "intro.1");
            assert_eq!(steps[0].run_handle_id, "jsc:1:run:1");
            assert_eq!(
                steps[0].metadata_json,
                Some("{\"exportName\":\"default\",\"scope\":{\"route\":\"main\"}}".to_string())
            );
        }
        payload => panic!("expected jsc GameStep factory payload, got {payload:?}"),
    }

    let run = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::CallJscGameStepRun(JscGameStepRunRequest {
            run_handle_id: "jsc:1:run:1".to_string(),
            ctx_json: Some("{\"stepId\":\"intro.1\"}".to_string()),
        }),
    );

    match run.payload.unwrap() {
        NativeHostApiResponsePayload::JscGameStepRun(call) => {
            assert!(call.ok);
            assert_eq!(call.commands.unwrap()[0].method, "clearChoices");
        }
        payload => panic!("expected jsc GameStep run payload, got {payload:?}"),
    }

    let resume = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::ResumeJscGameStepRun(JscGameStepResumeRequest {
            resume_handle_id: "jsc:resume:1".to_string(),
            payload_json: Some("{\"choiceId\":\"go\"}".to_string()),
        }),
    );

    match resume.payload.unwrap() {
        NativeHostApiResponsePayload::JscGameStepRun(call) => {
            assert!(call.ok);
            assert_eq!(call.commands.unwrap()[0].method, "clearChoices");
        }
        payload => panic!("expected jsc GameStep resume payload, got {payload:?}"),
    }
    assert_eq!(jsc.run_calls, 2);
}

#[test]
fn dispatches_jsc_pipeline_listener_calls_through_injected_evaluator() {
    struct TestJscEvaluator;

    impl JscModuleEvaluator for TestJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "jsc:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }

        fn dispatch_pipeline_listener(
            &mut self,
            request: &JscPipelineListenerDispatchRequest,
        ) -> JscPipelineListenerDispatchResult {
            Ok(JscPipelineListenerDispatchResponse::success(
                vec![JscGameStepCommand {
                    target: "engine".to_string(),
                    method: "showDialogue".to_string(),
                    args_json: Some(format!("[{{\"text\":{}}}]", request.context_json)),
                }],
                vec![JscPipelineSubscriptionChange {
                    op: JscPipelineSubscriptionOperation::Unsubscribe,
                    subscription_id: request.subscription_id.clone(),
                    module_namespace_id: "jsc:1".to_string(),
                    event: "plugin/custom_event".to_string(),
                }],
            ))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TestJscEvaluator;
    let response = dispatch_native_host_api_request_with_jsc(
        &mut host,
        &mut jsc,
        NativeHostApiRequest::DispatchJscPipelineListener(JscPipelineListenerDispatchRequest {
            subscription_id: "jsc:1:pipeline:1".to_string(),
            context_json: "{\"event\":{\"type\":\"plugin/custom_event\"}}".to_string(),
        }),
    );

    assert!(response.ok);
    match response.payload.unwrap() {
        NativeHostApiResponsePayload::JscPipelineListenerDispatch(call) => {
            assert!(call.ok);
            assert_eq!(call.commands.unwrap()[0].method, "showDialogue");
            assert_eq!(
                call.pipeline_subscriptions.unwrap()[0].op,
                JscPipelineSubscriptionOperation::Unsubscribe
            );
        }
        payload => panic!("expected jsc pipeline listener dispatch payload, got {payload:?}"),
    }
}

#[test]
fn dispatches_jsc_namespace_summary_and_release_with_registry() {
    struct TestJscEvaluator;

    impl JscModuleEvaluator for TestJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "jsc:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TestJscEvaluator;
    let mut registry = JscModuleNamespaceRegistry::new();

    for asset_name in ["scripts/opening.js", "scripts/menu.js"] {
        let response = dispatch_native_host_api_request_with_jsc_registry(
            &mut host,
            &mut jsc,
            &mut registry,
            NativeHostApiRequest::EvaluateJscModule(jsc_request_for_asset(asset_name)),
        );
        assert!(response.ok);
    }

    let summary = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::GetJscNamespaceSummary,
    );
    assert_eq!(
        summary.payload,
        Some(NativeHostApiResponsePayload::JscNamespaceSummary(
            JscModuleNamespaceSummary {
                namespace_count: 2,
                package_count: 1,
                module_bytes: 6,
                code_bytes: 72,
                total_bytes: 78,
            }
        ))
    );

    let package_summary = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::GetJscPackageNamespaceSummary(NativeJscReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    );
    assert_eq!(
        package_summary.payload,
        Some(NativeHostApiResponsePayload::JscNamespaceSummary(
            JscModuleNamespaceSummary {
                namespace_count: 2,
                package_count: 1,
                module_bytes: 6,
                code_bytes: 72,
                total_bytes: 78,
            }
        ))
    );

    let release_one = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::ReleaseJscModuleNamespace(NativeJscReleaseNamespaceRequest {
            module_namespace_id: "jsc:runtime.chapter.native-ui:scripts/opening.js".to_string(),
        }),
    );
    match release_one.payload.unwrap() {
        NativeHostApiResponsePayload::JscNamespace(Some(record)) => {
            assert_eq!(record.asset_name, "scripts/opening.js");
            assert_eq!(record.package_id, "runtime.chapter.native-ui");
        }
        payload => panic!("expected jsc namespace payload, got {payload:?}"),
    }

    let release_missing = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::ReleaseJscModuleNamespace(NativeJscReleaseNamespaceRequest {
            module_namespace_id: "jsc:missing".to_string(),
        }),
    );
    assert_eq!(
        release_missing.payload,
        Some(NativeHostApiResponsePayload::JscNamespace(None))
    );

    let release_package = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::ReleaseJscPackageNamespaces(NativeJscReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    );
    match release_package.payload.unwrap() {
        NativeHostApiResponsePayload::JscNamespaces(records) => {
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].asset_name, "scripts/menu.js");
        }
        payload => panic!("expected jsc namespaces payload, got {payload:?}"),
    }

    let empty_summary = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::GetJscNamespaceSummary,
    );
    assert_eq!(
        empty_summary.payload,
        Some(NativeHostApiResponsePayload::JscNamespaceSummary(
            JscModuleNamespaceSummary::default()
        ))
    );
}

#[test]
fn dispatches_jsc_release_hooks_to_injected_evaluator() {
    #[derive(Default)]
    struct TrackingJscEvaluator {
        released: Vec<String>,
    }

    impl JscModuleEvaluator for TrackingJscEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "jsc:{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }

        fn release_module_namespace(&mut self, module_namespace_id: &str) {
            self.released.push(module_namespace_id.to_string());
        }
    }

    let mut host = InMemoryNativeHostApi::new(host_info());
    let mut jsc = TrackingJscEvaluator::default();
    let mut registry = JscModuleNamespaceRegistry::new();

    for asset_name in ["scripts/opening.js", "scripts/menu.js"] {
        let response = dispatch_native_host_api_request_with_jsc_registry(
            &mut host,
            &mut jsc,
            &mut registry,
            NativeHostApiRequest::EvaluateJscModule(jsc_request_for_asset(asset_name)),
        );
        assert!(response.ok);
    }

    let response = dispatch_native_host_api_request_with_jsc_registry(
        &mut host,
        &mut jsc,
        &mut registry,
        NativeHostApiRequest::ReleaseJscPackageNamespaces(NativeJscReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    );

    assert!(response.ok);
    assert_eq!(
        jsc.released,
        vec![
            "jsc:runtime.chapter.native-ui:scripts/menu.js",
            "jsc:runtime.chapter.native-ui:scripts/opening.js",
        ]
    );
}
