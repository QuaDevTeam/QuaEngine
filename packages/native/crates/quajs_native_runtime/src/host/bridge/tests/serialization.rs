use crate::host::bridge::{
    NativeAssetReadRequest, NativeHostApiRequest, NativeHostApiResponse,
    NativeHostApiResponsePayload, NativeQuickJsReleaseNamespaceRequest,
    NativeQuickJsReleasePackageRequest,
};
use crate::quickjs::{QuickJsModuleExportCallRequest, QuickJsModuleExportCallResponse};

use super::helpers::quickjs_request_for_asset;

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

    let call_export = serde_json::to_value(NativeHostApiRequest::CallQuickJsModuleExport(
        QuickJsModuleExportCallRequest {
            module_namespace_id: "quickjs:rquickjs:1".to_string(),
            export_name: "default".to_string(),
            args_json: Some("[{\"scene\":\"opening\"}]".to_string()),
        },
    ))
    .unwrap();
    assert_eq!(call_export["method"], "callQuickJsModuleExport");
    assert_eq!(
        call_export["params"]["moduleNamespaceId"],
        "quickjs:rquickjs:1"
    );
    assert_eq!(call_export["params"]["exportName"], "default");

    let call_response = serde_json::to_value(NativeHostApiResponse::success(
        NativeHostApiResponsePayload::QuickJsExportCall(QuickJsModuleExportCallResponse::success(
            Some("{\"ok\":true}".to_string()),
        )),
    ))
    .unwrap();
    assert_eq!(call_response["payload"]["type"], "quickJsExportCall");
    assert_eq!(
        call_response["payload"]["value"]["valueJson"],
        "{\"ok\":true}"
    );

    let release_namespace = serde_json::to_value(
        NativeHostApiRequest::ReleaseQuickJsModuleNamespace(NativeQuickJsReleaseNamespaceRequest {
            module_namespace_id: "quickjs:module:1".to_string(),
        }),
    )
    .unwrap();
    assert_eq!(release_namespace["method"], "releaseQuickJsModuleNamespace");
    assert_eq!(
        release_namespace["params"]["moduleNamespaceId"],
        "quickjs:module:1"
    );

    let package_summary =
        serde_json::to_value(NativeHostApiRequest::GetQuickJsPackageNamespaceSummary(
            NativeQuickJsReleasePackageRequest {
                package_id: "runtime.chapter.native-ui".to_string(),
            },
        ))
        .unwrap();
    assert_eq!(
        package_summary["method"],
        "getQuickJsPackageNamespaceSummary"
    );
    assert_eq!(
        package_summary["params"]["packageId"],
        "runtime.chapter.native-ui"
    );
}
