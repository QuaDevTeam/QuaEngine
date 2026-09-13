use super::*;

#[test]
fn serializes_host_info_with_ts_contract_field_names() {
    let capability = RendererCapability {
        id: "native-wgpu.ui.surface@1".to_string(),
        target: "native".to_string(),
        version: "1.0.0".to_string(),
        owner_package: "@quajs/native-renderer".to_string(),
        projection_keys: vec!["view.ui.overlays".to_string()],
        intent_events: vec!["ui/intent".to_string()],
        asset_kinds: vec!["data".to_string()],
        qss_features: vec!["background-color".to_string()],
        qui_components: vec!["Box".to_string()],
        fallback: "reject-package".to_string(),
    };
    let host_info = NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
        .app_version("1.2.3")
        .build_number("42")
        .profile(NativeProfile::Release)
        .platform(NativePlatform::MacOs)
        .arch("arm64")
        .renderer_version("0.9.0")
        .backend_version(Some("wgpu-test"))
        .quickjs_version("quickjs-test")
        .capabilities(vec![capability])
        .build();
    let json = serde_json::to_value(&host_info).unwrap();

    assert_eq!(json["app"]["bundleId"], "dev.quajs.fixture");
    assert_eq!(json["app"]["profile"], "release");
    assert_eq!(json["app"]["platform"], "macos");
    assert_eq!(json["renderer"]["packageName"], "@quajs/native-renderer");
    assert_eq!(json["renderer"]["backendVersion"], "wgpu-test");
    assert_eq!(
        json["renderer"]["capabilityManifestHash"],
        host_info.renderer.capability_manifest_hash
    );
    assert_eq!(
        json["renderer"]["capabilities"][0]["ownerPackage"],
        "@quajs/native-renderer"
    );
    assert_eq!(
        json["renderer"]["capabilities"][0]["projectionKeys"][0],
        "view.ui.overlays"
    );
    assert_eq!(
        json["renderer"]["capabilities"][0]["intentEvents"][0],
        "ui/intent"
    );
    assert_eq!(json["renderer"]["capabilities"][0]["assetKinds"][0], "data");
    assert_eq!(
        json["renderer"]["capabilities"][0]["qssFeatures"][0],
        "background-color"
    );
    assert_eq!(
        json["renderer"]["capabilities"][0]["quiComponents"][0],
        "Box"
    );
    assert_eq!(json["runtime"]["quickjsVersion"], "quickjs-test");
    assert!(host_info.has_capability("native-wgpu.ui.surface@1"));
}

#[test]
fn computes_stable_capability_manifest_hashes() {
    let mut capabilities = vec![RendererCapability {
        id: "native-wgpu.ui.surface@1".to_string(),
        target: "native".to_string(),
        version: "1.0.0".to_string(),
        owner_package: "@quajs/native-renderer".to_string(),
        projection_keys: vec!["view.ui.overlays".to_string()],
        intent_events: vec!["ui/intent".to_string()],
        asset_kinds: vec!["data".to_string()],
        qss_features: vec!["background-color".to_string()],
        qui_components: vec!["Box".to_string()],
        fallback: "reject-package".to_string(),
    }];

    let hash = capability_manifest_hash(&capabilities);
    let same_hash = capability_manifest_hash(&capabilities);
    capabilities[0]
        .qss_features
        .push("border-radius".to_string());
    let changed_hash = capability_manifest_hash(&capabilities);

    assert!(hash.starts_with("sha256:"));
    assert_eq!(hash.len(), "sha256:".len() + 64);
    assert_eq!(hash, same_hash);
    assert_ne!(hash, changed_hash);
}

#[test]
fn omits_absent_optional_fields_from_host_info_contract_json() {
    let host_info = NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
        .capabilities(vec![RendererCapability {
            id: "native-wgpu.stage-layout@1".to_string(),
            target: "native".to_string(),
            version: "1.0.0".to_string(),
            owner_package: "@quajs/native-renderer".to_string(),
            projection_keys: vec!["QuaViewProjection.layout".to_string()],
            intent_events: Vec::new(),
            asset_kinds: Vec::new(),
            qss_features: Vec::new(),
            qui_components: Vec::new(),
            fallback: "reject-package".to_string(),
        }])
        .build();
    let json = serde_json::to_value(&host_info).unwrap();
    let renderer = json["renderer"].as_object().unwrap();
    let capability = json["renderer"]["capabilities"][0].as_object().unwrap();

    assert!(!renderer.contains_key("backendVersion"));
    assert!(!capability.contains_key("intentEvents"));
    assert!(!capability.contains_key("assetKinds"));
    assert!(!capability.contains_key("qssFeatures"));
    assert!(!capability.contains_key("quiComponents"));
}
