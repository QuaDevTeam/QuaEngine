use crate::host::bridge::{
    dispatch_native_host_api_request, NativeAssetReadRequest, NativeHostApiHashBytesRequest,
    NativeHostApiListStorageKeysRequest, NativeHostApiRequest, NativeHostApiResponsePayload,
    NativeHostApiStorageKeyRequest, NativeHostApiWriteStorageRequest, NativeRendererIntent,
};
use crate::host::{InMemoryNativeHostApi, NativeHostApiErrorCode};

use super::helpers::host_info;

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
    assert_eq!(host.renderer_intents()[0].r#type, "ui/intent");
    assert_eq!(
        host.renderer_intents()[0].payload_json.as_deref(),
        Some("{\"action\":\"close\"}")
    );
}

#[test]
fn serializes_renderer_intent_requests_with_ts_wire_fields() {
    let request = NativeHostApiRequest::EmitRendererIntent(NativeRendererIntent {
        r#type: "choice/select".to_string(),
        payload_json: Some("{\"choiceId\":\"stay\"}".to_string()),
    });

    let json = serde_json::to_value(request).unwrap();

    assert_eq!(json["method"], "emitRendererIntent");
    assert_eq!(json["params"]["type"], "choice/select");
    assert_eq!(json["params"]["payloadJson"], "{\"choiceId\":\"stay\"}");
    assert!(json["params"].get("payload_json").is_none());
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
