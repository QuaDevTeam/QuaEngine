use super::super::*;
use super::support::request_for_asset;

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
    let response =
        evaluate_quickjs_module(&mut evaluator, &request_for_asset("../opening.js", vec![1]));

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
fn export_call_helper_validates_request_before_calling_backend() {
    #[derive(Default)]
    struct CountingEvaluator {
        calls: usize,
    }

    impl QuickJsModuleEvaluator for CountingEvaluator {
        fn evaluate_module(
            &mut self,
            _request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            Ok(QuickJsEvaluationResponse::success("unused"))
        }

        fn call_module_export(
            &mut self,
            _request: &QuickJsModuleExportCallRequest,
        ) -> QuickJsModuleExportCallResult {
            self.calls += 1;
            Ok(QuickJsModuleExportCallResponse::success(Some(
                "null".to_string(),
            )))
        }
    }

    let mut evaluator = CountingEvaluator::default();
    let response = call_quickjs_module_export(
        &mut evaluator,
        &QuickJsModuleExportCallRequest {
            module_namespace_id: "quickjs:rquickjs:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("{\"not\":\"array\"}".to_string()),
        },
    );

    assert!(!response.ok);
    assert_eq!(evaluator.calls, 0);
    assert_eq!(
        response.error.unwrap().code,
        QuickJsEvaluationErrorCode::InvalidArguments
    );
}

#[test]
fn unsupported_evaluator_returns_structured_export_call_error() {
    let mut evaluator = UnsupportedQuickJsModuleEvaluator;
    let response = call_quickjs_module_export(
        &mut evaluator,
        &QuickJsModuleExportCallRequest {
            module_namespace_id: "quickjs:rquickjs:1".to_string(),
            export_name: "default".to_string(),
            args_json: None,
        },
    );

    assert!(!response.ok);
    let error = response.error.unwrap();
    assert_eq!(error.code, QuickJsEvaluationErrorCode::UnsupportedRuntime);
    assert_eq!(
        error.detail,
        Some(
            "No QuickJS evaluator backend has been installed for namespace \"quickjs:rquickjs:1\"."
                .to_string()
        )
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

#[test]
fn evaluator_helper_registers_successful_namespaces() {
    struct NamespaceEvaluator;

    impl QuickJsModuleEvaluator for NamespaceEvaluator {
        fn evaluate_module(
            &mut self,
            request: &QuickJsEvaluationRequest,
        ) -> QuickJsEvaluationResult {
            Ok(QuickJsEvaluationResponse::success(
                quickjs_module_namespace_id(&request.module),
            ))
        }
    }

    let mut evaluator = NamespaceEvaluator;
    let mut registry = QuickJsModuleNamespaceRegistry::new();
    let request = request_for_asset("scripts/opening.js", vec![1, 2, 3]);
    let response = evaluate_quickjs_module_with_registry(&mut evaluator, &mut registry, &request);

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
    let mut evaluator = UnsupportedQuickJsModuleEvaluator;
    let mut registry = QuickJsModuleNamespaceRegistry::new();
    let response = evaluate_quickjs_module_with_registry(
        &mut evaluator,
        &mut registry,
        &request_for_asset("scripts/opening.js", vec![1, 2, 3]),
    );

    assert!(!response.ok);
    assert!(registry.is_empty());
}
