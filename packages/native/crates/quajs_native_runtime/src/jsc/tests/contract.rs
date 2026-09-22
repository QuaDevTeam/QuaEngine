use super::super::*;

#[test]
fn reports_explicit_jsc_runtime_version() {
    let version = jsc_runtime_version();

    assert!(!version.trim().is_empty());
    assert_ne!(version, "pending");
}

#[test]
fn serializes_jsc_evaluation_request_with_ts_field_names() {
    let request = JscEvaluationRequest {
        module: JscRuntimeModuleRecord {
            asset_name: "scripts/opening.js".to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: JscRuntimeModuleKind::Script,
            code: "export default function opening() {}".to_string(),
            bytes: vec![1, 2, 3],
        },
        module_graph: vec![JscRuntimeModuleRecord {
            asset_name: "scripts/helper.js".to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: JscRuntimeModuleKind::Script,
            code: "export const helper = true".to_string(),
            bytes: vec![4, 5, 6],
        }],
        limits: JscSandboxLimits::default(),
    };

    let json = serde_json::to_value(request).unwrap();

    assert_eq!(json["module"]["assetName"], "scripts/opening.js");
    assert_eq!(json["module"]["bundleName"], "runtime.chapter.native-ui");
    assert_eq!(json["module"]["packageId"], "runtime.chapter.native-ui");
    assert_eq!(json["module"]["kind"], "script");
    assert_eq!(json["moduleGraph"][0]["assetName"], "scripts/helper.js");
    assert_eq!(
        json["moduleGraph"][0]["bytes"],
        serde_json::json!([4, 5, 6])
    );
    assert_eq!(json["limits"]["maxModuleBytes"], 4 * 1024 * 1024);
}

#[test]
fn serializes_evaluation_success_and_error_responses() {
    let success = JscEvaluationResponse::success("runtime.chapter.native-ui:scripts/opening.js");
    let error = JscEvaluationResponse::error(JscEvaluationError {
        code: JscEvaluationErrorCode::UnsupportedRuntime,
        message: "JavaScriptCore host is not initialized.".to_string(),
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
    let request = JscModuleExportCallRequest {
        module_namespace_id: "jsc:1".to_string(),
        export_name: "default".to_string(),
        args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
    };
    let success = JscModuleExportCallResponse::success(Some("{\"ok\":true}".to_string()));
    let error = JscModuleExportCallResponse::error(JscEvaluationError {
        code: JscEvaluationErrorCode::MissingExport,
        message: "Missing export.".to_string(),
        asset_name: None,
        detail: None,
    });

    let request_json = serde_json::to_value(request).unwrap();
    let success_json = serde_json::to_value(success).unwrap();
    let error_json = serde_json::to_value(error).unwrap();

    assert_eq!(request_json["moduleNamespaceId"], "jsc:1");
    assert_eq!(request_json["exportName"], "default");
    assert_eq!(request_json["argsJson"], "[{\"scene\":\"opening\"}]");
    assert_eq!(success_json["ok"], true);
    assert_eq!(success_json["valueJson"], "{\"ok\":true}");
    assert_eq!(error_json["ok"], false);
    assert_eq!(error_json["error"]["code"], "missingExport");
}

#[test]
fn serializes_game_step_factory_and_run_requests_and_responses() {
    let factory_request = JscGameStepFactoryCallRequest {
        module_namespace_id: "jsc:1".to_string(),
        export_name: "default".to_string(),
        scope_json: Some("{\"route\":\"main\"}".to_string()),
    };
    let factory_success = JscGameStepFactoryCallResponse::success(vec![JscGameStepDescriptor {
        uuid: "intro.1".to_string(),
        run_handle_id: "jsc:step:1".to_string(),
        metadata_json: Some("{\"title\":\"Opening\"}".to_string()),
    }]);
    let run_request = JscGameStepRunRequest {
        run_handle_id: "jsc:step:1".to_string(),
        ctx_json: Some("{\"stepId\":\"intro.1\"}".to_string()),
    };
    let resume_request = JscGameStepResumeRequest {
        resume_handle_id: "jsc:resume:1".to_string(),
        payload_json: Some("{\"choiceId\":\"go\"}".to_string()),
    };
    let run_error = JscGameStepRunResponse::error(JscEvaluationError {
        code: JscEvaluationErrorCode::MissingRunHandle,
        message: "Missing run handle.".to_string(),
        asset_name: None,
        detail: None,
    });
    let run_success = JscGameStepRunResponse::success(vec![JscGameStepCommand {
        target: "engine".to_string(),
        method: "showChoices".to_string(),
        args_json: Some("[[{\"id\":\"go\",\"text\":\"Go\"}]]".to_string()),
    }]);
    let pending_run = JscGameStepRunResponse::pending(
        Vec::new(),
        JscGameStepWaitRequest {
            resume_handle_id: "jsc:resume:1".to_string(),
            event: "user/choice_select".to_string(),
        },
    );
    let pending_translation_run = JscGameStepRunResponse::pending_translation(
        Vec::new(),
        JscGameStepTranslationRequest {
            resume_handle_id: "jsc:resume:2".to_string(),
            key: "runtime.greeting".to_string(),
            options_json: Some("{\"values\":{\"name\":\"Mira\"}}".to_string()),
        },
    );
    let pending_pipeline_run = JscGameStepRunResponse::pending_pipeline_emit(
        Vec::new(),
        JscGameStepPipelineEmitRequest {
            resume_handle_id: "jsc:resume:3".to_string(),
            event: "plugin/custom_event".to_string(),
            payload_json: Some("{\"ok\":true}".to_string()),
        },
    );
    let pending_helper_run = JscGameStepRunResponse::pending_helper_call(
        Vec::new(),
        JscGameStepHelperCallRequest {
            resume_handle_id: "jsc:resume:4".to_string(),
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

    assert_eq!(factory_request_json["moduleNamespaceId"], "jsc:1");
    assert_eq!(factory_request_json["exportName"], "default");
    assert_eq!(factory_request_json["scopeJson"], "{\"route\":\"main\"}");
    assert_eq!(factory_success_json["ok"], true);
    assert_eq!(factory_success_json["steps"][0]["uuid"], "intro.1");
    assert_eq!(
        factory_success_json["steps"][0]["runHandleId"],
        "jsc:step:1"
    );
    assert_eq!(
        factory_success_json["steps"][0]["metadataJson"],
        "{\"title\":\"Opening\"}"
    );
    assert_eq!(run_request_json["runHandleId"], "jsc:step:1");
    assert_eq!(run_request_json["ctxJson"], "{\"stepId\":\"intro.1\"}");
    assert_eq!(resume_request_json["resumeHandleId"], "jsc:resume:1");
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
        "jsc:resume:1"
    );
    assert_eq!(
        pending_run_json["pendingWait"]["event"],
        "user/choice_select"
    );
    assert_eq!(pending_translation_run_json["ok"], true);
    assert_eq!(
        pending_translation_run_json["pendingTranslation"]["resumeHandleId"],
        "jsc:resume:2"
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
        "jsc:resume:3"
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
        "jsc:resume:4"
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

#[test]
fn serializes_pipeline_listener_dispatch_requests_and_responses() {
    let request = JscPipelineListenerDispatchRequest {
        subscription_id: "jsc:1:pipeline:1".to_string(),
        context_json: "{\"event\":{\"type\":\"plugin/custom_event\",\"payload\":{\"value\":42}}}"
            .to_string(),
    };
    let subscribe = JscPipelineSubscriptionChange {
        op: JscPipelineSubscriptionOperation::Subscribe,
        subscription_id: "jsc:1:pipeline:1".to_string(),
        module_namespace_id: "jsc:1".to_string(),
        event: "plugin/custom_event".to_string(),
    };
    let unsubscribe = JscPipelineSubscriptionChange {
        op: JscPipelineSubscriptionOperation::Unsubscribe,
        ..subscribe.clone()
    };
    let run_response = JscGameStepRunResponse::success(Vec::new())
        .with_pipeline_subscriptions(vec![subscribe.clone()]);
    let dispatch_response = JscPipelineListenerDispatchResponse::success(
        vec![JscGameStepCommand {
            target: "engine".to_string(),
            method: "showDialogue".to_string(),
            args_json: Some("[{\"text\":\"Dispatched\"}]".to_string()),
        }],
        vec![unsubscribe],
    );

    let request_json = serde_json::to_value(request).unwrap();
    let run_response_json = serde_json::to_value(run_response).unwrap();
    let dispatch_response_json = serde_json::to_value(dispatch_response).unwrap();

    assert_eq!(request_json["subscriptionId"], "jsc:1:pipeline:1");
    assert_eq!(
        request_json["contextJson"],
        "{\"event\":{\"type\":\"plugin/custom_event\",\"payload\":{\"value\":42}}}"
    );
    assert_eq!(
        run_response_json["pipelineSubscriptions"][0]["op"],
        "subscribe"
    );
    assert_eq!(
        run_response_json["pipelineSubscriptions"][0]["moduleNamespaceId"],
        "jsc:1"
    );
    assert_eq!(dispatch_response_json["ok"], true);
    assert_eq!(
        dispatch_response_json["commands"][0]["method"],
        "showDialogue"
    );
    assert_eq!(
        dispatch_response_json["pipelineSubscriptions"][0]["op"],
        "unsubscribe"
    );
}
