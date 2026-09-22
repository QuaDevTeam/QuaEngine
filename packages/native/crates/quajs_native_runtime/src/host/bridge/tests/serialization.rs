use crate::host::bridge::{
    NativeAssetReadRequest, NativeHostApiRequest, NativeHostApiResponse,
    NativeHostApiResponsePayload, NativeJscReleaseNamespaceRequest, NativeJscReleasePackageRequest,
    NativeRendererIntent,
};
use crate::jsc::{JscModuleExportCallRequest, JscModuleExportCallResponse};

use super::helpers::jsc_request_for_asset;

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

    let jsc_request =
        NativeHostApiRequest::EvaluateJscModule(jsc_request_for_asset("scripts/opening.js"));
    let jsc_json = serde_json::to_value(jsc_request).unwrap();
    assert_eq!(jsc_json["method"], "evaluateJscModule");
    assert_eq!(
        jsc_json["params"]["module"]["assetName"],
        "scripts/opening.js"
    );

    let call_export = serde_json::to_value(NativeHostApiRequest::CallJscModuleExport(
        JscModuleExportCallRequest {
            module_namespace_id: "jsc:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
        },
    ))
    .unwrap();
    assert_eq!(call_export["method"], "callJscModuleExport");
    assert_eq!(call_export["params"]["moduleNamespaceId"], "jsc:1");
    assert_eq!(call_export["params"]["exportName"], "default");

    let call_response = serde_json::to_value(NativeHostApiResponse::success(
        NativeHostApiResponsePayload::JscExportCall(JscModuleExportCallResponse::success(Some(
            "{\"ok\":true}".to_string(),
        ))),
    ))
    .unwrap();
    assert_eq!(call_response["payload"]["type"], "jscExportCall");
    assert_eq!(
        call_response["payload"]["value"]["valueJson"],
        "{\"ok\":true}"
    );

    let release_namespace = serde_json::to_value(NativeHostApiRequest::ReleaseJscModuleNamespace(
        NativeJscReleaseNamespaceRequest {
            module_namespace_id: "jsc:module:1".to_string(),
        },
    ))
    .unwrap();
    assert_eq!(release_namespace["method"], "releaseJscModuleNamespace");
    assert_eq!(
        release_namespace["params"]["moduleNamespaceId"],
        "jsc:module:1"
    );

    let package_summary = serde_json::to_value(
        NativeHostApiRequest::GetJscPackageNamespaceSummary(NativeJscReleasePackageRequest {
            package_id: "runtime.chapter.native-ui".to_string(),
        }),
    )
    .unwrap();
    assert_eq!(package_summary["method"], "getJscPackageNamespaceSummary");
    assert_eq!(
        package_summary["params"]["packageId"],
        "runtime.chapter.native-ui"
    );

    let drain_request = serde_json::to_value(NativeHostApiRequest::DrainRendererIntents).unwrap();
    assert_eq!(drain_request["method"], "drainRendererIntents");
    assert!(drain_request.get("params").is_none());

    let intent_response = serde_json::to_value(NativeHostApiResponse::success(
        NativeHostApiResponsePayload::RendererIntents(vec![NativeRendererIntent {
            r#type: "choice/select".to_string(),
            payload_json: Some("{\"choiceId\":\"stay\"}".to_string()),
        }]),
    ))
    .unwrap();
    assert_eq!(intent_response["payload"]["type"], "rendererIntents");
    assert_eq!(
        intent_response["payload"]["value"][0]["type"],
        "choice/select"
    );
    assert_eq!(
        intent_response["payload"]["value"][0]["payloadJson"],
        "{\"choiceId\":\"stay\"}"
    );
}
