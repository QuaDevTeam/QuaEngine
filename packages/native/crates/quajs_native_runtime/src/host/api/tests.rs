use super::*;
use crate::host::{NativeHostInfoBuilder, NativePlatform, NativeProfile};

#[test]
fn serializes_host_api_contracts_with_ts_field_names() {
    let bundle = NativeMountedBundleInfo {
        name: "base".to_string(),
        logical_name: Some("base-assets".to_string()),
        version: Some(2),
        hash: Some("hash".to_string()),
        runtime_package_id: Some("runtime.chapter.1".to_string()),
    };
    let asset_request = NativeAssetReadRequest {
        url: "images/bg.png".to_string(),
        bundle_name: Some("base".to_string()),
        asset_id: Some("bg".to_string()),
    };
    let signature_request = NativeSignatureVerifyRequest {
        bytes: vec![1, 2],
        signature: vec![3, 4],
        key_id: Some("test-key".to_string()),
        algorithm: Some("ed25519".to_string()),
    };
    let intent = NativeRendererIntent {
        r#type: "ui/intent".to_string(),
        payload_json: Some("{\"action\":\"close\"}".to_string()),
    };

    let bundle_json = serde_json::to_value(bundle).unwrap();
    let asset_json = serde_json::to_value(asset_request).unwrap();
    let signature_json = serde_json::to_value(signature_request).unwrap();
    let intent_json = serde_json::to_value(intent).unwrap();

    assert_eq!(bundle_json["logicalName"], "base-assets");
    assert_eq!(bundle_json["runtimePackageId"], "runtime.chapter.1");
    assert_eq!(asset_json["bundleName"], "base");
    assert_eq!(asset_json["assetId"], "bg");
    assert_eq!(signature_json["keyId"], "test-key");
    assert_eq!(intent_json["type"], "ui/intent");
    assert_eq!(intent_json["payloadJson"], "{\"action\":\"close\"}");
}

#[test]
fn in_memory_host_reads_assets_storage_bundles_and_intents_without_external_io() {
    let bundle = NativeMountedBundleInfo {
        name: "base".to_string(),
        logical_name: None,
        version: Some(1),
        hash: None,
        runtime_package_id: None,
    };
    let mut host = InMemoryNativeHostApi::new(host_info())
        .with_asset("images/bg.png", vec![1, 2, 3])
        .with_mounted_bundle(bundle.clone());

    assert_eq!(host.host_info().app.bundle_id, "dev.quajs.fixture");
    assert_eq!(
        host.read_asset_bytes(&NativeAssetReadRequest {
            url: "images/bg.png".to_string(),
            bundle_name: None,
            asset_id: None,
        })
        .unwrap(),
        vec![1, 2, 3]
    );
    assert_eq!(host.list_mounted_bundles().unwrap(), vec![bundle]);

    host.write_storage("profile/save-1", vec![9, 8, 7]).unwrap();
    host.write_storage("settings/global", vec![1]).unwrap();

    assert_eq!(
        host.read_storage("profile/save-1").unwrap(),
        Some(vec![9, 8, 7])
    );
    assert_eq!(
        host.list_storage_keys("profile/").unwrap(),
        vec!["profile/save-1".to_string()]
    );

    host.delete_storage("profile/save-1").unwrap();
    assert_eq!(host.read_storage("profile/save-1").unwrap(), None);

    host.emit_renderer_intent(NativeRendererIntent {
        r#type: "ui/intent".to_string(),
        payload_json: None,
    })
    .unwrap();
    assert_eq!(host.renderer_intents().len(), 1);
}

#[test]
fn in_memory_host_rejects_missing_assets_empty_storage_keys_and_unwired_crypto() {
    let mut host = InMemoryNativeHostApi::new(host_info());

    assert_eq!(
        host.read_asset_bytes(&NativeAssetReadRequest {
            url: "missing.png".to_string(),
            bundle_name: None,
            asset_id: None,
        })
        .unwrap_err(),
        NativeHostApiError::AssetNotFound("missing.png".to_string())
    );
    assert_eq!(
        host.write_storage(" ", vec![1]).unwrap_err(),
        NativeHostApiError::InvalidRequest("Native storage key must not be empty.".to_string())
    );
    assert!(matches!(
        host.hash_bytes(&[1, 2, 3], "sha256").unwrap_err(),
        NativeHostApiError::UnsupportedOperation(_)
    ));
    assert!(matches!(
        host.verify_signature(&NativeSignatureVerifyRequest {
            bytes: vec![1],
            signature: vec![2],
            key_id: None,
            algorithm: None,
        })
        .unwrap_err(),
        NativeHostApiError::UnsupportedOperation(_)
    ));
}

fn host_info() -> NativeHostInfo {
    NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
        .app_version("1.0.0")
        .build_number("100")
        .profile(NativeProfile::Debug)
        .platform(NativePlatform::MacOs)
        .arch("arm64")
        .build()
}
