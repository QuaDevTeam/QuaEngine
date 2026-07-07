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

#[test]
fn serializes_game_step_factory_and_run_requests_and_responses() {
    let factory_request = QuickJsGameStepFactoryCallRequest {
        module_namespace_id: "quickjs:rquickjs:1".to_string(),
        export_name: "default".to_string(),
        scope_json: Some("{\"route\":\"main\"}".to_string()),
    };
    let factory_success =
        QuickJsGameStepFactoryCallResponse::success(vec![QuickJsGameStepDescriptor {
            uuid: "intro.1".to_string(),
            run_handle_id: "quickjs:rquickjs:step:1".to_string(),
            metadata_json: Some("{\"title\":\"Opening\"}".to_string()),
        }]);
    let run_request = QuickJsGameStepRunRequest {
        run_handle_id: "quickjs:rquickjs:step:1".to_string(),
        ctx_json: Some("{\"stepId\":\"intro.1\"}".to_string()),
    };
    let resume_request = QuickJsGameStepResumeRequest {
        resume_handle_id: "quickjs:rquickjs:resume:1".to_string(),
        payload_json: Some("{\"choiceId\":\"go\"}".to_string()),
    };
    let run_error = QuickJsGameStepRunResponse::error(QuickJsEvaluationError {
        code: QuickJsEvaluationErrorCode::MissingRunHandle,
        message: "Missing run handle.".to_string(),
        asset_name: None,
        detail: None,
    });
    let run_success = QuickJsGameStepRunResponse::success(vec![QuickJsGameStepCommand {
        target: "engine".to_string(),
        method: "showChoices".to_string(),
        args_json: Some("[[{\"id\":\"go\",\"text\":\"Go\"}]]".to_string()),
    }]);
    let pending_run = QuickJsGameStepRunResponse::pending(
        Vec::new(),
        QuickJsGameStepWaitRequest {
            resume_handle_id: "quickjs:rquickjs:resume:1".to_string(),
            event: "user/choice_select".to_string(),
        },
    );
    let pending_translation_run = QuickJsGameStepRunResponse::pending_translation(
        Vec::new(),
        QuickJsGameStepTranslationRequest {
            resume_handle_id: "quickjs:rquickjs:resume:2".to_string(),
            key: "runtime.greeting".to_string(),
            options_json: Some("{\"values\":{\"name\":\"Mira\"}}".to_string()),
        },
    );
    let pending_pipeline_run = QuickJsGameStepRunResponse::pending_pipeline_emit(
        Vec::new(),
        QuickJsGameStepPipelineEmitRequest {
            resume_handle_id: "quickjs:rquickjs:resume:3".to_string(),
            event: "plugin/custom_event".to_string(),
            payload_json: Some("{\"ok\":true}".to_string()),
        },
    );
    let pending_helper_run = QuickJsGameStepRunResponse::pending_helper_call(
        Vec::new(),
        QuickJsGameStepHelperCallRequest {
            resume_handle_id: "quickjs:rquickjs:resume:4".to_string(),
            module: "@quajs/plugin-background".to_string(),
            export_name: "setBackgroundWithEngine".to_string(),
            args_json: Some("[\"bg/opening.png\"]".to_string()),
        },
    );

    let factory_request_json = serde_json::to_value(factory_request).unwrap();
    let factory_success_json = serde_json::to_value(factory_success).unwrap();
    let run_success_json = serde_json::to_value(run_success).unwrap();
    let pending_run_json = serde_json::to_value(pending_run).unwrap();
    let pending_translation_run_json = serde_json::to_value(pending_translation_run).unwrap();
    let pending_pipeline_run_json = serde_json::to_value(pending_pipeline_run).unwrap();
    let pending_helper_run_json = serde_json::to_value(pending_helper_run).unwrap();
    let run_request_json = serde_json::to_value(run_request).unwrap();
    let resume_request_json = serde_json::to_value(resume_request).unwrap();
    let run_error_json = serde_json::to_value(run_error).unwrap();

    assert_eq!(
        factory_request_json["moduleNamespaceId"],
        "quickjs:rquickjs:1"
    );
    assert_eq!(factory_request_json["exportName"], "default");
    assert_eq!(factory_request_json["scopeJson"], "{\"route\":\"main\"}");
    assert_eq!(factory_success_json["ok"], true);
    assert_eq!(factory_success_json["steps"][0]["uuid"], "intro.1");
    assert_eq!(
        factory_success_json["steps"][0]["runHandleId"],
        "quickjs:rquickjs:step:1"
    );
    assert_eq!(
        factory_success_json["steps"][0]["metadataJson"],
        "{\"title\":\"Opening\"}"
    );
    assert_eq!(run_request_json["runHandleId"], "quickjs:rquickjs:step:1");
    assert_eq!(run_request_json["ctxJson"], "{\"stepId\":\"intro.1\"}");
    assert_eq!(
        resume_request_json["resumeHandleId"],
        "quickjs:rquickjs:resume:1"
    );
    assert_eq!(resume_request_json["payloadJson"], "{\"choiceId\":\"go\"}");
    assert_eq!(run_success_json["ok"], true);
    assert_eq!(run_success_json["commands"][0]["target"], "engine");
    assert_eq!(run_success_json["commands"][0]["method"], "showChoices");
    assert_eq!(
        run_success_json["commands"][0]["argsJson"],
        "[[{\"id\":\"go\",\"text\":\"Go\"}]]"
    );
    assert_eq!(pending_run_json["ok"], true);
    assert_eq!(pending_run_json["commands"], serde_json::json!([]));
    assert_eq!(
        pending_run_json["pendingWait"]["resumeHandleId"],
        "quickjs:rquickjs:resume:1"
    );
    assert_eq!(
        pending_run_json["pendingWait"]["event"],
        "user/choice_select"
    );
    assert_eq!(pending_translation_run_json["ok"], true);
    assert_eq!(
        pending_translation_run_json["pendingTranslation"]["resumeHandleId"],
        "quickjs:rquickjs:resume:2"
    );
    assert_eq!(
        pending_translation_run_json["pendingTranslation"]["key"],
        "runtime.greeting"
    );
    assert_eq!(
        pending_translation_run_json["pendingTranslation"]["optionsJson"],
        "{\"values\":{\"name\":\"Mira\"}}"
    );
    assert_eq!(pending_pipeline_run_json["ok"], true);
    assert_eq!(
        pending_pipeline_run_json["pendingPipelineEmit"]["resumeHandleId"],
        "quickjs:rquickjs:resume:3"
    );
    assert_eq!(
        pending_pipeline_run_json["pendingPipelineEmit"]["event"],
        "plugin/custom_event"
    );
    assert_eq!(
        pending_pipeline_run_json["pendingPipelineEmit"]["payloadJson"],
        "{\"ok\":true}"
    );
    assert_eq!(pending_helper_run_json["ok"], true);
    assert_eq!(
        pending_helper_run_json["pendingHelperCall"]["resumeHandleId"],
        "quickjs:rquickjs:resume:4"
    );
    assert_eq!(
        pending_helper_run_json["pendingHelperCall"]["module"],
        "@quajs/plugin-background"
    );
    assert_eq!(
        pending_helper_run_json["pendingHelperCall"]["exportName"],
        "setBackgroundWithEngine"
    );
    assert_eq!(
        pending_helper_run_json["pendingHelperCall"]["argsJson"],
        "[\"bg/opening.png\"]"
    );
    assert_eq!(run_error_json["ok"], false);
    assert_eq!(run_error_json["error"]["code"], "missingRunHandle");
}
