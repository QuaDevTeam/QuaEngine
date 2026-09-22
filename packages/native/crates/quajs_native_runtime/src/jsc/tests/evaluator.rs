use super::super::*;
use super::support::request_for_asset;

#[test]
fn evaluator_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl JscModuleEvaluator for CountingEvaluator {
        fn evaluate_module(&mut self, _request: &JscEvaluationRequest) -> JscEvaluationResult {
            self.calls += 1;
            Ok(JscEvaluationResponse::success("unused"))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response =
        evaluate_jsc_module(&mut evaluator, &request_for_asset("../opening.js", vec![1]));

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        JscEvaluationErrorCode::ForbiddenAssetName
    );
}

#[test]
fn unsupported_evaluator_returns_structured_runtime_error() {
    let mut evaluator = UnsupportedJscModuleEvaluator;
    let response = evaluate_jsc_module(
        &mut evaluator,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(!response.ok);
    let error = response.error.unwrap();
    assert_eq!(error.code, JscEvaluationErrorCode::UnsupportedRuntime);
    assert_eq!(error.asset_name, Some("scripts/opening.js".to_string()));
    assert_eq!(
        error.detail,
        Some("No JavaScriptCore evaluator backend has been installed.".to_string())
    );
}

#[test]
fn export_call_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl JscModuleEvaluator for CountingEvaluator {
        fn evaluate_module(&mut self, _request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success("unused"))
        }

        fn call_module_export(
            &mut self,
            _request: &JscModuleExportCallRequest,
        ) -> JscModuleExportCallResult {
            self.calls += 1;
            Ok(JscModuleExportCallResponse::success(Some(
                "null".to_string(),
            )))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response = call_jsc_module_export(
        &mut evaluator,
        &JscModuleExportCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("{\"not\":\"array\"}".to_string()),
        },
    );

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        JscEvaluationErrorCode::InvalidArguments
    );
}

#[test]
fn unsupported_evaluator_returns_structured_export_call_error() {
    let mut evaluator = UnsupportedJscModuleEvaluator;
    let response = call_jsc_module_export(
        &mut evaluator,
        &JscModuleExportCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            args_json: None,
        },
    );

    assert!(!response.ok);
    let error = response.error.unwrap();
    assert_eq!(error.code, JscEvaluationErrorCode::UnsupportedRuntime);
    assert_eq!(
        error.detail,
        Some(
            "No JavaScriptCore evaluator backend has been installed for namespace \"jsc:1\"."
                .to_string()
        )
    );
}

#[test]
fn game_step_factory_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl JscModuleEvaluator for CountingEvaluator {
        fn evaluate_module(&mut self, _request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success("unused"))
        }

        fn call_game_step_factory(
            &mut self,
            _request: &JscGameStepFactoryCallRequest,
        ) -> JscGameStepFactoryCallResult {
            self.calls += 1;
            Ok(JscGameStepFactoryCallResponse::success(Vec::new()))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response = call_jsc_game_step_factory(
        &mut evaluator,
        &JscGameStepFactoryCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            scope_json: Some("[]".to_string()),
        },
    );

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        JscEvaluationErrorCode::InvalidScope
    );
}

#[test]
fn game_step_run_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl JscModuleEvaluator for CountingEvaluator {
        fn evaluate_module(&mut self, _request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success("unused"))
        }

        fn call_game_step_run(&mut self, _request: &JscGameStepRunRequest) -> JscGameStepRunResult {
            self.calls += 1;
            Ok(JscGameStepRunResponse::success(Vec::new()))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response = call_jsc_game_step_run(
        &mut evaluator,
        &JscGameStepRunRequest {
            run_handle_id: "jsc:step:1".to_string(),
            ctx_json: Some("null".to_string()),
        },
    );

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        JscEvaluationErrorCode::InvalidStepContext
    );
}

#[test]
fn unsupported_evaluator_returns_structured_game_step_errors() {
    let mut evaluator = UnsupportedJscModuleEvaluator;
    let factory = call_jsc_game_step_factory(
        &mut evaluator,
        &JscGameStepFactoryCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            scope_json: None,
        },
    );
    let run = call_jsc_game_step_run(
        &mut evaluator,
        &JscGameStepRunRequest {
            run_handle_id: "jsc:step:1".to_string(),
            ctx_json: None,
        },
    );

    assert!(!factory.ok);
    assert_eq!(
        factory.error.unwrap().code,
        JscEvaluationErrorCode::UnsupportedRuntime
    );
    assert!(!run.ok);
    assert_eq!(
        run.error.unwrap().code,
        JscEvaluationErrorCode::UnsupportedRuntime
    );
}

#[test]
fn evaluator_helper_returns_backend_success_response() {
    struct NamespaceEvaluator;

    impl JscModuleEvaluator for NamespaceEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(format!(
                "{}:{}",
                request.module.package_id, request.module.asset_name
            )))
        }
    }

    let mut evaluator = NamespaceEvaluator;
    let response = evaluate_jsc_module(
        &mut evaluator,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(response.ok);
    assert_eq!(
        response.module_namespace_id,
        Some("runtime.chapter.native-ui:scripts/opening.js".to_string())
    );
}

#[test]
fn evaluator_helper_registers_successful_namespaces() {
    struct NamespaceEvaluator;

    impl JscModuleEvaluator for NamespaceEvaluator {
        fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
            Ok(JscEvaluationResponse::success(jsc_module_namespace_id(
                &request.module,
            )))
        }
    }

    let mut evaluator = NamespaceEvaluator;
    let mut registry = JscModuleNamespaceRegistry::new();
    let request = request_for_asset("scripts/opening.js", vec![1, 2, 3]);
    let response = evaluate_jsc_module_with_registry(&mut evaluator, &mut registry, &request);

    assert!(response.ok);
    let namespace_id = response.module_namespace_id.unwrap();
    assert!(registry.contains(&namespace_id));
    assert_eq!(
        registry.get(&namespace_id).unwrap().package_id,
        "runtime.chapter.native-ui"
    );
    assert_eq!(registry.summary().module_bytes, 3);
}

#[test]
fn evaluator_helper_does_not_register_failed_namespaces() {
    let mut evaluator = UnsupportedJscModuleEvaluator;
    let mut registry = JscModuleNamespaceRegistry::new();
    let response = evaluate_jsc_module_with_registry(
        &mut evaluator,
        &mut registry,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(!response.ok);
    assert!(registry.is_empty());
}
